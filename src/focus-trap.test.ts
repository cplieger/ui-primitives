// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";

import { trapFocus } from "./focus-trap.js";

// happy-dom does no layout, but `getClientRects()` returns a single rect for
// any *connected* element, so the trap's getClientRects()-based visibility
// filter treats connected elements as focusable with no stubbing. And
// `checkVisibility` is not implemented in happy-dom, so that guard is a no-op.
// We therefore use real, connected elements — no offsetParent/getClientRects
// stub is needed (unlike the previous offsetParent-based filter).
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
});
