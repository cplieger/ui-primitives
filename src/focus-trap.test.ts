// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";

import { trapFocus } from "./focus-trap.js";

// happy-dom does no layout, so `offsetParent` is null for every element. The
// focus-trap filters to `offsetParent !== null`; stub it per element so the
// visibility filter treats our test elements as visible.
function visibleButton(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  Object.defineProperty(btn, "offsetParent", { configurable: true, get: () => document.body });
  return btn;
}

function mount(...labels: string[]): { container: HTMLElement; buttons: HTMLButtonElement[] } {
  const container = document.createElement("div");
  const buttons = labels.map((l) => visibleButton(l));
  container.append(...buttons);
  document.body.appendChild(container);
  return { container, buttons };
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
    const evt = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    release();
  });

  it("cycles from first to last on Shift+Tab at the start edge", () => {
    const { container, buttons } = mount("a", "b");
    const release = trapFocus(container);
    buttons[0]!.focus();
    const evt = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[1]);
    release();
  });

  it("does not intercept Tab in the middle of the list", () => {
    const { container, buttons } = mount("a", "b", "c");
    const release = trapFocus(container);
    buttons[1]!.focus();
    const evt = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    release();
  });

  it("restores focus to the previously-focused element on release", () => {
    const outside = visibleButton("outside");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const { container } = mount("a");
    const release = trapFocus(container, { returnFocus: true });
    release();
    expect(document.activeElement).toBe(outside);
  });

  it("focuses an explicit returnFocus element on release", () => {
    const target = visibleButton("target");
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
});
