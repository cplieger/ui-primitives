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

  it("auto-detects an [id$='-desc'] descendant for aria-describedby", () => {
    const { content } = makeContent(1);
    const desc = document.createElement("p");
    desc.id = "settings-desc";
    content.append(desc);
    const m = createModal(content);
    m.open();
    expect(content.getAttribute("aria-describedby")).toBe("settings-desc");
  });

  it("auto-detects an [id$='-description'] descendant for aria-describedby", () => {
    const { content } = makeContent(1);
    const desc = document.createElement("p");
    desc.id = "dialog-description";
    content.append(desc);
    const m = createModal(content);
    m.open();
    expect(content.getAttribute("aria-describedby")).toBe("dialog-description");
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

describe("non-LIFO close keeps the top trap intact (F1)", () => {
  it("closing the BOTTOM modal while the top stays open leaks no trap and does not move focus", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const opener1 = document.createElement("button");
    document.body.appendChild(opener1);
    opener1.focus();

    const m1 = createModal(makeContent(2, "a").content);
    m1.open();

    const { content: c2, buttons: b2 } = makeContent(2, "z");
    const m2 = createModal(c2);
    m2.open();
    expect(document.activeElement).toBe(b2[0]);
    // Exactly one active capture-phase keydown (m2's trap; m1's was paused).
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    // Close the bottom modal out of LIFO order while m2 is still open.
    m1.close();
    vi.advanceTimersByTime(400);

    // m2's trap is untouched: still exactly one active capture keydown listener.
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);
    // Focus did NOT jump to m1's opener; it stays inside m2.
    expect(document.activeElement).toBe(b2[0]);
    expect(document.activeElement).not.toBe(opener1);
    // m2 is still trapped: Tab cycles at its edge instead of escaping.
    b2[1]!.focus();
    const tab = tabEvent();
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2[0]);

    m2.close();
    vi.advanceTimersByTime(400);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(0);
  });

  it("closing the MIDDLE modal in a 3-deep stack keeps the top trap and leaks nothing", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const m1 = createModal(makeContent(2, "a").content);
    m1.open();
    const m2 = createModal(makeContent(2, "b").content);
    m2.open();
    const { content: c3, buttons: b3 } = makeContent(2, "c");
    const m3 = createModal(c3);
    m3.open();
    expect(document.activeElement).toBe(b3[0]);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    // Close the middle modal (out of LIFO order).
    m2.close();
    vi.advanceTimersByTime(400);

    // The top (m3) keeps its trap; no listener leak, focus unmoved.
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);
    expect(document.activeElement).toBe(b3[0]);
    b3[1]!.focus();
    const tab = tabEvent();
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b3[0]);
  });

  it("dispose() of a non-top modal keeps the top trap and does not move focus", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const m1 = createModal(makeContent(2, "a").content);
    m1.open();
    const { content: c2, buttons: b2 } = makeContent(2, "z");
    const m2 = createModal(c2);
    m2.open();
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    // Dispose the bottom modal while m2 is open (dispose tears down at once).
    m1.dispose();

    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);
    expect(document.activeElement).toBe(b2[0]);
    expect(m1.el.parentElement).toBeNull();
  });

  it("closing the rest LIFO after a non-LIFO close ends with zero trap listeners", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const m1 = createModal(makeContent(2, "a").content);
    m1.open();
    const m2 = createModal(makeContent(2, "b").content);
    m2.open();
    const m3 = createModal(makeContent(2, "c").content);
    m3.open();

    // Non-LIFO: close the middle first.
    m2.close();
    vi.advanceTimersByTime(400);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    // Then close the remaining two LIFO (top m3, then m1).
    m3.close();
    vi.advanceTimersByTime(400);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(1);

    m1.close();
    vi.advanceTimersByTime(400);
    expect(captureKeydowns(addSpy) - captureKeydowns(removeSpy)).toBe(0);
  });
});

describe("hoisted overlay restore (F3)", () => {
  it("restores a caller overlay to its original parent on close", () => {
    const container = document.createElement("section");
    document.body.appendChild(container);
    const { content } = makeContent(1);
    content.classList.add("uip-modal-dialog");
    const overlay = document.createElement("div");
    overlay.appendChild(content);
    container.appendChild(overlay); // lives inside container, not <body>

    openModal(overlay);
    // Hoisted to <body> while open (for stacking + background inerting).
    expect(overlay.parentElement).toBe(document.body);

    closeModal(overlay);
    vi.advanceTimersByTime(400);
    // Restored to the original parent, not left as a hidden <body> child.
    expect(overlay.parentElement).toBe(container);
    expect(overlay.hidden).toBe(true);
  });

  it("restores the overlay to its original sibling position", () => {
    const container = document.createElement("section");
    const before = document.createElement("span");
    const after = document.createElement("span");
    const { content } = makeContent(1);
    content.classList.add("uip-modal-dialog");
    const overlay = document.createElement("div");
    overlay.appendChild(content);
    container.append(before, overlay, after);
    document.body.appendChild(container);

    openModal(overlay);
    expect(overlay.parentElement).toBe(document.body);

    closeModal(overlay);
    vi.advanceTimersByTime(400);
    expect(overlay.previousElementSibling).toBe(before);
    expect(overlay.nextElementSibling).toBe(after);
  });

  it("does not move a createModal overlay (it originates in <body>)", () => {
    const { content } = makeContent(1);
    const m = createModal(content);
    m.open();
    expect(m.el.parentElement).toBe(document.body);
    m.close();
    vi.advanceTimersByTime(400);
    // Still a <body> child (never hoisted, so restore is a no-op).
    expect(m.el.parentElement).toBe(document.body);
  });
});
