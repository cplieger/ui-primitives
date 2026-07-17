// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createPopup, closePopupGroup } from "./popup.js";

// The install timer (listener arming) is a setTimeout(0) and the leave
// fallback a setTimeout(400); both are driven with fake timers. happy-dom
// does no layout, which is fine here — popup never measures or positions.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A connected panel + trigger pair. */
function fixture(): { panel: HTMLElement; trigger: HTMLElement } {
  const trigger = document.createElement("button");
  const panel = document.createElement("div");
  panel.hidden = true;
  document.body.append(trigger, panel);
  return { panel, trigger };
}

/** Arm the deferred dismissal listeners (the setTimeout(0) after show). */
function armListeners(): void {
  vi.advanceTimersByTime(0);
}

/** Finish a pending leave via the no-transition fallback. */
function finishLeave(): void {
  vi.advanceTimersByTime(400);
}

function clickOn(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function pressEscape(target: EventTarget): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

describe("popup: reveal lifecycle", () => {
  it("show() reveals the panel with the state classes; hide() runs the leave then hides", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);

    pop.show();
    expect(pop.isOpen).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains("uip-popup")).toBe(true);
    expect(panel.classList.contains("is-open")).toBe(true);

    pop.hide();
    expect(pop.isOpen).toBe(false);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(panel.classList.contains("is-leaving")).toBe(true);
    // Still visible until the transition (fallback) completes.
    expect(panel.hidden).toBe(false);

    finishLeave();
    expect(panel.classList.contains("is-leaving")).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it("mounts a disconnected panel on <body>, and into an open ancestor <dialog> of the trigger", () => {
    const loose = document.createElement("div");
    const pop = createPopup(loose);
    pop.show();
    expect(loose.parentElement).toBe(document.body);
    pop.dispose();

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const trigger = document.createElement("button");
    dialog.appendChild(trigger);
    document.body.appendChild(dialog);
    const inDialog = document.createElement("div");
    const pop2 = createPopup(inDialog, { trigger });
    pop2.show();
    expect(inDialog.parentElement).toBe(dialog);
  });

  it("a show() during the leave fade cancels it and re-reveals", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);
    pop.show();
    pop.hide();
    expect(panel.classList.contains("is-leaving")).toBe(true);

    pop.show();
    expect(panel.classList.contains("is-leaving")).toBe(false);
    expect(pop.isOpen).toBe(true);

    // The stale leave must not fire later and yank the panel hidden.
    finishLeave();
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains("is-open")).toBe(true);
  });

  it("show() while open is idempotent; toggle() cycles", () => {
    const { panel } = fixture();
    const onOpen = vi.fn();
    const pop = createPopup(panel, { onOpen });
    pop.show();
    pop.show();
    expect(onOpen).toHaveBeenCalledTimes(1);

    pop.toggle();
    expect(pop.isOpen).toBe(false);
    pop.toggle();
    expect(pop.isOpen).toBe(true);
  });

  it("fires onOpen / onClose", () => {
    const { panel } = fixture();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const pop = createPopup(panel, { onOpen, onClose });
    pop.show();
    expect(onOpen).toHaveBeenCalledTimes(1);
    pop.hide();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("popup: light dismiss", () => {
  it("closes on an outside click, but not on panel or trigger clicks", () => {
    const { panel, trigger } = fixture();
    const inner = document.createElement("span");
    panel.appendChild(inner);
    const pop = createPopup(panel, { trigger });
    pop.show();
    armListeners();

    clickOn(inner);
    expect(pop.isOpen).toBe(true);
    clickOn(trigger);
    expect(pop.isOpen).toBe(true);
    clickOn(document.body);
    expect(pop.isOpen).toBe(false);
  });

  it("the opening click does not self-close (listeners arm on the next tick)", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);
    pop.show();
    // Same tick as show(): no listeners yet.
    clickOn(document.body);
    expect(pop.isOpen).toBe(true);
    armListeners();
    clickOn(document.body);
    expect(pop.isOpen).toBe(false);
  });

  it("closeOnOutside: false leaves outside clicks alone", () => {
    const { panel } = fixture();
    const pop = createPopup(panel, { closeOnOutside: false });
    pop.show();
    armListeners();
    clickOn(document.body);
    expect(pop.isOpen).toBe(true);
  });

  it("Escape closes and is isolated from window listeners by default", () => {
    const { panel } = fixture();
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    const pop = createPopup(panel);
    pop.show();
    armListeners();

    pressEscape(panel);
    expect(pop.isOpen).toBe(false);
    expect(windowSpy).not.toHaveBeenCalled();
    window.removeEventListener("keydown", windowSpy);
  });

  it("isolateEscape: false lets the Escape keep propagating", () => {
    const { panel } = fixture();
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
    const pop = createPopup(panel, { isolateEscape: false });
    pop.show();
    armListeners();

    pressEscape(panel);
    expect(pop.isOpen).toBe(false);
    expect(windowSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", windowSpy);
  });

  it("closeOnEscape: false ignores Escape", () => {
    const { panel } = fixture();
    const pop = createPopup(panel, { closeOnEscape: false });
    pop.show();
    armListeners();
    pressEscape(panel);
    expect(pop.isOpen).toBe(true);
  });
});

describe("popup: trigger ARIA", () => {
  it("wires aria-expanded and aria-haspopup on the trigger; dispose removes both", () => {
    const { panel, trigger } = fixture();
    const pop = createPopup(panel, { trigger, haspopup: "menu" });
    pop.show();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    pop.hide();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    pop.dispose();
    expect(trigger.hasAttribute("aria-expanded")).toBe(false);
    expect(trigger.hasAttribute("aria-haspopup")).toBe(false);
  });
});

describe("popup: focus (opt-in)", () => {
  it("initialFocus moves focus in; hide() restores the pre-open focus", () => {
    const { panel, trigger } = fixture();
    const input = document.createElement("input");
    panel.appendChild(input);
    trigger.focus();
    const pop = createPopup(panel, { trigger, initialFocus: input });
    pop.show();
    expect(document.activeElement).toBe(input);
    pop.hide();
    expect(document.activeElement).toBe(trigger);
  });

  it("returnFocus element form refocuses that element on close", () => {
    const { panel } = fixture();
    const target = document.createElement("button");
    document.body.appendChild(target);
    const pop = createPopup(panel, { returnFocus: target });
    pop.show();
    pop.hide();
    expect(document.activeElement).toBe(target);
  });

  it("with neither option, focus is left alone", () => {
    const { panel, trigger } = fixture();
    trigger.focus();
    const pop = createPopup(panel);
    pop.show();
    expect(document.activeElement).toBe(trigger);
    pop.hide();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("popup: groups", () => {
  it("opening one popup closes an open peer in the same group", () => {
    const a = createPopup(fixture().panel, { group: "pills" });
    const b = createPopup(fixture().panel, { group: "pills" });
    a.show();
    expect(a.isOpen).toBe(true);
    b.show();
    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(true);
    a.dispose();
    b.dispose();
  });

  it("popups in different groups (or none) do not interact", () => {
    const a = createPopup(fixture().panel, { group: "left" });
    const b = createPopup(fixture().panel, { group: "right" });
    const c = createPopup(fixture().panel);
    a.show();
    b.show();
    c.show();
    expect(a.isOpen).toBe(true);
    expect(b.isOpen).toBe(true);
    expect(c.isOpen).toBe(true);
    a.dispose();
    b.dispose();
    c.dispose();
  });

  it("closePopupGroup closes every open member", () => {
    const a = createPopup(fixture().panel, { group: "g" });
    const b = createPopup(fixture().panel, { group: "g" });
    a.show();
    // b stays closed; closing the group must only touch open members.
    closePopupGroup("g");
    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(false);
    closePopupGroup("does-not-exist"); // no-op, no throw
    a.dispose();
    b.dispose();
  });
});

describe("popup: setOptions", () => {
  it("re-arms dismissal listeners under new flags while open", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);
    pop.show();
    armListeners();

    pop.setOptions({ closeOnOutside: false });
    armListeners(); // the re-arm is deferred a tick, like show()
    clickOn(document.body);
    expect(pop.isOpen).toBe(true);

    pop.setOptions({ closeOnOutside: true });
    armListeners();
    clickOn(document.body);
    expect(pop.isOpen).toBe(false);
  });

  it("an explicit undefined clears an option back to its default", () => {
    const { panel } = fixture();
    const pop = createPopup(panel, { closeOnEscape: false });
    pop.show();
    armListeners();
    pressEscape(panel);
    expect(pop.isOpen).toBe(true);

    // Clearing restores the default (true).
    pop.setOptions({ closeOnEscape: undefined });
    armListeners();
    pressEscape(panel);
    expect(pop.isOpen).toBe(false);
  });

  it("moves the popup between groups", () => {
    const a = createPopup(fixture().panel, { group: "g1" });
    const b = createPopup(fixture().panel, { group: "g2" });
    a.show();
    b.setOptions({ group: "g1" });
    b.show();
    expect(a.isOpen).toBe(false);
    a.dispose();
    b.dispose();
  });
});
