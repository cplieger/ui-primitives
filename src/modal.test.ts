// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  openModal,
  closeModal,
  closeTopModal,
  createModal,
  _resetForTest,
  type ModalOptions,
} from "./modal.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.innerHTML = "";
});

/** A `content` element (the panel body) with `count` focusable buttons. */
function makeContent(
  count: number,
  prefix = "b",
): { content: HTMLElement; buttons: HTMLButtonElement[] } {
  const content = document.createElement("div");
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.textContent = `${prefix}${i.toString()}`;
    content.appendChild(btn);
    buttons.push(btn);
  }
  return { content, buttons };
}

/** A raw overlay+panel for the standalone openModal/closeModal API. */
function makeOverlay(count = 1): {
  overlay: HTMLElement;
  panel: HTMLElement;
  buttons: HTMLButtonElement[];
} {
  const { content, buttons } = makeContent(count);
  content.classList.add("uip-modal-dialog");
  const overlay = document.createElement("div");
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  return { overlay, panel: content, buttons };
}

function tabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
}

function captureKeydowns(spy: ReturnType<typeof vi.spyOn>): number {
  return (spy.mock.calls as unknown[][]).filter((c) => c[0] === "keydown" && c[2] === true).length;
}

describe("createModal", () => {
  it("wraps content in a hidden .uip-modal overlay with a .uip-modal-dialog panel", () => {
    const { content } = makeContent(1);
    const m = createModal(content);
    expect(m.el.classList.contains("uip-modal")).toBe(true);
    expect(content.classList.contains("uip-modal-dialog")).toBe(true);
    expect(m.el.hidden).toBe(true);
    expect(m.isOpen).toBe(false);
    expect(m.el.parentElement).toBe(document.body);
  });

  it("open() reveals, marks open, and traps focus in the panel", () => {
    const { content, buttons } = makeContent(2);
    const m = createModal(content);
    m.open();
    expect(m.el.hidden).toBe(false);
    expect(m.isOpen).toBe(true);
    expect(content.getAttribute("role")).toBe("dialog");
    expect(content.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("dispose() tears down and removes the overlay from the DOM", () => {
    const { content } = makeContent(1);
    const m = createModal(content);
    m.open();
    m.dispose();
    expect(m.el.parentElement).toBeNull();
    expect(m.isOpen).toBe(false);
  });
});

describe("modal ARIA wiring", () => {
  it("auto-detects an [id$='-title'] descendant for aria-labelledby", () => {
    const { content } = makeContent(1);
    const title = document.createElement("h2");
    title.id = "settings-title";
    content.prepend(title);
    const m = createModal(content);
    m.open();
    expect(content.getAttribute("aria-labelledby")).toBe("settings-title");
  });

  it("honors explicit labelledBy / describedBy and does not auto-detect over them", () => {
    const { content } = makeContent(1);
    const title = document.createElement("h2");
    title.id = "auto-title";
    content.prepend(title);
    const m = createModal(content, { labelledBy: "explicit", describedBy: "body" });
    m.open();
    expect(content.getAttribute("aria-labelledby")).toBe("explicit");
    expect(content.getAttribute("aria-describedby")).toBe("body");
  });

  it("role alertdialog sets the panel role and the .uip-modal--alert modifier", () => {
    const { content } = makeContent(1);
    const m = createModal(content, { role: "alertdialog" });
    m.open();
    expect(content.getAttribute("role")).toBe("alertdialog");
    expect(m.el.classList.contains("uip-modal--alert")).toBe(true);
  });
});

describe("drag-safe backdrop dismissal", () => {
  it("closes when a press starts AND ends on the overlay", () => {
    const { content } = makeContent(1);
    const m = createModal(content);
    m.open();
    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.el.classList.contains("is-leaving")).toBe(true);
  });

  it("does not close when the press starts on the panel and ends on the overlay (drag-select)", () => {
    const { content, buttons } = makeContent(1);
    const m = createModal(content);
    m.open();
    buttons[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.el.classList.contains("is-leaving")).toBe(false);
    expect(m.isOpen).toBe(true);
  });

  it("ignores backdrop presses when closeOnBackdrop is false", () => {
    const { content } = makeContent(1);
    const m = createModal(content, { closeOnBackdrop: false });
    m.open();
    m.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m.el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(m.isOpen).toBe(true);
  });
});

describe("Escape handling", () => {
  it("closes only the topmost modal", () => {
    const m1 = createModal(makeContent(1).content);
    const m2 = createModal(makeContent(1).content);
    m1.open();
    m2.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(m2.el.classList.contains("is-leaving")).toBe(true);
    expect(m1.el.classList.contains("is-leaving")).toBe(false);
  });

  it("does not close on Escape when closeOnEscape is false", () => {
    const m = createModal(makeContent(1).content, { closeOnEscape: false });
    m.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(m.isOpen).toBe(true);
  });
});

describe("closeTopModal", () => {
  it("closes the topmost open modal and returns true", () => {
    const m1 = createModal(makeContent(1).content);
    const m2 = createModal(makeContent(1).content);
    m1.open();
    m2.open();
    expect(closeTopModal()).toBe(true);
    expect(m2.el.classList.contains("is-leaving")).toBe(true);
    expect(m1.el.classList.contains("is-leaving")).toBe(false);
  });

  it("returns false when no modal is open", () => {
    expect(closeTopModal()).toBe(false);
  });
});

describe("scroll-lock ref-counting across the stack", () => {
  it("locks on the first open and releases only when the last modal closes", () => {
    const m1 = createModal(makeContent(1).content);
    const m2 = createModal(makeContent(1).content);

    m1.open();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    m2.open();
    expect(document.documentElement.style.overflow).toBe("hidden");

    m2.close();
    vi.advanceTimersByTime(400);
    // One modal still open — still locked.
    expect(document.documentElement.style.overflow).toBe("hidden");

    m1.close();
    vi.advanceTimersByTime(400);
    // Last one closed — released.
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("skips scroll-lock when scrollLock is false", () => {
    const m = createModal(makeContent(1).content, { scrollLock: false });
    m.open();
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("inert-background ref-counting across the stack", () => {
  it("inerts the background and a lower modal, releasing each only at its last ref", () => {
    const bg = document.createElement("div");
    bg.id = "app";
    document.body.appendChild(bg);

    const m1 = createModal(makeContent(1).content);
    const m2 = createModal(makeContent(1).content);

    m1.open();
    expect(bg.hasAttribute("inert")).toBe(true);
    // m1's own overlay is not inert.
    expect(m1.el.hasAttribute("inert")).toBe(false);

    m2.open();
    // Opening the child inerts the background AND the parent's overlay.
    expect(bg.hasAttribute("inert")).toBe(true);
    expect(m1.el.hasAttribute("inert")).toBe(true);
    expect(m2.el.hasAttribute("inert")).toBe(false);

    m2.close();
    vi.advanceTimersByTime(400);
    // Parent overlay reachable again; background still inert (m1 open).
    expect(m1.el.hasAttribute("inert")).toBe(false);
    expect(bg.hasAttribute("inert")).toBe(true);

    m1.close();
    vi.advanceTimersByTime(400);
    expect(bg.hasAttribute("inert")).toBe(false);
  });

  it("does not clobber an app-set inert attribute", () => {
    const bg = document.createElement("div");
    bg.setAttribute("inert", "");
    document.body.appendChild(bg);
    const m = createModal(makeContent(1).content);
    m.open();
    m.close();
    vi.advanceTimersByTime(400);
    // Still inert — the app owns it, the modal never managed it.
    expect(bg.hasAttribute("inert")).toBe(true);
  });

  it("skips inerting when inertBackground is false", () => {
    const bg = document.createElement("div");
    document.body.appendChild(bg);
    const m = createModal(makeContent(1).content, { inertBackground: false });
    m.open();
    expect(bg.hasAttribute("inert")).toBe(false);
  });
});

describe("stacked focus traps", () => {
  it("keeps only the topmost trap active and chains returnFocus down the stack", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { content: c1, buttons: b1 } = makeContent(2, "a");
    const m1 = createModal(c1);
    m1.open();
    expect(document.activeElement).toBe(b1[0]);
    // One capture-phase keydown trap installed.
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    const { content: c2, buttons: b2 } = makeContent(1, "z");
    const m2 = createModal(c2);
    m2.open();
    // m1's trap paused (removed), m2's installed: still exactly one active.
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);
    expect(document.activeElement).toBe(b2[0]);

    // Tab within m2 (single focusable) stays put — the parent trap is NOT also
    // pulling focus into m1.
    const tab = tabEvent();
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2[0]);

    // Close the child: parent re-trapped, focus returns to the element focused
    // when the child opened (b1[0]).
    m2.close();
    vi.advanceTimersByTime(400);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);
    expect(document.activeElement).toBe(b1[0]);

    // The re-trapped parent now cycles at its edges (last -> first on Tab).
    b1[1]!.focus();
    const tab2 = tabEvent();
    document.dispatchEvent(tab2);
    expect(tab2.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1[0]);

    m1.close();
    vi.advanceTimersByTime(400);
    // No traps left.
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(0);
  });
});

describe("returnFocus", () => {
  it("restores focus to the opener when the last modal closes", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const m = createModal(makeContent(1).content);
    m.open();
    expect(document.activeElement).not.toBe(opener);
    m.close();
    vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(opener);
  });

  it("focuses an explicit returnFocus element on close", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const m = createModal(makeContent(1).content, { returnFocus: target });
    m.open();
    m.close();
    vi.advanceTimersByTime(400);
    expect(document.activeElement).toBe(target);
  });

  it("leaves focus alone when returnFocus is false", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const m = createModal(makeContent(1).content, { returnFocus: false });
    m.open();
    const afterOpen = document.activeElement;
    m.close();
    vi.advanceTimersByTime(400);
    // Not restored to the opener (returnFocus disabled).
    expect(document.activeElement).toBe(afterOpen);
  });
});

describe("leave lifecycle", () => {
  it("completes on transitionend of the panel before the fallback fires", () => {
    const { content } = makeContent(1);
    const onClose = vi.fn();
    const onClosed = vi.fn();
    const m = createModal(content, { onClose });
    m.open();
    closeModal(m.el, onClosed);
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    // transitionend on the panel drives teardown.
    content.dispatchEvent(new Event("transitionend"));
    expect(m.isOpen).toBe(false);
    expect(m.el.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("completes via the fallback timeout when transitionend never fires", () => {
    const onClose = vi.fn();
    const m = createModal(makeContent(1).content, { onClose });
    m.open();
    m.close();
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(m.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a transitionend from a descendant (not the panel) does not tear down early", () => {
    const { content, buttons } = makeContent(1);
    const m = createModal(content);
    m.open();
    m.close();
    buttons[0]!.dispatchEvent(new Event("transitionend", { bubbles: true }));
    // Still leaving — only the panel's own transitionend counts.
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400);
    expect(m.isOpen).toBe(false);
  });

  it("reviving a modal mid fade-out cancels the close", () => {
    const m = createModal(makeContent(1).content);
    m.open();
    m.close();
    expect(m.el.classList.contains("is-leaving")).toBe(true);
    m.open(); // revive
    expect(m.el.classList.contains("is-leaving")).toBe(false);
    // The pending fallback must NOT tear it down.
    vi.advanceTimersByTime(400);
    expect(m.isOpen).toBe(true);
  });
});

describe("standalone openModal / closeModal", () => {
  it("opens and closes a raw overlay, firing onClosed", () => {
    const { overlay } = makeOverlay(1);
    openModal(overlay);
    expect(overlay.classList.contains("uip-modal")).toBe(true);
    expect(overlay.hidden).toBe(false);
    const onClosed = vi.fn();
    closeModal(overlay, onClosed);
    vi.advanceTimersByTime(400);
    expect(overlay.hidden).toBe(true);
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it("openModal is idempotent — a second open on the same overlay is a no-op", () => {
    const { overlay } = makeOverlay(1);
    const opts: ModalOptions = {};
    openModal(overlay, opts);
    openModal(overlay, opts);
    // Closing once fully closes it (only one stack entry existed).
    closeModal(overlay);
    vi.advanceTimersByTime(400);
    expect(overlay.hidden).toBe(true);
  });

  it("closeModal on an overlay that is not open invokes onClosed immediately", () => {
    const { overlay } = makeOverlay(1);
    const onClosed = vi.fn();
    closeModal(overlay, onClosed);
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
