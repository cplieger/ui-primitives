// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createDialog, openModal, closeModal } from "./dialog.js";

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

describe("openModal / closeModal", () => {
  it("openModal opens the dialog", () => {
    const d = makeDialog();
    openModal(d);
    expect(d.open).toBe(true);
  });

  it("closeModal adds is-leaving, then closes + fires onClosed via the fallback", () => {
    const d = makeDialog();
    openModal(d);
    const onClosed = vi.fn();
    closeModal(d, onClosed);
    expect(d.classList.contains("is-leaving")).toBe(true);
    expect(d.open).toBe(true);
    vi.advanceTimersByTime(400);
    expect(d.classList.contains("is-leaving")).toBe(false);
    expect(d.open).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("closeModal completes on transitionend before the fallback fires", () => {
    const d = makeDialog();
    openModal(d);
    const onClosed = vi.fn();
    closeModal(d, onClosed);
    d.dispatchEvent(new Event("transitionend"));
    expect(d.open).toBe(false);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("closeModal on an already-closed dialog fires onClosed immediately", () => {
    const d = makeDialog();
    const onClosed = vi.fn();
    closeModal(d, onClosed);
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
});
