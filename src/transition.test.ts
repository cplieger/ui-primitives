import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { afterTransition, forceReflow } from "./transition.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("forceReflow", () => {
  it("reads a layout property so a pending style change is flushed", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    // A forced reflow leaves no observable state behind: the flush IS the
    // read, so that a layout property is read at all is the whole contract.
    // Any of them would do; this pins that one of them is.
    const read = vi.spyOn(el, "getBoundingClientRect");
    forceReflow(el);
    expect(read).toHaveBeenCalled();
  });
});

describe("afterTransition", () => {
  it("runs the callback once on a transitionend whose target is the element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    afterTransition(el, cb, 400);
    el.dispatchEvent(new Event("transitionend"));
    el.dispatchEvent(new Event("transitionend")); // a second event must not re-run
    expect(cb).toHaveBeenCalledOnce();
  });

  it("ignores a transitionend that bubbles up from a descendant", () => {
    const el = document.createElement("div");
    const child = document.createElement("span");
    el.appendChild(child);
    document.body.appendChild(el);
    const cb = vi.fn();
    afterTransition(el, cb, 400);
    child.dispatchEvent(new Event("transitionend", { bubbles: true }));
    expect(cb).not.toHaveBeenCalled(); // descendant transition is not the element's own
    el.dispatchEvent(new Event("transitionend")); // the element's own transition still settles it
    expect(cb).toHaveBeenCalledOnce();
  });

  it("runs the callback via the fallback timeout when transitionend never fires", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    afterTransition(el, cb, 400);
    vi.advanceTimersByTime(399);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("cancel() prevents the callback; a later transitionend and the fallback are no-ops", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const cb = vi.fn();
    const cancel = afterTransition(el, cb, 400);
    cancel();
    el.dispatchEvent(new Event("transitionend"));
    vi.advanceTimersByTime(400);
    expect(cb).not.toHaveBeenCalled();
  });
});
