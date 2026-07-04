// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";

import {
  placeAnchored,
  createPopover,
  type PopoverAlign,
  type PopoverPlacement,
} from "./popover.js";

// happy-dom does no layout: getBoundingClientRect() returns zeros and
// offsetWidth/offsetHeight are 0. To exercise the placement math for real we
// mock the anchor rect and stub the panel's measured size. window.innerWidth /
// innerHeight are stubbable via vi.stubGlobal (auto-restored by unstubGlobals),
// and window.visualViewport is null by default so the innerWidth fallback path
// runs unless we stub a fake box.

/** A DOMRect-shaped return for a mocked getBoundingClientRect. */
function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function stubRect(el: HTMLElement, left: number, top: number, width: number, height: number): void {
  el.getBoundingClientRect = (): DOMRect => rectOf(left, top, width, height);
}

function stubSize(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
}

function leftOf(el: HTMLElement): number {
  return parseFloat(el.style.left);
}

function topOf(el: HTMLElement): number {
  return parseFloat(el.style.top);
}

/** A fake visualViewport with the given box and no-op listener methods. */
function fakeVisualViewport(box: {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}): void {
  vi.stubGlobal("visualViewport", {
    ...box,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

// ===== placeAnchored: main + cross axis math =============================

describe("placeAnchored — placement × align math (flip/clamp off)", () => {
  // anchor: left 100, top 100, w 50, h 20 → right 150, bottom 120.
  // panel: 80 × 40. offset default 4.
  const cases: { placement: PopoverPlacement; align: PopoverAlign; left: number; top: number }[] = [
    { placement: "bottom", align: "start", left: 100, top: 124 },
    { placement: "bottom", align: "center", left: 85, top: 124 },
    { placement: "bottom", align: "end", left: 70, top: 124 },
    { placement: "top", align: "start", left: 100, top: 56 },
    { placement: "top", align: "center", left: 85, top: 56 },
    { placement: "top", align: "end", left: 70, top: 56 },
    { placement: "right", align: "start", left: 154, top: 100 },
    { placement: "right", align: "center", left: 154, top: 90 },
    { placement: "right", align: "end", left: 154, top: 80 },
    { placement: "left", align: "start", left: 16, top: 100 },
    { placement: "left", align: "center", left: 16, top: 90 },
    { placement: "left", align: "end", left: 16, top: 80 },
  ];

  for (const c of cases) {
    it(`${c.placement}/${c.align} → left ${c.left.toString()}, top ${c.top.toString()}`, () => {
      const anchor = document.createElement("button");
      const panel = document.createElement("div");
      document.body.append(anchor, panel);
      stubRect(anchor, 100, 100, 50, 20);
      stubSize(panel, 80, 40);
      placeAnchored(panel, anchor, {
        placement: c.placement,
        align: c.align,
        flip: false,
        clamp: false,
      });
      expect(panel.style.position).toBe("fixed");
      expect(leftOf(panel)).toBe(c.left);
      expect(topOf(panel)).toBe(c.top);
    });
  }

  it("honors a custom offset on the main axis", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", offset: 10, flip: false, clamp: false });
    expect(topOf(panel)).toBe(130); // bottom 120 + 10
  });

  it("defaults to bottom/start when no options are given", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    vi.stubGlobal("innerWidth", 2000);
    vi.stubGlobal("innerHeight", 2000);
    placeAnchored(panel, anchor);
    expect(leftOf(panel)).toBe(100); // start
    expect(topOf(panel)).toBe(124); // bottom + default offset 4
  });
});

// ===== placeAnchored: flip ================================================

describe("placeAnchored — flip", () => {
  it("bottom flips to top when it overflows the bottom edge and there is more room above", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 200);
    stubRect(anchor, 100, 170, 50, 20); // bottom 190, near the viewport bottom
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom" });
    // Flipped above: top = rect.top - panelH - offset = 170 - 40 - 4 = 126.
    expect(topOf(panel)).toBe(126);
  });

  it("top flips to bottom when it overflows the top edge and there is more room below", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 200);
    stubRect(anchor, 100, 10, 50, 20); // bottom 30, near the viewport top
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "top" });
    // Flipped below: top = rect.bottom + offset = 30 + 4 = 34.
    expect(topOf(panel)).toBe(34);
  });

  it("right flips to left when it overflows the right edge and there is more room left", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect(anchor, 170, 100, 20, 20); // right 190, near the viewport right
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "right", clamp: false });
    // Flipped left: left = rect.left - panelW - offset = 170 - 80 - 4 = 86.
    expect(leftOf(panel)).toBe(86);
  });

  it("left flips to right when it overflows the left edge and there is more room right", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 1000);
    stubRect(anchor, 10, 100, 20, 20); // right 30, near the viewport left
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "left", clamp: false });
    // Flipped right: left = rect.right + offset = 30 + 4 = 34.
    expect(leftOf(panel)).toBe(34);
  });

  it("does not flip when flip is disabled, even if it overflows", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 200);
    stubRect(anchor, 100, 170, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", flip: false, clamp: false });
    expect(topOf(panel)).toBe(194); // stays below: 190 + 4
  });

  it("does not flip when the opposite side has no more room", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 200);
    // Anchor high up: below overflows a tiny bit but above has even less room.
    stubRect(anchor, 100, 5, 50, 190); // top 5, bottom 195; spaceAbove 5, spaceBelow 5
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", clamp: false });
    // spaceAbove (5) is not > spaceBelow (5) → stays bottom: 195 + 4 = 199.
    expect(topOf(panel)).toBe(199);
  });
});

// ===== placeAnchored: clamp ===============================================

describe("placeAnchored — clamp", () => {
  it("clamps the cross-axis left to the upper bound for top/bottom", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, 180, 50, 50, 20); // start-align left would be 180
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", margin: 8 });
    // hi = 200 - 80 - 8 = 112.
    expect(leftOf(panel)).toBe(112);
  });

  it("clamps the cross-axis left to the lower bound (margin) for top/bottom", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, -50, 50, 50, 20); // start-align left would be -50
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", margin: 8 });
    expect(leftOf(panel)).toBe(8); // lower bound = margin
  });

  it("clamps the cross-axis top for left/right placements", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 200);
    stubRect(anchor, 50, 180, 20, 20); // start-align top would be 180
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "right", align: "start", margin: 8 });
    // hi = 200 - 40 - 8 = 152.
    expect(topOf(panel)).toBe(152);
  });

  it("does not clamp when clamp is disabled", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 200);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, 180, 50, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    expect(leftOf(panel)).toBe(180); // unclamped
  });

  it("pins to the leading margin when the panel is larger than the viewport", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    vi.stubGlobal("innerWidth", 100);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, 40, 50, 20, 20);
    stubSize(panel, 200, 40); // wider than the 100px viewport
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", flip: false, margin: 8 });
    // hi = 100 - 200 - 8 = -108 < lo (8) → pinned to the leading margin.
    expect(leftOf(panel)).toBe(8);
  });
});

// ===== placeAnchored: matchAnchorWidth ====================================

describe("placeAnchored — matchAnchorWidth", () => {
  it("true sets min-width to the anchor width", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { matchAnchorWidth: true, flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("50px");
  });

  it("a number sets min-width to max(anchorWidth, n) — floor applies", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20); // anchor width 50
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { matchAnchorWidth: 220, flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("220px"); // max(50, 220)
  });

  it("a number below the anchor width uses the anchor width", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 300, 20); // anchor width 300
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { matchAnchorWidth: 220, flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("300px"); // max(300, 220)
  });

  it("false (default) leaves min-width unset", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("");
  });
});

// ===== placeAnchored: visualViewport ======================================

describe("placeAnchored — visualViewport box", () => {
  it("clamps against the visualViewport offset box when present", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    // Visual viewport shifted right by 100 and down by 50 (mobile keyboard-ish).
    fakeVisualViewport({ offsetLeft: 100, offsetTop: 50, width: 300, height: 200 });
    stubRect(anchor, 0, 60, 20, 20); // start-align left would be 0
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", margin: 8 });
    // Lower bound uses the vv offset: lo = 100 + 8 = 108 (fallback would be 8).
    expect(leftOf(panel)).toBe(108);
  });

  it("flips using the visualViewport box edges", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    // vv bottom edge at offsetTop 0 + height 200 = 200.
    fakeVisualViewport({ offsetLeft: 0, offsetTop: 0, width: 1000, height: 200 });
    stubRect(anchor, 100, 170, 50, 20); // bottom 190 near vv bottom
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom" });
    expect(topOf(panel)).toBe(126); // flipped above
  });
});

// ===== placeAnchored: property ============================================

describe("placeAnchored — property", () => {
  it("the clamped cross-axis coord stays within the viewport box for random rects/sizes", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    const margin = 8;
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 1500 }),
        fc.integer({ min: -500, max: 1500 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 1, max: 900 }),
        fc.integer({ min: 1, max: 400 }),
        fc.constantFrom<PopoverAlign>("start", "center", "end"),
        fc.integer({ min: 0, max: 50 }),
        (al, at, aw, ah, pw, ph, align, offset) => {
          stubRect(anchor, al, at, aw, ah);
          stubSize(panel, pw, ph);
          // flip off so placement stays bottom (cross axis = horizontal).
          placeAnchored(panel, anchor, {
            placement: "bottom",
            align,
            offset,
            flip: false,
            clamp: true,
            margin,
          });
          const left = leftOf(panel);
          expect(left).toBeGreaterThanOrEqual(margin);
          expect(left).toBeLessThanOrEqual(1000 - pw - margin);
        },
      ),
    );
  });
});

// ===== createPopover: lifecycle ===========================================

describe("createPopover — show / hide / toggle + ARIA", () => {
  it("show() reveals, classes, positions, connects, and sets ARIA on the anchor", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.show();
    expect(c.isOpen).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains("uip-popover")).toBe(true);
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.isConnected).toBe(true);
    expect(panel.parentElement).toBe(document.body);
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    expect(anchor.getAttribute("aria-haspopup")).toBe("true");
    expect(topOf(panel)).toBe(124);
    expect(c.el).toBe(panel);
  });

  it("hide() conceals and resets aria-expanded (haspopup stays)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    c.hide();
    expect(c.isOpen).toBe(false);
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    expect(anchor.getAttribute("aria-haspopup")).toBe("true");
  });

  it("toggle() flips between shown and hidden", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.toggle();
    expect(c.isOpen).toBe(true);
    c.toggle();
    expect(c.isOpen).toBe(false);
  });

  it("fires onOpen and onClose", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const c = createPopover(anchor, panel, { onOpen, onClose });
    c.show();
    expect(onOpen).toHaveBeenCalledOnce();
    c.hide();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not move a panel that is already in the DOM", () => {
    const anchor = document.createElement("button");
    const container = document.createElement("section");
    const panel = document.createElement("div");
    container.appendChild(panel);
    document.body.append(anchor, container);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    expect(panel.parentElement).toBe(container); // not hoisted to body
  });

  it("show() while open just repositions (idempotent, no duplicate listeners)", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    c.show();
    vi.advanceTimersByTime(1);
    expect(netListeners(add, remove, "click")).toBe(1);
  });
});

// ===== createPopover: dismissal ===========================================

describe("createPopover — outside click / Escape dismissal", () => {
  it("closes on a click outside the panel and anchor (after the deferred install)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(anchor, outside);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1); // install the deferred listeners
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(false);
  });

  it("the opening click does not self-close (listeners are deferred a tick)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(anchor, outside);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    // Same-tick outside click: the handler is not installed yet.
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(true);
  });

  it("a click on the anchor does not close", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(true);
  });

  it("a click inside the panel does not close", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const inner = document.createElement("button");
    panel.appendChild(inner);
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(true);
  });

  it("closes on Escape", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(c.isOpen).toBe(false);
  });

  it("closeOnOutside=false keeps it open on an outside click", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(anchor, outside);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { closeOnOutside: false });
    c.show();
    vi.advanceTimersByTime(1);
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(true);
  });

  it("closeOnEscape=false keeps it open on Escape", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { closeOnEscape: false });
    c.show();
    vi.advanceTimersByTime(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(c.isOpen).toBe(true);
  });
});

// ===== createPopover: reposition tracking =================================

describe("createPopover — reposition tracking", () => {
  it("reposition() recomputes after the panel content changes size", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20); // right 150
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, {
      placement: "bottom",
      align: "end",
      flip: false,
      clamp: false,
    });
    c.show();
    expect(leftOf(panel)).toBe(70); // end: 150 - 80
    stubSize(panel, 120, 40); // content grew
    c.reposition();
    expect(leftOf(panel)).toBe(30); // end: 150 - 120
  });

  it("reposition() is a no-op while closed", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.reposition();
    expect(panel.style.left).toBe(""); // never positioned
  });

  it("a capture-phase scroll repositions to track the anchor", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    c.show();
    vi.advanceTimersByTime(1);
    expect(topOf(panel)).toBe(124);
    stubRect(anchor, 100, 50, 50, 20); // anchor scrolled up; bottom now 70
    document.dispatchEvent(new Event("scroll"));
    expect(topOf(panel)).toBe(74);
  });

  it("a window resize repositions", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    c.show();
    vi.advanceTimersByTime(1);
    stubRect(anchor, 200, 300, 50, 20); // moved
    window.dispatchEvent(new Event("resize"));
    expect(leftOf(panel)).toBe(200);
    expect(topOf(panel)).toBe(324);
  });
});

// ===== createPopover: dispose + listener hygiene ==========================

/** Net (added − removed) listener count for an event type across two spies. */
function netListeners(
  add: ReturnType<typeof vi.spyOn>,
  remove: ReturnType<typeof vi.spyOn>,
  type: string,
): number {
  const a = (add.mock.calls as unknown[][]).filter((c) => c[0] === type).length;
  const r = (remove.mock.calls as unknown[][]).filter((c) => c[0] === type).length;
  return a - r;
}

describe("createPopover — dispose + listener hygiene", () => {
  it("dispose removes document + window listeners and leaves the panel in the DOM", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");

    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    // Installed: click + keydown + capture scroll on document, resize on window.
    expect(netListeners(docAdd, docRemove, "click")).toBe(1);
    expect(netListeners(docAdd, docRemove, "keydown")).toBe(1);
    expect(netListeners(docAdd, docRemove, "scroll")).toBe(1);
    expect(netListeners(winAdd, winRemove, "resize")).toBe(1);

    c.dispose();
    expect(netListeners(docAdd, docRemove, "click")).toBe(0);
    expect(netListeners(docAdd, docRemove, "keydown")).toBe(0);
    expect(netListeners(docAdd, docRemove, "scroll")).toBe(0);
    expect(netListeners(winAdd, winRemove, "resize")).toBe(0);
    // The caller owns the panel — dispose does not remove it.
    expect(panel.isConnected).toBe(true);
  });

  it("hide() and dispose() on a never-shown popover are safe no-ops", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    const c = createPopover(anchor, panel);
    expect(c.isOpen).toBe(false);
    c.hide(); // no-op: already closed
    c.dispose(); // no-op: nothing installed
    expect(c.isOpen).toBe(false);
    expect(anchor.hasAttribute("aria-expanded")).toBe(false);
  });

  it("hide() before the deferred install fires clears the pending timer (no listeners)", () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    c.hide(); // before advancing timers
    vi.advanceTimersByTime(1); // the cancelled install must not run
    expect((docAdd.mock.calls as unknown[][]).filter((cc) => cc[0] === "click")).toHaveLength(0);
  });

  it("installs and removes visualViewport listeners", () => {
    const vvAdd = vi.fn();
    const vvRemove = vi.fn();
    vi.stubGlobal("visualViewport", {
      offsetLeft: 0,
      offsetTop: 0,
      width: 1000,
      height: 800,
      addEventListener: vvAdd,
      removeEventListener: vvRemove,
    });
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    const addedTypes = (vvAdd.mock.calls as unknown[][]).map((cc) => cc[0]);
    expect(addedTypes).toContain("resize");
    expect(addedTypes).toContain("scroll");
    c.dispose();
    const removedTypes = (vvRemove.mock.calls as unknown[][]).map((cc) => cc[0]);
    expect(removedTypes).toContain("resize");
    expect(removedTypes).toContain("scroll");
  });
});
