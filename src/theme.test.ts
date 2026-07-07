// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createTheme, themeInitSnippet, themeInitSnippetFromJSON } from "./theme.js";
import type { ThemeStorage } from "./theme.js";

interface MediaState {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

let media: MediaState;
let originalMatchMedia: typeof window.matchMedia;

function installMatchMedia(state: MediaState): void {
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return state.matches;
    },
    addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      state.listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      state.listeners.delete(cb);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

function fireSystemChange(matches: boolean): void {
  media.matches = matches;
  for (const cb of media.listeners) {
    cb({ matches } as MediaQueryListEvent);
  }
}

/** A single-slot in-memory ThemeStorage adapter (the value IS the preference;
 *  the adapter owns where it lives, so there is no key). */
function memoryStorage(): ThemeStorage {
  let value: string | null = null;
  return {
    get: () => value,
    set: (v) => {
      value = v;
    },
  };
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  media = { matches: false, listeners: new Set() };
  installMatchMedia(media);
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mode");
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("createTheme", () => {
  it("defaults to system and resolves the concrete theme via matchMedia", () => {
    media.matches = true; // system = dark
    const t = createTheme({ storageKey: "k", storage: memoryStorage() });
    expect(t.get()).toBe("system");
    expect(t.resolved()).toBe("dark");
    expect(t.getSystem()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    t.dispose();
  });

  it("set() persists and applies a concrete choice", () => {
    const storage = memoryStorage();
    const t = createTheme({ storageKey: "k", storage });
    t.set("light");
    expect(t.get()).toBe("light");
    expect(t.resolved()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(storage.get()).toBe("light");
    t.dispose();
  });

  it("cycle goes light -> dark -> system -> light", () => {
    const t = createTheme({ storageKey: "k", storage: memoryStorage() });
    t.set("light");
    t.cycle();
    expect(t.get()).toBe("dark");
    t.cycle();
    expect(t.get()).toBe("system");
    t.cycle();
    expect(t.get()).toBe("light");
    t.dispose();
  });

  it("follows the OS while in system, but not once pinned", () => {
    const onChange = vi.fn();
    const t = createTheme({ storageKey: "k", storage: memoryStorage(), onChange });
    expect(t.resolved()).toBe("light");
    fireSystemChange(true); // -> dark
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(onChange).toHaveBeenCalledWith("dark");
    t.set("light"); // pin
    fireSystemChange(false); // system flips, but pinned stays light
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    t.dispose();
  });

  it("reads a persisted preference on creation", () => {
    const storage = memoryStorage();
    storage.set("dark");
    const t = createTheme({ storageKey: "k", storage });
    expect(t.get()).toBe("dark");
    expect(t.resolved()).toBe("dark");
    t.dispose();
  });

  it("dispose removes the matchMedia listener", () => {
    const t = createTheme({ storageKey: "k", storage: memoryStorage() });
    expect(media.listeners.size).toBe(1);
    t.dispose();
    expect(media.listeners.size).toBe(0);
  });

  it("supports a custom attribute", () => {
    const t = createTheme({ storageKey: "k", storage: memoryStorage(), attribute: "data-mode" });
    t.set("dark");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    t.dispose();
  });
});

describe("themeInitSnippet", () => {
  it("returns an IIFE string that applies a stored concrete theme when evaluated", () => {
    localStorage.setItem("snip", "dark");
    const snippet = themeInitSnippet("snip");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem("snip");
  });

  it("resolves a system preference via matchMedia and honors a custom attribute", () => {
    media.matches = true; // dark
    localStorage.setItem("snip", "system");
    const snippet = themeInitSnippet("snip", "data-mode");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    localStorage.removeItem("snip");
  });

  it("escapes the storage key against the <script> context (no raw </script> or line seps)", () => {
    const snippet = themeInitSnippet("</script><x>\u2028\u2029");
    expect(snippet).not.toContain("</script>");
    expect(snippet).not.toContain("\u2028");
    expect(snippet).not.toContain("\u2029");
    expect(snippet).toContain("\\x3C"); // '<' was escaped
  });

  it("still applies the theme when the storage key contains script-breaking characters", () => {
    const key = "</script>\u2028weird";
    localStorage.setItem(key, "dark");
    const snippet = themeInitSnippet(key);
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem(key);
  });

  it("its catch fallback resolves the system preference, not a hardcoded light", () => {
    media.matches = true; // system = dark
    const spy = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const snippet = themeInitSnippet("k");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    // Storage threw → catch runs → resolves system (dark), not a flash of light.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    spy.mockRestore();
  });
});

describe("createTheme — default localStorage adapter", () => {
  it("reads and writes the bare localStorage key when no storage is supplied", () => {
    localStorage.removeItem("dt");
    const t = createTheme({ storageKey: "dt" });
    t.set("dark");
    expect(localStorage.getItem("dt")).toBe("dark"); // persisted to the bare key
    // A fresh controller reads the same key back.
    const t2 = createTheme({ storageKey: "dt" });
    expect(t2.get()).toBe("dark");
    t.dispose();
    t2.dispose();
    localStorage.removeItem("dt");
  });
});

describe("createTheme — custom storage adapter", () => {
  it("reads via adapter.get() on creation and writes via adapter.set() on set()", () => {
    let stored: string | null = "dark";
    let getCalls = 0;
    const writes: string[] = [];
    const storage: ThemeStorage = {
      get: () => {
        getCalls++;
        return stored;
      },
      set: (v) => {
        writes.push(v);
        stored = v;
      },
    };
    const t = createTheme({ storageKey: "unused", storage });
    expect(getCalls).toBeGreaterThan(0); // read the stored preference on creation
    expect(t.get()).toBe("dark");
    t.set("light");
    expect(writes).toEqual(["light"]); // wrote through the adapter
    expect(stored).toBe("light");
    t.dispose();
  });

  it("degrades to in-memory when the adapter throws on get and set", () => {
    const t = createTheme({
      storageKey: "k",
      storage: {
        get: () => {
          throw new Error("blocked");
        },
        set: () => {
          throw new Error("blocked");
        },
      },
    });
    // get() threw → falls back to the "system" default.
    expect(t.get()).toBe("system");
    // set() throws, but the choice still applies in memory.
    expect(() => {
      t.set("dark");
    }).not.toThrow();
    expect(t.get()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    t.dispose();
  });

  it("persists into a JSON blob field via a read-modify-write adapter (vibekit pattern)", () => {
    const KEY = "app.ui-state";
    localStorage.setItem(KEY, JSON.stringify({ sidebar: "open", theme: "dark" }));
    const jsonAdapter: ThemeStorage = {
      get: () => {
        const raw = localStorage.getItem(KEY);
        if (raw === null) {
          return null;
        }
        const parsed = JSON.parse(raw) as { theme?: string };
        return parsed.theme ?? null;
      },
      set: (value) => {
        const raw = localStorage.getItem(KEY);
        const blob = raw !== null ? (JSON.parse(raw) as Record<string, unknown>) : {};
        blob["theme"] = value;
        localStorage.setItem(KEY, JSON.stringify(blob));
      },
    };
    const t = createTheme({ storageKey: KEY, storage: jsonAdapter });
    expect(t.get()).toBe("dark"); // read the theme field out of the blob
    t.set("light"); // read-modify-write the field, preserving siblings
    const after = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    expect(after["theme"]).toBe("light");
    expect(after["sidebar"]).toBe("open"); // sibling field untouched
    t.dispose();
    localStorage.removeItem(KEY);
  });
});

describe("themeInitSnippetFromJSON", () => {
  it("applies a theme read from a JSON blob field when evaluated", () => {
    localStorage.setItem("st", JSON.stringify({ theme: "dark", sidebar: "open" }));
    const snippet = themeInitSnippetFromJSON("st", "theme");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem("st");
  });

  it("honors a custom field and attribute", () => {
    localStorage.setItem("st", JSON.stringify({ mode: "light" }));
    const snippet = themeInitSnippetFromJSON("st", "mode", "data-mode");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
    localStorage.removeItem("st");
  });

  it("resolves the system preference when the field is absent (2-state first paint)", () => {
    media.matches = true; // system = dark
    localStorage.setItem("st", JSON.stringify({ sidebar: "open" })); // no theme field
    const snippet = themeInitSnippetFromJSON("st", "theme");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem("st");
  });

  it('resolves system when the field is exactly "system"', () => {
    media.matches = false; // system = light
    localStorage.setItem("st", JSON.stringify({ theme: "system" }));
    const snippet = themeInitSnippetFromJSON("st", "theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    localStorage.removeItem("st");
  });

  it("escapes the key and field against the <script> context", () => {
    const snippet = themeInitSnippetFromJSON("</script><x>\u2028", "the\u2029me");
    expect(snippet).not.toContain("</script>");
    expect(snippet).not.toContain("\u2028");
    expect(snippet).not.toContain("\u2029");
    expect(snippet).toContain("\\x3C"); // '<' escaped
  });

  it("falls back to the system preference when the blob is malformed JSON", () => {
    media.matches = true; // system = dark
    localStorage.setItem("st", "{not valid json");
    const snippet = themeInitSnippetFromJSON("st", "theme");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    // JSON.parse throws → catch → resolves system (dark), not a flash of light.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    localStorage.removeItem("st");
  });

  it("resolves system when the stored value is not an object (bare number)", () => {
    media.matches = false; // system = light
    localStorage.setItem("st", "123");
    const snippet = themeInitSnippetFromJSON("st", "theme");
    document.documentElement.removeAttribute("data-theme");
    (0, eval)(snippet);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    localStorage.removeItem("st");
  });
});
