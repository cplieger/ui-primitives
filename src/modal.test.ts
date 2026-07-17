// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createModal, _resetForTest } from "./modal.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.style.cssText = "";
  document.body.innerHTML = "";
});

/** Content (the modal body) with `count` focusable buttons. */
function makeContent(
  count = 1,
  prefix = "b",
): { content: HTMLElement; buttons: HTMLButtonElement[] } {
  const content = document.createElement("div");
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.textContent = `${prefix}${String(i)}`;
    content.appendChild(btn);
    buttons.push(btn);
  }
  return { content, buttons };
}

describe("createModal — structure", () => {
  it("wraps content in a native <dialog class='uip-modal'> appended to <body>", () => {
    const { content } = makeContent();
    const m = createModal(content);
    expect(m.el.tagName).toBe("DIALOG");
    expect(m.el.classList.contains("uip-modal")).toBe(true);
    expect(content.classList.contains("uip-modal-dialog")).toBe(true);
    expect(content.parentElement).toBe(m.el);
    expect(m.el.parentElement).toBe(document.body);
    expect(m.el.open).toBe(false);
    expect(m.isOpen).toBe(false);
  });

  it("open() opens the dialog and marks isOpen", () => {
    const m = createModal(makeContent().content);
    m.open();
    expect(m.el.open).toBe(true);
    expect(m.isOpen).toBe(true);
  });

  it("open() focuses an explicit initialFocus element", () => {
    const { content, buttons } = makeContent(2);
    const m = createModal(content, { initialFocus: buttons[1]! });
    m.open();
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("dispose() removes the dialog from the DOM", () => {
    const m = createModal(makeContent().content);
    m.open();
    m.dispose();
    expect(m.el.parentElement).toBeNull();
    expect(m.isOpen).toBe(false);
  });
});

describe("createModal — ARIA", () => {
  it("auto-detects an [id$='-title'] descendant for aria-labelledby", () => {
    const { content } = makeContent();
    const title = document.createElement("h2");
    title.id = "settings-title";
    content.prepend(title);
    const m = createModal(content);
    expect(m.el.getAttribute("aria-labelledby")).toBe("settings-title");
  });

  it("auto-detects an [id$='-desc'] or [id$='-description'] descendant for aria-describedby", () => {
    const a = makeContent();
    const desc = document.createElement("p");
    desc.id = "a-desc";
    a.content.append(desc);
    expect(createModal(a.content).el.getAttribute("aria-describedby")).toBe("a-desc");

    const b = makeContent();
    const desc2 = document.createElement("p");
    desc2.id = "dialog-description";
    b.content.append(desc2);
    expect(createModal(b.content).el.getAttribute("aria-describedby")).toBe("dialog-description");
  });

  it("honors explicit labelledBy / describedBy over auto-detection", () => {
    const { content } = makeContent();
    const title = document.createElement("h2");
    title.id = "auto-title";
    content.prepend(title);
    const m = createModal(content, { labelledBy: "explicit", describedBy: "body" });
    expect(m.el.getAttribute("aria-labelledby")).toBe("explicit");
    expect(m.el.getAttribute("aria-describedby")).toBe("body");
  });

  it("role alertdialog sets the dialog role + the .uip-modal--alert modifier", () => {
    const m = createModal(makeContent().content, { role: "alertdialog" });
    expect(m.el.getAttribute("role")).toBe("alertdialog");
    expect(m.el.classList.contains("uip-modal--alert")).toBe(true);
  });
});

describe("drag-safe backdrop dismissal", () => {
  it("closes when a press starts AND ends on the dialog element", () => {
    const m = createModal(makeContent().content);
    m.open();
    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(false);
  });

  it("does not close when the press starts inside content (drag-select safe)", () => {
    const { content, buttons } = makeContent();
    const m = createModal(content);
    m.open();
    buttons[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.el.classList.contains("is-leaving")).toBe(false);
    expect(m.isOpen).toBe(true);
  });

  it("ignores backdrop presses when closeOnBackdrop is false", () => {
    const m = createModal(makeContent().content, { closeOnBackdrop: false });
    m.open();
    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.isOpen).toBe(true);
  });
});

describe("Escape (native cancel event)", () => {
  it("closes via the cancel event and preventDefaults it", () => {
    const m = createModal(makeContent().content);
    m.open();
    const cancel = new Event("cancel", { cancelable: true });
    m.el.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(false);
  });

  it("does not close on cancel when closeOnEscape is false (still preventDefaults)", () => {
    const m = createModal(makeContent().content, { closeOnEscape: false });
    m.open();
    const cancel = new Event("cancel", { cancelable: true });
    m.el.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(m.isOpen).toBe(true);
  });
});

describe("iOS-safe scroll-lock (ref-counted)", () => {
  it("pins the body on open and restores it when the modal closes", () => {
    const m = createModal(makeContent().content);
    m.open();
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.width).toBe("100%");
    m.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("");
  });

  it("locks once across nested modals and releases only at the last close", () => {
    const m1 = createModal(makeContent().content);
    const m2 = createModal(makeContent().content);
    m1.open();
    expect(document.body.style.position).toBe("fixed");
    m2.open();
    expect(document.body.style.position).toBe("fixed");
    m2.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("fixed"); // m1 still open
    m1.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("");
  });

  it("skips the scroll-lock when scrollLock is false", () => {
    const m = createModal(makeContent().content, { scrollLock: false });
    m.open();
    expect(document.body.style.position).toBe("");
  });
});

describe("leave lifecycle", () => {
  it("completes on the dialog's transitionend before the fallback, firing onClose", () => {
    const onClose = vi.fn();
    const m = createModal(makeContent().content, { onClose });
    m.open();
    m.close();
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    expect(m.isOpen).toBe(false);
    m.el.dispatchEvent(new Event("transitionend"));
    expect(m.el.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("completes via the fallback timeout when transitionend never fires", () => {
    const onClose = vi.fn();
    const m = createModal(makeContent().content, { onClose });
    m.open();
    m.close();
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reopening mid fade-out cancels the close and keeps the lock", () => {
    const m = createModal(makeContent().content);
    m.open();
    m.close();
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    m.open(); // revive
    expect(m.el.classList.contains("is-leaving")).toBe(false);
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(true);
    expect(m.isOpen).toBe(true);
    expect(document.body.style.position).toBe("fixed");
  });

  it("close() on an already-closed modal is a no-op", () => {
    const onClose = vi.fn();
    const m = createModal(makeContent().content, { onClose });
    m.close(); // never opened
    vi.advanceTimersByTime(400);
    expect(onClose).not.toHaveBeenCalled();
    expect(m.isOpen).toBe(false);
  });
});

describe("createModal: canDismiss guard", () => {
  it("refuses backdrop and Escape dismissal while the guard returns false, and stays armed", () => {
    const { content } = makeContent();
    let allowed = false;
    const canDismiss = vi.fn(() => allowed);
    const m = createModal(content, { canDismiss });
    m.open();

    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.isOpen).toBe(true);

    const cancel = new Event("cancel", { cancelable: true });
    m.el.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(m.isOpen).toBe(true);
    expect(canDismiss).toHaveBeenCalledTimes(2);

    allowed = true;
    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(false);
    expect(canDismiss).toHaveBeenCalledTimes(3);
  });

  it("programmatic close() ignores the guard", () => {
    const { content } = makeContent();
    const canDismiss = vi.fn(() => false);
    const m = createModal(content, { canDismiss });
    m.open();
    m.close();
    vi.advanceTimersByTime(400);
    expect(m.el.open).toBe(false);
    expect(canDismiss).not.toHaveBeenCalled();
  });
});
