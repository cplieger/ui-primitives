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

  it("dispose() hands the caller's content element back without the modal class", () => {
    const { content } = makeContent();
    const m = createModal(content);
    expect(content.classList.contains("uip-modal-dialog")).toBe(true);
    m.dispose();
    expect(content.classList.contains("uip-modal-dialog")).toBe(false);
  });

  it("dispose() during the fade cancels the pending close, so onClose never fires", () => {
    const onClose = vi.fn();
    const m = createModal(makeContent().content, { onClose });
    m.open();
    m.close(); // starts the leave
    m.dispose(); // tears down instead: the pending finalizer must no-op
    vi.advanceTimersByTime(400);
    expect(onClose).not.toHaveBeenCalled();
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

  it("restores the scroll position when the lock is released", () => {
    // A document with no overflow cannot scroll, so scrollY needs real content.
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    document.body.appendChild(spacer);
    try {
      window.scrollTo(0, 250);
      expect(window.scrollY).toBe(250); // the premise, not the assertion
      const m = createModal(makeContent().content);
      m.open(); // saves scrollY 250 and pins the body at -250px
      window.scrollTo(0, 0); // a pinned body sits at the top while the modal is up
      m.close();
      vi.advanceTimersByTime(400);
      expect(window.scrollY).toBe(250);
    } finally {
      spacer.remove();
      window.scrollTo(0, 0);
    }
  });

  it("dispose releases the scroll-lock of a still-open modal", () => {
    const m = createModal(makeContent().content);
    m.open();
    expect(document.body.style.position).toBe("fixed");
    m.dispose();
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

describe("createModal — default role", () => {
  it("leaves a plain modal on the <dialog> implicit role, with no alert modifier", () => {
    const m = createModal(makeContent().content);
    expect(m.el.hasAttribute("role")).toBe(false);
    expect(m.el.classList.contains("uip-modal--alert")).toBe(false);
  });
});

describe("scroll-lock ref-counting across mixed and revived modals", () => {
  it("a nested scrollLock:false modal does not release the outer modal's lock", () => {
    const outer = createModal(makeContent().content);
    const inner = createModal(makeContent().content, { scrollLock: false });
    outer.open();
    inner.open();
    expect(document.body.style.position).toBe("fixed");

    inner.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("fixed");
  });

  it("disposing a nested modal after closing it does not release the outer lock twice", () => {
    const outer = createModal(makeContent().content);
    const inner = createModal(makeContent().content);
    outer.open();
    inner.open();

    inner.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("fixed");

    inner.dispose();
    expect(document.body.style.position).toBe("fixed");
  });

  it("reopening mid fade-out does not stack a second scroll-lock", () => {
    const m = createModal(makeContent().content);
    m.open();
    m.close();
    m.open(); // revived inside the fade window
    vi.advanceTimersByTime(400);

    m.close();
    vi.advanceTimersByTime(400);
    expect(document.body.style.position).toBe("");
  });

  it("_resetForTest releases a scroll-lock left active by an open modal", () => {
    const m = createModal(makeContent().content);
    m.open();
    expect(document.body.style.position).toBe("fixed");

    _resetForTest();
    expect(document.body.style.position).toBe("");
  });
});

describe("createModal — dispose hands the element back to the platform", () => {
  it("stops intercepting the platform's cancel event", () => {
    const m = createModal(makeContent().content);
    m.open();
    m.dispose();

    // A disposed modal has no fade left to protect, so Escape must go back to
    // meaning what the platform says it means.
    const evt = new Event("cancel", { cancelable: true });
    m.el.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
  });

  it("degrades to the open attribute when close() is not implemented", () => {
    const m = createModal(makeContent().content);
    m.open();
    vi.spyOn(m.el, "close").mockImplementation(() => {
      throw new Error("close is not implemented");
    });

    m.dispose();

    // Must not report itself open just because the engine lacks close().
    expect(m.el.open).toBe(false);
  });

  it("leaves the return value of an already-closed dialog alone", () => {
    const m = createModal(makeContent().content);
    m.open();
    // A <form method="dialog"> submit also closes the dialog and records why
    // in returnValue; tearing the wrapper down must not overwrite it.
    m.el.close("save");
    expect(m.el.returnValue).toBe("save");

    m.dispose();

    expect(m.el.returnValue).toBe("save");
  });
});

describe("scroll-lock accounting cannot go negative", () => {
  it("a release that outlives the count it belonged to does not break the next lock", () => {
    const a = createModal(makeContent().content);
    a.open();
    expect(document.body.style.position).toBe("fixed");

    _resetForTest(); // the shared count is cleared while `a` still holds a lock
    a.dispose(); // ...so a's release arrives with nothing left to release

    const b = createModal(makeContent().content);
    b.open();

    // An underflowed count leaves this lock one increment short.
    expect(document.body.style.position).toBe("fixed");
    b.dispose();
  });
});
