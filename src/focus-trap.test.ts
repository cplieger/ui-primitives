import { describe, it, expect, afterEach, vi } from "vitest";

import { trapFocus } from "./focus-trap.js";

// The trap's visibility filter reads `getClientRects()` and `checkVisibility()`,
// and both mean what they say now that the suite runs in a real browser: a
// detached or `display: none` element reports no rects and fails
// `checkVisibility`, so a hidden element is expressed by actually hiding it
// rather than by stubbing a measurement. Tests that need a specific engine
// shape (an element whose `checkVisibility` rejects only on the visibility
// property, or an older engine with no `checkVisibility` at all) still override
// that one method per element, which is the behavior under test.
function makeButton(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  return btn;
}

function mount(...labels: string[]): { container: HTMLElement; buttons: HTMLButtonElement[] } {
  const container = document.createElement("div");
  const buttons = labels.map((l) => makeButton(l));
  container.append(...buttons);
  document.body.appendChild(container);
  return { container, buttons };
}

function tabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("trapFocus", () => {
  it("focuses the first focusable element on entry", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    expect(document.activeElement).toBe(buttons[0]);
    release();
  });

  it("honors an explicit initialFocus", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container, { initialFocus: buttons[1]! });
    expect(document.activeElement).toBe(buttons[1]);
    release();
  });

  it("cycles from last to first on Tab at the end edge", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    buttons[1]!.focus();
    const evt = tabEvent();
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    release();
  });

  it("cycles from first to last on Shift+Tab at the start edge", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    buttons[0]!.focus();
    const evt = tabEvent(true);
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    release();
  });

  it("does not intercept Tab in the middle of the list", () => {
    const { container, buttons } = mount("a", "b", "c");
    const release = trapFocus(container);
    buttons[1]!.focus();
    const evt = tabEvent();
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    release();
  });

  it("restores focus to the previously-focused element on release", () => {
    const outside = makeButton("outside");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { container } = mount("a");
    const release = trapFocus(container, { returnFocus: true });
    release();
    expect(document.activeElement).toBe(outside);
  });

  it("focuses an explicit returnFocus element on release", () => {
    const target = makeButton("target");
    document.body.appendChild(target);
    const { container } = mount("a");
    const release = trapFocus(container, { returnFocus: target });
    release();
    expect(document.activeElement).toBe(target);
  });

  it("leaves focus untouched when returnFocus is false", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container, { returnFocus: false });
    buttons[1]!.focus();
    release();
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("fails closed with no focusables: focuses the container and blocks Tab from leaving", () => {
    const container = document.createElement("div");
    document.body.appendChild(container); // no focusable descendants
    const release = trapFocus(container);
    expect(container.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(container);

    const evt = tabEvent();
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container); // never escapes
    release();
  });

  it("includes a position:fixed focusable (offsetParent is null; getClientRects is used)", () => {
    const container = document.createElement("div");
    const fixed = makeButton("fixed");
    fixed.style.position = "fixed";
    container.appendChild(fixed);
    document.body.appendChild(container);
    const release = trapFocus(container);
    // It counts as focusable despite a null offsetParent, so it takes the
    // initial focus.
    expect(document.activeElement).toBe(fixed);
    release();
  });

  it("recaptures focus to the first item when Tab is pressed from outside the container", () => {
    const outside = makeButton("outside");
    document.body.appendChild(outside);
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container); // focuses buttons[0]
    outside.focus(); // focus escapes the trap
    expect(document.activeElement).toBe(outside);

    const evt = tabEvent();
    outside.dispatchEvent(evt); // capture-phase listener on document catches it
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]); // pulled back in
    release();
  });

  it("release() does not throw when the returnFocus target is detached (no-op)", () => {
    const detached = makeButton("detached"); // never appended → not connected
    const { container, buttons } = mount("a");
    const release = trapFocus(container, { returnFocus: detached });
    expect(document.activeElement).toBe(buttons[0]);
    expect(() => {
      release();
    }).not.toThrow();
    expect(document.activeElement).not.toBe(detached); // focus not moved to it
  });

  it("initialFocus that is detached is a safe no-op (does not throw or focus it)", () => {
    const detached = makeButton("detached"); // never appended → not connected
    const { container } = mount("a", "b");
    const focusSpy = vi.spyOn(detached, "focus");
    let release: () => void = () => undefined;
    expect(() => {
      release = trapFocus(container, { initialFocus: detached });
    }).not.toThrow();
    // The detached target is never focused (would throw in some engines).
    expect(document.activeElement).not.toBe(detached);
    expect(focusSpy).not.toHaveBeenCalled();
    release();
  });

  it("skips an element with no client rects (display:none) when choosing focus", () => {
    const container = document.createElement("div");
    const unrendered = makeButton("unrendered");
    // `display: none` in a real engine: laid out nowhere, so no client rects.
    unrendered.getClientRects = (): DOMRectList => [] as unknown as DOMRectList;
    const rendered = makeButton("rendered");
    container.append(unrendered, rendered);
    document.body.appendChild(container);
    const release = trapFocus(container);
    expect(document.activeElement).toBe(rendered);
    release();
  });

  it("skips an element checkVisibility rejects on the visibility property", () => {
    const container = document.createElement("div");
    const invisible = makeButton("invisible");
    // Model the platform contract: a `visibility: hidden` element is laid out
    // (it has client rects) and only reports itself invisible when
    // checkVisibility is asked with `{ visibilityProperty: true }`.
    invisible.checkVisibility = (options?: CheckVisibilityOptions): boolean =>
      options?.visibilityProperty !== true;
    const shown = makeButton("shown");
    container.append(invisible, shown);
    document.body.appendChild(container);
    const release = trapFocus(container);
    expect(document.activeElement).toBe(shown);
    release();
  });

  it("treats an element as focusable in an engine without checkVisibility", () => {
    const container = document.createElement("div");
    const btn = makeButton("only");
    // Older engines have no checkVisibility; the guard must not call it.
    Object.defineProperty(btn, "checkVisibility", { value: undefined, configurable: true });
    container.appendChild(btn);
    document.body.appendChild(container);
    let release: () => void = () => undefined;
    expect(() => {
      release = trapFocus(container);
    }).not.toThrow();
    expect(document.activeElement).toBe(btn);
    release();
  });

  it("ignores a key other than Tab", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    buttons[1]!.focus(); // the end edge, where Tab would wrap
    const evt = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[1]); // focus untouched
    release();
  });

  it("does not intercept Shift+Tab in the middle of the list", () => {
    const { container, buttons } = mount("a", "b", "c");
    const release = trapFocus(container);
    buttons[1]!.focus();
    const evt = tabEvent(true);
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[1]);
    release();
  });

  it("pulls focus back to an empty container when Tab is pressed from outside it", () => {
    const outside = makeButton("outside");
    document.body.appendChild(outside);
    const container = document.createElement("div");
    document.body.appendChild(container); // no focusable descendants
    const release = trapFocus(container);
    outside.focus(); // focus escaped the trap
    expect(document.activeElement).toBe(outside);

    const evt = tabEvent();
    outside.dispatchEvent(evt);
    expect(document.activeElement).toBe(container); // re-pinned, not left outside
    release();
  });

  it("sees Tab even when a handler between the target and document stops propagation", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    buttons[1]!.focus();
    container.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });
    const evt = tabEvent();
    buttons[1]!.dispatchEvent(evt);
    expect(document.activeElement).toBe(buttons[0]); // still wrapped
    release();
  });

  it("release() stops intercepting Tab", () => {
    const outside = makeButton("outside");
    document.body.appendChild(outside);
    const { container } = mount("a", "b");
    const release = trapFocus(container);
    release();
    outside.focus();
    const evt = tabEvent();
    outside.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outside); // no longer pulled back in
  });

  it("restores the previously-focused element when returnFocus is omitted", () => {
    const outside = makeButton("outside");
    document.body.appendChild(outside);
    outside.focus();
    const { container, buttons } = mount("a");
    const release = trapFocus(container); // no options at all
    expect(document.activeElement).toBe(buttons[0]);
    release();
    expect(document.activeElement).toBe(outside);
  });
});
