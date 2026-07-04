// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createTheme, themeInitSnippet } from "./theme.js";

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

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
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
    expect(storage.getItem("k")).toBe("light");
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
    storage.setItem("k", "dark");
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
