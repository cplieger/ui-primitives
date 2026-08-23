import { describe, it, expect, afterEach, vi } from "vitest";

import { rovingFocus } from "./roving-focus.js";

afterEach(() => {
  document.body.replaceChildren();
});

function menu(labels: string[]): { container: HTMLElement; items: HTMLButtonElement[] } {
  const container = document.createElement("div");
  const items = labels.map((l) => {
    const b = document.createElement("button");
    b.textContent = l;
    b.className = "item";
    container.appendChild(b);
    return b;
  });
  document.body.appendChild(container);
  return { container, items };
}

function key(container: HTMLElement, k: string): void {
  container.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}

describe("rovingFocus", () => {
  it("assigns a single Tab stop up front (first item 0, rest -1)", () => {
    const { container, items } = menu(["a", "b", "c"]);
    rovingFocus(container, ".item");
    expect(items.map((i) => i.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("ArrowDown/ArrowUp move focus with wrap-around; Home/End jump", () => {
    const { container, items } = menu(["a", "b", "c"]);
    rovingFocus(container, ".item");
    items[0]?.focus();

    key(container, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    key(container, "ArrowDown");
    expect(document.activeElement).toBe(items[2]);
    key(container, "ArrowDown"); // wraps
    expect(document.activeElement).toBe(items[0]);
    key(container, "ArrowUp"); // wraps back
    expect(document.activeElement).toBe(items[2]);
    key(container, "Home");
    expect(document.activeElement).toBe(items[0]);
    key(container, "End");
    expect(document.activeElement).toBe(items[2]);
  });

  it("wrap: false clamps at the edges", () => {
    const { container, items } = menu(["a", "b"]);
    rovingFocus(container, ".item", { wrap: false });
    items[1]?.focus();
    key(container, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    items[0]?.focus();
    key(container, "ArrowUp");
    expect(document.activeElement).toBe(items[0]);
  });

  it("horizontal orientation uses Left/Right and ignores Up/Down", () => {
    const { container, items } = menu(["a", "b"]);
    rovingFocus(container, ".item", { orientation: "horizontal" });
    items[0]?.focus();
    key(container, "ArrowRight");
    expect(document.activeElement).toBe(items[1]);
    key(container, "ArrowDown"); // not handled
    expect(document.activeElement).toBe(items[1]);
    key(container, "ArrowLeft");
    expect(document.activeElement).toBe(items[0]);
  });

  it("Enter/Space activate the focused item exactly once; activate: false leaves keys alone", () => {
    const { container, items } = menu(["a"]);
    const nav = rovingFocus(container, ".item");
    const clicked = vi.fn();
    items[0]?.addEventListener("click", clicked);
    items[0]?.focus();
    key(container, "Enter");
    expect(clicked).toHaveBeenCalledTimes(1);
    key(container, " ");
    expect(clicked).toHaveBeenCalledTimes(2);
    nav.dispose();

    rovingFocus(container, ".item", { activate: false });
    key(container, "Enter");
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  it("focus moving into an item rolls the Tab stop onto it", () => {
    const { container, items } = menu(["a", "b", "c"]);
    rovingFocus(container, ".item");
    items[2]?.focus();
    items[2]?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(items.map((i) => i.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
  });

  it("navigates dynamically added items (live query) and refresh() re-applies tabindex", () => {
    const { container, items } = menu(["a"]);
    const nav = rovingFocus(container, ".item");
    const added = document.createElement("button");
    added.className = "item";
    container.appendChild(added);

    items[0]?.focus();
    key(container, "ArrowDown");
    expect(document.activeElement).toBe(added);

    // Brand-new items have no tabindex until refresh restores the invariant.
    nav.refresh();
    expect(items[0]?.getAttribute("tabindex")).toBe("-1");
    expect(added.getAttribute("tabindex")).toBe("0"); // focused item keeps the stop
  });

  it("focusFirst focuses the first item", () => {
    const { container, items } = menu(["a", "b"]);
    const nav = rovingFocus(container, ".item");
    nav.focusFirst();
    expect(document.activeElement).toBe(items[0]);
  });

  it("dispose removes the listeners", () => {
    const { container, items } = menu(["a", "b"]);
    const nav = rovingFocus(container, ".item");
    items[0]?.focus();
    nav.dispose();
    key(container, "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
  });

  it("is a no-op on an empty container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const nav = rovingFocus(container, ".item");
    key(container, "ArrowDown"); // must not throw
    expect(nav).toBeDefined();
    nav.dispose();
  });
});

/** A cancelable keydown, so `defaultPrevented` reports what the handler did. */
function pressKey(container: HTMLElement, k: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  container.dispatchEvent(e);
  return e;
}

describe("rovingFocus: options that turn behavior off", () => {
  it("homeEnd: false leaves Home and End alone", () => {
    const { container, items } = menu(["a", "b", "c"]);
    rovingFocus(container, ".item", { homeEnd: false });
    items[1]?.focus();
    key(container, "Home");
    expect(document.activeElement).toBe(items[1]);
    key(container, "End");
    expect(document.activeElement).toBe(items[1]);
  });
});

describe("rovingFocus: which keys get their default suppressed", () => {
  it("suppresses the arrow key's default so it cannot also scroll the page", () => {
    const { container, items } = menu(["a", "b"]);
    rovingFocus(container, ".item");
    items[0]?.focus();
    expect(pressKey(container, "ArrowDown").defaultPrevented).toBe(true);
  });

  it("suppresses Enter's default so the item is activated exactly once", () => {
    const { container, items } = menu(["a"]);
    rovingFocus(container, ".item");
    items[0]?.focus();
    expect(pressKey(container, "Enter").defaultPrevented).toBe(true);
  });

  it("leaves Enter's default alone when no item holds focus", () => {
    // Nothing to activate, so the key belongs to whatever else is focused.
    const { container } = menu(["a"]);
    rovingFocus(container, ".item");
    document.body.focus();
    expect(pressKey(container, "Enter").defaultPrevented).toBe(false);
  });

  it("leaves an arrow key's default alone on an empty container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    rovingFocus(container, ".item");
    expect(pressKey(container, "ArrowDown").defaultPrevented).toBe(false);
  });
});

describe("rovingFocus: activation past the first item", () => {
  it("activates whichever item holds focus, not only the first", () => {
    const { container, items } = menu(["a", "b"]);
    rovingFocus(container, ".item");
    const clicked = vi.fn();
    items[1]?.addEventListener("click", clicked);
    items[1]?.focus();
    key(container, "Enter");
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});

describe("rovingFocus: refresh() with focus outside the widget", () => {
  it("keeps the Tab stop on the previously-marked item and adopts new ones", () => {
    // The documented fallback: with focus elsewhere, the item still carrying
    // tabindex=0 keeps the stop, and items added by a re-render join at -1.
    const { container, items } = menu(["a", "b", "c"]);
    const nav = rovingFocus(container, ".item");
    items[2]?.focus();
    items[2]?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(items[2]?.getAttribute("tabindex")).toBe("0");

    const added = document.createElement("button");
    added.className = "item";
    container.appendChild(added);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    nav.refresh();
    expect(added.getAttribute("tabindex")).toBe("-1");
    expect(items[2]?.getAttribute("tabindex")).toBe("0");
  });
});

describe("rovingFocus: dispose", () => {
  it("stops focus from rolling the Tab stop", () => {
    const { container, items } = menu(["a", "b"]);
    const nav = rovingFocus(container, ".item");
    nav.dispose();
    items[1]?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(items.map((i) => i.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });
});

describe("rovingFocus: nothing holds focus at all", () => {
  it("Next from no focus lands on the first item, not the second", () => {
    const { container, items } = menu(["a", "b", "c"]);
    rovingFocus(container, ".item");

    // The "active element is not an element" arm only exists for this state, and
    // happy-dom's default (document.body) is an HTMLElement, so it has to be
    // forced. "The item after none" must resolve to the first item.
    Object.defineProperty(document, "activeElement", { value: null, configurable: true });
    try {
      key(container, "ArrowDown");
    } finally {
      Reflect.deleteProperty(document, "activeElement");
    }

    expect(document.activeElement).toBe(items[0]);
    expect(items.map((i) => i.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });
});
