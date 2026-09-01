import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createPopup, closePopupGroup } from "./popup.js";

// Fake timers drive the install (setTimeout 0) and leave-fallback (setTimeout 400) timers.

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
  it("show() flushes the un-hide with a layout read before is-open lands", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);
    // No forced reflow between hidden=false and is-open means the browser
    // coalesces both into one frame and the transition never plays.
    const read = vi.spyOn(panel, "getBoundingClientRect");
    pop.show();
    expect(read).toHaveBeenCalled();
    pop.dispose();
  });

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

    // The stale leave must not fire later and hide the panel.
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
    closePopupGroup("g");
    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(false);
    closePopupGroup("does-not-exist");
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
    armListeners();
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

describe("disconnected-panel hosting under a modal (no trigger to derive it from)", () => {
  it("hosts a trigger-less disconnected panel into the topmost open dialog", () => {
    const modal = document.createElement("dialog");
    document.body.appendChild(modal);
    modal.showModal();

    // No trigger: falls back to the topmost open dialog (was <body>).
    const loose = document.createElement("div");
    const pop = createPopup(loose);
    pop.show();
    expect(loose.parentElement).toBe(modal);

    pop.dispose();
    modal.close();
    modal.remove();
  });

  it("still prefers the trigger's own open dialog ancestor over the topmost", () => {
    const outer = document.createElement("dialog");
    document.body.appendChild(outer);
    outer.showModal();
    const trigger = document.createElement("button");
    outer.appendChild(trigger);

    const topmost = document.createElement("dialog");
    document.body.appendChild(topmost);
    topmost.showModal();

    // Trigger-derived host wins over the global topmost fallback.
    const panel = document.createElement("div");
    const pop = createPopup(panel, { trigger });
    pop.show();
    expect(panel.parentElement).toBe(outer);

    pop.dispose();
    topmost.close();
    outer.close();
    topmost.remove();
    outer.remove();
  });
});

describe("popup: hide() is idempotent", () => {
  it("hiding an already-closed popup does not fire onClose again", () => {
    const { panel } = fixture();
    const onClose = vi.fn();
    const pop = createPopup(panel, { onClose });

    pop.show();
    pop.hide();
    expect(onClose).toHaveBeenCalledOnce();

    pop.hide();
    finishLeave();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("a cancelled leave cannot cut a later leave short", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);

    pop.show();
    pop.hide();
    vi.advanceTimersByTime(300);
    pop.show();
    pop.hide();

    vi.advanceTimersByTime(100);
    expect(panel.hidden).toBe(false);
    vi.advanceTimersByTime(300);
    expect(panel.hidden).toBe(true);
  });
});

describe("popup: focus the controller never moved", () => {
  it("leaves focus inside the panel alone when the app put it there", () => {
    const { panel } = fixture();
    const input = document.createElement("input");
    panel.appendChild(input);
    const pop = createPopup(panel);

    pop.show();
    input.focus();
    pop.hide();
    expect(document.activeElement).toBe(input);
  });

  it("stops forcing focus out once initialFocus is cleared", () => {
    const { panel, trigger } = fixture();
    const input = document.createElement("input");
    panel.appendChild(input);
    trigger.focus();
    const pop = createPopup(panel, { trigger, initialFocus: input });

    pop.show();
    pop.hide();
    expect(document.activeElement).toBe(trigger);

    pop.setOptions({ initialFocus: undefined });
    pop.show();
    input.focus();
    pop.hide();
    expect(document.activeElement).toBe(input);
  });
});

describe("popup: groups, on leaving one", () => {
  it("stops coordinating with the old group when setOptions moves it", () => {
    const a = createPopup(fixture().panel, { group: "g1" });
    const b = createPopup(fixture().panel, { group: "g1" });

    b.setOptions({ group: "g2" });
    b.show();
    a.show();
    expect(b.isOpen).toBe(true);
    expect(a.isOpen).toBe(true);

    a.dispose();
    b.dispose();
  });
});

describe("popup: the group registry outlives its members", () => {
  it("one member leaving a group leaves the rest coordinating", () => {
    // Unregistering the LAST member drops the group; any other must not.
    const a = createPopup(fixture().panel, { group: "g" });
    const b = createPopup(fixture().panel, { group: "g" });
    const c = createPopup(fixture().panel, { group: "g" });

    c.dispose();
    a.show();
    b.show();

    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(true);
    a.dispose();
    b.dispose();
  });

  it("dispose takes the popup out of its group in both directions", () => {
    const a = createPopup(fixture().panel, { group: "g" });
    const b = createPopup(fixture().panel, { group: "g" });

    a.dispose();
    a.show();
    b.show();

    expect(a.isOpen).toBe(true);
    expect(b.isOpen).toBe(true);
    a.dispose();
    b.dispose();
  });
});

describe("popup: nothing is left armed", () => {
  it("hide() cancels the deferred listener install instead of leaving it pending", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);

    pop.show();
    expect(vi.getTimerCount()).toBe(1);

    pop.hide();
    panel.dispatchEvent(new Event("transitionend"));
    // A pending install outliving the popup keeps the controller alive after close.
    expect(vi.getTimerCount()).toBe(0);
    pop.dispose();
  });

  it("setOptions on a closed popup arms nothing", () => {
    const { panel } = fixture();
    const pop = createPopup(panel);

    pop.setOptions({ closeOnOutside: false });

    // Only an OPEN popup re-arms dismissal; a closed one must schedule nothing.
    expect(vi.getTimerCount()).toBe(0);
    pop.dispose();
  });

  it("a popup that never opened touches no document listener at all", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const dismissal = (spy: typeof add): number =>
      (spy.mock.calls as unknown[][]).filter((c) => c[0] === "click" || c[0] === "keydown").length;

    const { panel } = fixture();
    const pop = createPopup(panel);
    pop.hide();
    pop.dispose();

    expect(dismissal(add)).toBe(0);
    // Controller starts disarmed, so there is nothing of its to remove.
    expect(dismissal(remove)).toBe(0);
  });
});

describe("popup: a panel handed to a new owner mid-fade", () => {
  it("the old controller's leave finalizer does not hide what the new owner revealed", () => {
    const { panel } = fixture();
    const first = createPopup(panel);
    first.show();
    armListeners();
    first.hide();

    // The finalizer's is-leaving re-check exists for exactly this reuse case.
    const second = createPopup(panel);
    second.show();
    expect(panel.hidden).toBe(false);

    finishLeave();

    // Finalizing regardless of class would hide a panel the new owner has open.
    expect(panel.hidden).toBe(false);
    expect(second.isOpen).toBe(true);
    second.dispose();
    first.dispose();
  });
});

describe("popup: dispose disarms even what a callback re-armed", () => {
  it("a popup reopened by its own onClose is still disarmed by the dispose that closed it", () => {
    const { panel } = fixture();
    let reopen = false;
    let closes = 0;
    let pop: ReturnType<typeof createPopup> | null = null;
    pop = createPopup(panel, {
      onClose: (): void => {
        closes++;
        if (reopen) {
          pop?.show();
        }
      },
    });

    pop.show();
    armListeners();
    reopen = true;
    pop.dispose();
    reopen = false;
    armListeners();
    expect(closes).toBe(1);

    clickOn(document.body);

    // Wiring installed after teardown began still belongs to a disposed controller.
    expect(closes).toBe(1);
  });
});
