import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createDialog, openDialog, closeDialog, wireBackdropDismiss } from "./dialog.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function makeDialog(): HTMLDialogElement {
  const d = document.createElement("dialog");
  document.body.appendChild(d);
  return d;
}

describe("openDialog / closeDialog", () => {
  it("openDialog opens the dialog", () => {
    const d = makeDialog();
    openDialog(d);
    expect(d.open).toBe(true);
  });

  it("closeDialog adds is-leaving, then closes + fires onClosed via the fallback", () => {
    const d = makeDialog();
    openDialog(d);
    const onClosed = vi.fn();
    closeDialog(d, onClosed);
    expect(d.classList.contains("is-leaving")).toBe(true);
    expect(d.open).toBe(true);
    vi.advanceTimersByTime(400);
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("closeDialog completes on transitionend before the fallback fires", () => {
    const d = makeDialog();
    openDialog(d);
    const onClosed = vi.fn();
    closeDialog(d, onClosed);
    d.dispatchEvent(new Event("transitionend"));
    expect(d.open).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("closeDialog on an already-closed dialog fires onClosed immediately", () => {
    const d = makeDialog();
    const onClosed = vi.fn();
    closeDialog(d, onClosed);
    expect(onClosed).toHaveBeenCalledOnce();
  });
});

describe("createDialog", () => {
  it("closes when a backdrop press starts and ends on the dialog element", () => {
    const d = makeDialog();
    const ctrl = createDialog(d);
    ctrl.open();
    expect(d.classList.contains("uip-dialog")).toBe(true);
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(d.open).toBe(false);
    ctrl.dispose();
  });

  it("does not close when the press starts inside content (drag-select safe)", () => {
    const d = makeDialog();
    const inner = document.createElement("button");
    d.appendChild(inner);
    const ctrl = createDialog(d);
    ctrl.open();
    inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);
    ctrl.dispose();
  });

  it("closes on Escape via the cancel event and fires onClose", () => {
    const d = makeDialog();
    const onClose = vi.fn();
    const ctrl = createDialog(d, { onClose });
    ctrl.open();
    const cancel = new Event("cancel", { cancelable: true });
    d.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(d.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(d.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    ctrl.dispose();
  });

  it("ignores backdrop clicks when closeOnBackdrop is false", () => {
    const d = makeDialog();
    const ctrl = createDialog(d, { closeOnBackdrop: false });
    ctrl.open();
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.open).toBe(true);
    expect(d.classList.contains("is-leaving")).toBe(false);
    ctrl.dispose();
  });

  it("dispose removes listeners and the uip-dialog class", () => {
    const d = makeDialog();
    const ctrl = createDialog(d);
    ctrl.open();
    ctrl.dispose();
    expect(d.classList.contains("uip-dialog")).toBe(false);
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);
  });

  it("dispose stops intercepting Escape, leaving the platform close to run", () => {
    const d = makeDialog();
    const ctrl = createDialog(d);
    ctrl.open();
    ctrl.dispose();
    const cancel = new Event("cancel", { cancelable: true });
    d.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
    expect(d.classList.contains("is-leaving")).toBe(false);
  });
});

describe("createDialog: canDismiss guard", () => {
  function backdropPress(d: HTMLDialogElement): void {
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  it("refuses backdrop and Escape dismissal while the guard returns false, and stays armed", () => {
    const d = makeDialog();
    let allowed = false;
    const canDismiss = vi.fn(() => allowed);
    const ctl = createDialog(d, { canDismiss });
    ctl.open();

    backdropPress(d);
    expect(d.open).toBe(true);

    const cancel = new Event("cancel", { cancelable: true });
    d.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(d.open).toBe(true);
    expect(canDismiss).toHaveBeenCalledTimes(2);

    // A refusal must not disarm the wiring; a later attempt succeeds once allowed.
    allowed = true;
    backdropPress(d);
    vi.advanceTimersByTime(400);
    expect(d.open).toBe(false);
    expect(canDismiss).toHaveBeenCalledTimes(3);
  });

  it("programmatic close() ignores the guard", () => {
    const d = makeDialog();
    const canDismiss = vi.fn(() => false);
    const ctl = createDialog(d, { canDismiss });
    ctl.open();
    ctl.close();
    vi.advanceTimersByTime(400);
    expect(d.open).toBe(false);
    expect(canDismiss).not.toHaveBeenCalled();
  });
});

describe("openDialog: reopen during the leave fade", () => {
  it("cancels the pending close so the stale finalizer can't yank the dialog shut", () => {
    const d = makeDialog();
    openDialog(d);
    closeDialog(d);
    expect(d.classList.contains("is-leaving")).toBe(true);

    openDialog(d); // reopen mid-fade
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);

    vi.advanceTimersByTime(400); // stale finalizer must be a no-op
    expect(d.open).toBe(true);
  });
});

describe("openDialog / closeDialog: platform calls and degradation", () => {
  it("closes through the native close() so the dialog's own close event fires", async () => {
    const d = makeDialog();
    openDialog(d);
    // close() queues the close event as a task, so await delivery rather than
    // asserting right after the fade finalizer runs.
    const delivered = new Promise<void>((resolve) => {
      d.addEventListener("close", () => resolve(), { once: true });
    });

    closeDialog(d);
    await vi.advanceTimersByTimeAsync(400);
    await delivered;
    expect(d.open).toBe(false);
  });

  it("openDialog falls back to the open property when showModal() is unavailable", () => {
    const d = makeDialog();
    vi.spyOn(d, "showModal").mockImplementation(() => {
      throw new Error("showModal is not implemented");
    });

    openDialog(d);
    expect(d.open).toBe(true);
  });

  it("closeDialog falls back to the open property when close() is unavailable", () => {
    const d = makeDialog();
    openDialog(d);
    vi.spyOn(d, "close").mockImplementation(() => {
      throw new Error("close is not implemented");
    });

    closeDialog(d);
    vi.advanceTimersByTime(400);
    expect(d.open).toBe(false);
  });
});

describe("wireBackdropDismiss: a dismissal needs its own complete press", () => {
  it("ignores a release with no press before it (a drag that began off-window)", () => {
    const d = makeDialog();
    const ctrl = createDialog(d);
    ctrl.open();

    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);
    ctrl.dispose();
  });

  it("does not close when the press starts on the backdrop but ends on content", () => {
    const d = makeDialog();
    const inner = document.createElement("button");
    d.appendChild(inner);
    const ctrl = createDialog(d);
    ctrl.open();

    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    inner.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);
    ctrl.dispose();
  });

  it("consumes the press, so the next release alone does not dismiss", () => {
    const d = makeDialog();
    const inner = document.createElement("button");
    d.appendChild(inner);
    const ctrl = createDialog(d);
    ctrl.open();

    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    inner.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);
    ctrl.dispose();
  });
});

describe("createDialog: a refused dismissal changes nothing", () => {
  it("does not start the leave fade when the guard refuses", () => {
    const d = makeDialog();
    const ctl = createDialog(d, { canDismiss: () => false });
    ctl.open();

    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(d.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(400);
    expect(d.open).toBe(true);
    ctl.dispose();
  });

  it("ignores the cancel event when closeOnEscape is false (still preventDefaults it)", () => {
    const d = makeDialog();
    const ctl = createDialog(d, { closeOnEscape: false });
    ctl.open();

    const cancel = new Event("cancel", { cancelable: true });
    d.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(true);
    ctl.dispose();
  });
});

describe("openDialog uses the platform's modal API", () => {
  it("opens through showModal(), not by setting the attribute", () => {
    const d = makeDialog();
    const showModal = vi.spyOn(d, "showModal");

    openDialog(d);

    // showModal() buys focus containment, the top layer and inertness that
    // `open = true` alone does not, so the CALL is what this test pins.
    expect(showModal).toHaveBeenCalledOnce();
    expect(d.open).toBe(true);
  });
});

describe("wireBackdropDismiss: the cleanup is complete", () => {
  it("a press begun before the cleanup cannot dismiss after it", () => {
    const d = makeDialog();
    const onDismiss = vi.fn();
    const cleanup = wireBackdropDismiss(d, onDismiss);

    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); // press on the backdrop
    cleanup();
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("gives back both listeners it took, not just one", () => {
    const d = makeDialog();
    const add = vi.spyOn(d, "addEventListener");
    const remove = vi.spyOn(d, "removeEventListener");
    const types = (spy: typeof add): string[] =>
      (spy.mock.calls as unknown[][]).map((c) => String(c[0])).sort();

    const cleanup = wireBackdropDismiss(d, vi.fn());
    expect(types(add)).toEqual(["mousedown", "mouseup"]);

    cleanup();

    // A half-cleanup leaks a closure on an app-owned element permanently.
    expect(types(remove)).toEqual(["mousedown", "mouseup"]);
  });
});
