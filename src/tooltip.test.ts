import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initTooltips, _resetForTest } from "./tooltip.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function anchor(text: string): HTMLElement {
  const el = document.createElement("button");
  el.setAttribute("data-uip-tooltip", text);
  document.body.appendChild(el);
  return el;
}

function tip(): HTMLElement | null {
  return document.querySelector(".uip-tooltip");
}

/** The tooltip that is not fading out — the one a user would read. */
function liveTip(): HTMLElement | null {
  return document.querySelector(".uip-tooltip:not(.is-leaving)");
}

function tipCount(): number {
  return document.querySelectorAll(".uip-tooltip").length;
}

/**
 * Present a viewport of exactly `width` x `height` at the origin.
 *
 * The tooltip positioner reads window.visualViewport first and only falls back
 * to innerWidth/innerHeight, so a test that stubs the two inner* globals alone
 * silently measures the real window and its clamp/flip assertions read the
 * unclamped value.
 */
function stubViewport(width: number, height: number): void {
  vi.stubGlobal("visualViewport", {
    offsetLeft: 0,
    offsetTop: 0,
    width,
    height,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
}

function anchorRect(el: HTMLElement, left: number, top: number, w: number, h: number): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({
      x: left,
      y: top,
      left,
      top,
      width: w,
      height: h,
      right: left + w,
      bottom: top + h,
      toJSON: () => ({}),
    }) as DOMRect;
}

function pointerOver(el: HTMLElement): void {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

function pointerOut(el: HTMLElement, related: EventTarget | null = null): void {
  const e = new Event("pointerout", { bubbles: true }) as Event & {
    relatedTarget: EventTarget | null;
  };
  e.relatedTarget = related;
  el.dispatchEvent(e);
}

describe("initTooltips", () => {
  it("shows a tooltip after the cold delay and wires aria-describedby", () => {
    initTooltips();
    const a = anchor("Hello");
    pointerOver(a);
    vi.advanceTimersByTime(499);
    expect(tip()).toBeNull(); // still pending during the 500ms default delay
    vi.advanceTimersByTime(1);
    const t = tip();
    expect(t).not.toBeNull();
    expect(t!.getAttribute("role")).toBe("tooltip");
    expect(t!.textContent).toBe("Hello");
    expect(t!.id).not.toBe("");
    expect(a.getAttribute("aria-describedby")).toBe(t!.id);
  });

  it("hides on pointerout, removing aria-describedby and the element", () => {
    initTooltips();
    const a = anchor("Hello");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();

    pointerOut(a, null);
    expect(a.getAttribute("aria-describedby")).toBeNull();
    expect(tip()!.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(400); // the shared leave-fallback ceiling
    expect(tip()).toBeNull();
  });

  it("keeps the tooltip when the pointer moves within the anchor's own subtree", () => {
    initTooltips();
    const a = anchor("Hi");
    const child = document.createElement("span");
    a.appendChild(child);
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    pointerOut(a, child); // relatedTarget inside the anchor -> transition ignored
    expect(tip()).not.toBeNull();
    expect(tip()!.classList.contains("is-leaving")).toBe(false);
  });

  it("makes every hover wait the same delay by default — no instant peer", () => {
    // The default a native `title` sets: warm defaults to the cold delay, so a
    // peer hovered right after a tooltip hid still costs the full wait. An
    // instant peer here is what makes a pill row or a toolbar read as popping
    // tooltips with no hover time at all.
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(tip()!.textContent).toBe("A");
    pointerOut(a, null);
    vi.advanceTimersByTime(400); // remove A; the cooldown window is still open
    pointerOver(b);
    vi.advanceTimersByTime(499);
    expect(tip()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(tip()!.textContent).toBe("B");
  });

  it("uses the warm delay for a peer within the cooldown window when opted into", () => {
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(tip()!.textContent).toBe("A");
    pointerOut(a, null);
    vi.advanceTimersByTime(400); // remove A; group is now warm
    pointerOver(b);
    vi.advanceTimersByTime(1); // opted-in warm delay is 0
    expect(tip()!.textContent).toBe("B");
  });

  it("takes the cold delay as the warm delay when only delayCold is given", () => {
    initTooltips({ delayCold: 2000 });
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(2000);
    expect(tip()!.textContent).toBe("A");
    pointerOut(a, null);
    vi.advanceTimersByTime(400);
    pointerOver(b);
    vi.advanceTimersByTime(1999);
    expect(tip()).toBeNull(); // never faster than the delay the caller asked for
    vi.advanceTimersByTime(1);
    expect(tip()!.textContent).toBe("B");
  });

  it("splits multiline text on newlines with <br>", () => {
    initTooltips();
    const a = anchor("line1\nline2");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(t.querySelectorAll("br")).toHaveLength(1);
    expect(t.textContent).toBe("line1line2");
  });

  it("Escape hides the tooltip", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    vi.advanceTimersByTime(400);
    expect(tip()).toBeNull();
  });

  it("honors a custom attribute and delay options", () => {
    initTooltips({ attribute: "data-hint", delayCold: 200 });
    const el = document.createElement("button");
    el.setAttribute("data-hint", "Custom");
    document.body.appendChild(el);
    pointerOver(el);
    vi.advanceTimersByTime(200);
    expect(tip()!.textContent).toBe("Custom");
  });

  it("is idempotent — a second initTooltips does not double-install", () => {
    initTooltips();
    initTooltips();
    const a = anchor("X");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(document.querySelectorAll(".uip-tooltip")).toHaveLength(1);
  });

  it("ignores triggers with an empty tooltip value", () => {
    initTooltips();
    const a = anchor("");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).toBeNull();
  });

  it("cancels a still-pending tooltip when the pointer leaves during the cold delay", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a); // schedules the cold-delay timer (state = pending)
    pointerOut(a, null); // leaves before the delay elapses -> clears the pending timer
    vi.advanceTimersByTime(1000); // the cancelled timer must not fire
    expect(tip()).toBeNull();
  });

  it("hides on capture-phase scroll", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(400);
    expect(tip()).toBeNull();
  });

  it("hides on window blur", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(400);
    expect(tip()).toBeNull();
  });

  it("preserves a pre-existing aria-describedby, appending then removing only its own id", () => {
    initTooltips();
    const a = anchor("Hi");
    a.setAttribute("aria-describedby", "foo");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(a.getAttribute("aria-describedby")).toBe(`foo ${t.id}`);
    pointerOut(a, null);
    expect(a.getAttribute("aria-describedby")).toBe("foo"); // prior token restored
    vi.advanceTimersByTime(400);
  });

  it("renders into an open ancestor <dialog> so it clears the modal's top layer", () => {
    initTooltips();
    const d = document.createElement("dialog");
    d.setAttribute("open", "");
    const a = document.createElement("button");
    a.setAttribute("data-uip-tooltip", "In dialog");
    d.appendChild(a);
    document.body.appendChild(d);
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(t.parentElement).toBe(d); // appended into the dialog, not document.body
  });
});

describe("focus-triggered tooltips (:focus-visible gate)", () => {
  function focusIn(el: HTMLElement): void {
    el.dispatchEvent(new Event("focusin", { bubbles: true }));
  }

  it("shows on keyboard-driven focus (element matches :focus-visible)", () => {
    initTooltips();
    const a = anchor("hint");
    vi.spyOn(a, "matches").mockImplementation((sel: string) => sel === ":focus-visible");
    focusIn(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
  });

  it("stays quiet on programmatic or pointer focus (no :focus-visible)", () => {
    // The regression this gate exists for: a modal opening and focusing its
    // first control (or a focus-trap restoring focus) popped a tooltip with
    // no hover and no keypress.
    initTooltips();
    const a = anchor("hint");
    vi.spyOn(a, "matches").mockReturnValue(false);
    focusIn(a);
    vi.advanceTimersByTime(5000);
    expect(tip()).toBeNull();
  });

  it("falls back to showing when the engine lacks :focus-visible (matches throws)", () => {
    initTooltips();
    const a = anchor("hint");
    vi.spyOn(a, "matches").mockImplementation(() => {
      throw new SyntaxError("unsupported selector");
    });
    focusIn(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
  });

  it("focusout hides a keyboard-shown tooltip", () => {
    initTooltips();
    const a = anchor("hint");
    vi.spyOn(a, "matches").mockImplementation((sel: string) => sel === ":focus-visible");
    focusIn(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    const out = new Event("focusout", { bubbles: true }) as Event & {
      relatedTarget: EventTarget | null;
    };
    out.relatedTarget = null;
    a.dispatchEvent(out);
    vi.advanceTimersByTime(500);
    expect(document.querySelector(".uip-tooltip:not(.is-leaving)")).toBeNull();
  });
});

describe("dismissal triggers are specific", () => {
  it("leaves the tooltip up for a keydown that is not Escape", () => {
    // Only Escape dismisses: a tooltip that vanished on Tab or on any typed
    // character would make hover help unreadable for a keyboard user.
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    vi.advanceTimersByTime(400);
    expect(tip()).not.toBeNull();
  });

  it("hides on a nested scroller's scroll, which does not bubble", () => {
    // Real scroll events do not bubble, so only a CAPTURE-phase document
    // listener sees a scroll inside a nested scroll container.
    initTooltips();
    const scroller = document.createElement("div");
    document.body.appendChild(scroller);
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    scroller.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(400);
    expect(tip()).toBeNull();
  });

  it("a pointerout from an unrelated anchor leaves the tooltip up", () => {
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    pointerOut(b, null); // a different anchor's leave must not hide A's tooltip
    expect(tip()!.classList.contains("is-leaving")).toBe(false);
  });
});

describe("re-entering an anchor the tooltip already tracks", () => {
  it("does not restart a pending tooltip's delay", () => {
    // pointerover fires again for every descendant the pointer crosses; a
    // restarted timer would mean a tooltip that never appears on a rich anchor.
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(400);
    pointerOver(a);
    vi.advanceTimersByTime(100); // the original 500ms deadline
    expect(tip()).not.toBeNull();
  });

  it("does not rebuild a visible tooltip", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    const first = tip();
    expect(first).not.toBeNull();
    pointerOver(a);
    expect(tip()).toBe(first); // the same node, not torn down and re-created
  });
});

describe("handing the tooltip from one anchor to another", () => {
  it("removes the visible tooltip and its describedby without a pointerout", () => {
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(a.getAttribute("aria-describedby")).not.toBeNull();
    pointerOver(b); // the controller tears A down itself
    expect(tipCount()).toBe(0);
    expect(a.getAttribute("aria-describedby")).toBeNull();
  });

  it("cancels a still-pending tooltip so only the newest anchor shows", () => {
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(400); // A pending, 100ms short of its deadline
    pointerOver(b);
    vi.advanceTimersByTime(500);
    expect(tipCount()).toBe(1);
    expect(tip()!.textContent).toBe("B");
  });

  it("never paints the tooltip of an anchor the pointer already left", () => {
    // The superseded timer must be dead, not merely outlived: A's deadline
    // falls inside B's wait, so a surviving timer paints A while B is pending
    // — and the end state converges again afterwards, which is why only this
    // mid-wait moment can see it.
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(400);
    pointerOver(b); // A's pending timer is cancelled here
    vi.advanceTimersByTime(100); // A's original 500ms deadline passes
    expect(tip()).toBeNull();
  });

  it("removes a fading tooltip when its anchor is hovered again", () => {
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    pointerOut(a, null);
    expect(tip()!.classList.contains("is-leaving")).toBe(true);
    pointerOver(a); // re-hover mid-fade
    vi.advanceTimersByTime(1);
    expect(tipCount()).toBe(1); // the fading node is gone, not stacked under the new one
  });

  it("an older tooltip's fade is cancelled outright, so it cannot reach the newer one", () => {
    // A superseded fade used to be left running and made harmless by a guard in
    // its own finalizer ("only reset the state I own"). It is now cancelled when
    // the controller tears the old tip down, so there is no late finalizer to
    // guard against — and B stays live and dismissable across the window where
    // A's ceiling would have fired.
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    pointerOut(a, null); // A begins fading; its ceiling would land 400ms out
    pointerOver(b);
    vi.advanceTimersByTime(1);
    expect(liveTip()!.textContent).toBe("B");
    vi.advanceTimersByTime(600); // past A's ceiling: nothing of A's runs
    expect(liveTip()!.textContent).toBe("B");
    pointerOut(b, null);
    vi.advanceTimersByTime(400);
    expect(tipCount()).toBe(0);
  });
});

describe("the warm window", () => {
  it("gives a peer the warm delay while the first tooltip is still visible", () => {
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(tip()!.textContent).toBe("A");
    pointerOver(b); // showing A opened the warm window
    vi.advanceTimersByTime(1);
    expect(liveTip()!.textContent).toBe("B");
  });

  it("still makes the first tooltip of a cold group wait the cold delay", () => {
    // delayWarm only applies once the group IS warm; the opening hover of a
    // cold group pays delayCold whatever delayWarm says.
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    pointerOver(a);
    vi.advanceTimersByTime(499);
    expect(tip()).toBeNull();
  });

  it("opens after a pending tooltip is cancelled, not just after a visible one hides", () => {
    initTooltips({ delayWarm: 0 });
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(100);
    pointerOut(a, null); // cancels the pending tooltip; the group warms anyway
    pointerOver(b);
    vi.advanceTimersByTime(1);
    expect(tip()!.textContent).toBe("B");
  });
});

describe("show-time guards and placement", () => {
  it("never paints a tooltip for an anchor removed during the delay", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    a.remove(); // a re-render dropped the anchor mid-delay
    vi.advanceTimersByTime(1000);
    expect(tip()).toBeNull();
  });

  it("positions the tooltip above its anchor, centered", () => {
    // Asserted as a relationship, not as two magic pixel values: a real browser
    // measures the tooltip (about 18px tall for one line), so the old
    // `top === 194px` / `left === 120px` pair only held because the emulator
    // this replaced reported every box as 0x0. The contract is that the
    // tooltip's bottom edge sits GAP above the anchor top and its horizontal
    // centre matches the anchor's, which is true at any measured size.
    stubViewport(2000, 2000);
    initTooltips();
    const a = anchor("Hi");
    anchorRect(a, 100, 200, 40, 40);
    pointerOver(a);
    vi.advanceTimersByTime(500);
    const t = tip()!;
    const box = t.getBoundingClientRect();
    expect(t.style.position).toBe("fixed");
    expect(box.height).toBeGreaterThan(0);
    // Anchor top 200, 6px gap.
    expect(parseFloat(t.style.top) + box.height).toBe(194);
    // Anchor centre: 100 + 40 / 2.
    expect(parseFloat(t.style.left) + box.width / 2).toBe(120);
  });

  it("renders a single-line tooltip with no <br>", () => {
    initTooltips();
    const a = anchor("just one line");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(tip()!.querySelectorAll("br")).toHaveLength(0);
  });

  it("normalizes stray whitespace in an app-set aria-describedby", () => {
    initTooltips();
    const a = anchor("Hi");
    a.setAttribute("aria-describedby", "  foo  bar  ");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(a.getAttribute("aria-describedby")).toBe(`foo bar ${tip()!.id}`);
  });

  it("removes a live tooltip when the controller is torn down", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(500);
    expect(tip()).not.toBeNull();
    _resetForTest();
    expect(tip()).toBeNull();
  });
});

/** How many of a spy's calls were registrations for `type`. */
function callsFor(spy: { mock: { calls: unknown[][] } }, type: string): number {
  return spy.mock.calls.filter((call) => call[0] === type).length;
}

describe("teardown leaves the document as it found it", () => {
  it("removes every listener init installed, on document and on window", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");

    initTooltips();
    _resetForTest();

    // One controller on `document` is the whole design, so a listener it fails
    // to give back accumulates across every init/reset cycle an app performs.
    for (const type of ["pointerover", "pointerout", "focusin", "focusout", "keydown", "scroll"]) {
      expect(callsFor(docAdd, type)).toBe(1);
      expect(callsFor(docRemove, type)).toBe(1);
    }
    expect(callsFor(winAdd, "blur")).toBe(1);
    expect(callsFor(winRemove, "blur")).toBe(1);
  });

  it("gives the capture-phase scroll listener back with the capture flag it used", () => {
    const docRemove = vi.spyOn(document, "removeEventListener");

    initTooltips();
    _resetForTest();

    // scroll is registered in the capture phase (it does not bubble from a
    // nested scroller). removeEventListener matches on that flag, so dropping
    // it leaves the listener installed for the life of the page — happy-dom
    // ignores the mismatch, every real engine does not.
    expect(docRemove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
  });

  it("repeated init/reset cycles do not accumulate listeners", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");

    for (let i = 0; i < 4; i++) {
      initTooltips();
      _resetForTest();
    }

    expect(callsFor(docAdd, "pointerout")).toBe(4);
    expect(callsFor(docRemove, "pointerout")).toBe(4);
    expect(callsFor(docAdd, "keydown")).toBe(4);
    expect(callsFor(docRemove, "keydown")).toBe(4);
  });
});

describe("the warm window's edges", () => {
  it("a hover exactly at the warm deadline waits the cold delay, not the warm one", () => {
    // The window is [hide, hide + cooldown): at the deadline itself the group is
    // cold again, so "warm" can never outlast the cooldown the caller asked for.
    initTooltips({ delayCold: 500, delayWarm: 100, cooldown: 500 });
    const a = anchor("A");
    const b = anchor("B");

    pointerOver(a);
    vi.advanceTimersByTime(500); // A shows
    pointerOut(a, null); // the warm window now ends 500ms out
    vi.advanceTimersByTime(500); // ...and this is that exact moment

    pointerOver(b);
    vi.advanceTimersByTime(100); // the warm delay would have painted B here
    expect(liveTip()).toBeNull();
    vi.advanceTimersByTime(400); // the cold delay is what B actually waits
    expect(liveTip()!.textContent).toBe("B");
  });

  it("gives every tooltip a fresh id that rises with show order", () => {
    initTooltips({ delayCold: 0 });
    const a = anchor("A");
    const b = anchor("B");

    pointerOver(a);
    vi.advanceTimersByTime(1);
    const first = tip()!.id;
    pointerOut(a, null);
    vi.advanceTimersByTime(400);
    pointerOver(b);
    vi.advanceTimersByTime(1);
    const second = tip()!.id;

    expect(first).toMatch(/^uip-tip-\d+$/);
    expect(second).toMatch(/^uip-tip-\d+$/);
    const seq = (id: string): number => Number(id.slice("uip-tip-".length));
    expect(seq(second)).toBeGreaterThan(seq(first));
  });
});

describe("pointer traffic that is not over an anchor", () => {
  it("a pointerover away from any anchor shows nothing", () => {
    initTooltips();
    const plain = document.createElement("div");
    document.body.appendChild(plain);

    pointerOver(plain);
    vi.advanceTimersByTime(1000);

    expect(tip()).toBeNull();
  });

  it("a pointerover on an anchor's ancestor, not the anchor, shows nothing", () => {
    initTooltips();
    const box = document.createElement("div");
    const a = anchor("A");
    box.appendChild(a);
    document.body.appendChild(box);

    pointerOver(box); // closest() looks up, not down: the box is not an anchor
    vi.advanceTimersByTime(1000);

    expect(tip()).toBeNull();
  });
});

describe("a superseded fade", () => {
  it("is cancelled outright, so only one fade is ever in flight", () => {
    // Two fades used to be able to run at once, with each finalizer guarded to
    // touch only its own tip. Superseding now CANCELS the older fade, so the
    // older tip's ceiling never arrives and cannot adopt the newer tip — and
    // the newer tip is still cleaned up by whatever shows next.
    initTooltips({ delayCold: 0, delayWarm: 0, cooldown: 0 });
    const a = anchor("A");
    const b = anchor("B");

    pointerOver(a);
    vi.advanceTimersByTime(1); // A visible
    pointerOut(a, null); // A begins fading
    pointerOver(b); // takes A's node down early and cancels its fade
    vi.advanceTimersByTime(1); // B visible
    expect(tipCount()).toBe(1); // A's node is gone, not stacked under B
    pointerOut(b, null); // B fades — the only fade in flight
    vi.advanceTimersByTime(600); // past where A's ceiling would have been

    pointerOver(a); // whatever owns the state now must have cleared B's node
    expect(tipCount()).toBe(0);
  });
});

describe("handing an app-owned aria-describedby back", () => {
  it("drops the attribute when only the tip's own token (and whitespace) is left", () => {
    initTooltips();
    const a = anchor("Hi");

    pointerOver(a);
    vi.advanceTimersByTime(500);
    const t = tip()!;
    // The app rewrites the attribute while the tooltip is up — its formatting is
    // its own business, and the tooltip still has to leave nothing behind.
    a.setAttribute("aria-describedby", ` ${t.id} `);

    pointerOut(a, null);

    // An empty aria-describedby is worse than none: it points at nothing.
    expect(a.hasAttribute("aria-describedby")).toBe(false);
  });
});
