import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";

import {
  placeAnchored,
  createPopover,
  pointAnchor,
  type PopoverAlign,
  type PopoverPlacement,
} from "./popover.js";

// These tests exercise the placement MATH, so they feed it a chosen anchor rect
// and a chosen viewport instead of laying out a real page: `stubRect` mocks the
// anchor box and `stubSize` the panel's measured size.
//
// The viewport goes through `stubViewport`, which stubs window.visualViewport
// as well as innerWidth/innerHeight, because `viewportBox()` in popover.ts
// prefers visualViewport and only falls back to innerWidth/innerHeight when it
// is absent. A real browser always has a visualViewport, so stubbing the two
// inner* globals alone silently measures the true window and every flip/clamp
// assertion reads the unflipped value. Stub both, or neither.
//
// The four tests that assert the visualViewport path itself (offset boxes,
// pinch-zoom) call `fakeVisualViewport` directly with the box they need.

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

/**
 * Present a viewport of exactly `width` x `height` at the origin.
 *
 * Stubs all three globals a browser exposes for it, because production reads
 * visualViewport first; stubbing only innerWidth/innerHeight leaves the real
 * window in play and the assertion silently measures the wrong box.
 */
function stubViewport(width: number, height: number): void {
  fakeVisualViewport({ offsetLeft: 0, offsetTop: 0, width, height });
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
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
    stubViewport(2000, 2000);
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
    stubViewport(1000, 200);
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
    stubViewport(1000, 200);
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
    stubViewport(200, 1000);
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
    stubViewport(200, 1000);
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
    stubViewport(1000, 200);
    stubRect(anchor, 100, 170, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", flip: false, clamp: false });
    expect(topOf(panel)).toBe(194); // stays below: 190 + 4
  });

  it("does not flip when the opposite side has no more room", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(1000, 200);
    // Anchor high up: below overflows a tiny bit but above has even less room.
    stubRect(anchor, 100, 5, 50, 190); // top 5, bottom 195; spaceAbove 5, spaceBelow 5
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", clamp: false });
    // spaceAbove (5) is not > spaceBelow (5) → stays bottom: 195 + 4 = 199.
    expect(topOf(panel)).toBe(199);
  });
});

// ===== placeAnchored: flip boundaries =====================================

// The flip engine decides per axis: does the panel overflow the viewport edge
// (beyond `margin`), AND does the opposite side have strictly more room? These
// pin both halves and the exact edge of the overflow test, which the coarse
// cases above (huge overflows, huge asymmetries) cannot distinguish.
// offset 4 and margin 8 are the defaults throughout.

interface FlipBoundaryCase {
  readonly name: string;
  readonly vpWidth: number;
  readonly vpHeight: number;
  readonly rect: readonly [left: number, top: number, width: number, height: number];
  readonly placement: PopoverPlacement;
  readonly expected: number;
}

describe("placeAnchored — flip boundaries (vertical)", () => {
  const cases: readonly FlipBoundaryCase[] = [
    {
      name: "keeps a bottom placement that fits, even when there is more room above",
      vpWidth: 1000,
      vpHeight: 800,
      rect: [100, 500, 50, 20], // bottom 520 + 4 + 40 = 564, well inside 792
      placement: "bottom",
      expected: 524,
    },
    {
      name: "keeps a bottom placement whose panel exactly fits inside the bottom margin",
      vpWidth: 1000,
      vpHeight: 200,
      rect: [100, 128, 50, 20], // 148 + 4 + 40 = 192 = 200 - margin 8 → not over
      placement: "bottom",
      expected: 152,
    },
    {
      name: "flips a bottom placement that overflows the bottom margin by one pixel",
      vpWidth: 1000,
      vpHeight: 200,
      rect: [100, 129, 50, 20], // 149 + 44 = 193 > 192 → over by 1
      placement: "bottom",
      expected: 85, // above: 129 - 40 - 4
    },
    {
      name: "keeps a top placement when the room above and below is equal",
      vpWidth: 1000,
      vpHeight: 200,
      rect: [100, 5, 50, 190], // spaceAbove 5, spaceBelow 5 → no strictly-more room
      placement: "top",
      expected: -39,
    },
    {
      name: "keeps a top placement whose panel exactly reaches the top margin",
      vpWidth: 1000,
      vpHeight: 800,
      rect: [100, 52, 50, 20], // 52 - 4 - 40 = 8 = margin → not over
      placement: "top",
      expected: 8,
    },
    {
      name: "flips a top placement that overflows the top margin by one pixel",
      vpWidth: 1000,
      vpHeight: 800,
      rect: [100, 51, 50, 20], // 51 - 44 = 7 < 8 → over by 1
      placement: "top",
      expected: 75, // below: 71 + 4
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const anchor = document.createElement("button");
      const panel = document.createElement("div");
      document.body.append(anchor, panel);
      stubViewport(c.vpWidth, c.vpHeight);
      stubRect(anchor, c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
      stubSize(panel, 80, 40);
      placeAnchored(panel, anchor, { placement: c.placement });
      expect(topOf(panel)).toBe(c.expected);
    });
  }
});

describe("placeAnchored — flip boundaries (horizontal)", () => {
  const cases: readonly FlipBoundaryCase[] = [
    {
      name: "keeps a right placement that fits, even when there is more room left",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [500, 100, 50, 20], // right 550 + 4 + 80 = 634, well inside 992
      placement: "right",
      expected: 554,
    },
    {
      name: "keeps a right placement when the room left and right is equal",
      vpWidth: 200,
      vpHeight: 1000,
      rect: [5, 100, 190, 20], // spaceLeft 5, spaceRight 5 → no strictly-more room
      placement: "right",
      expected: 199,
    },
    {
      name: "keeps a right placement whose panel exactly fits inside the right margin",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [858, 100, 50, 20], // 908 + 4 + 80 = 992 = 1000 - margin 8 → not over
      placement: "right",
      expected: 912,
    },
    {
      name: "flips a right placement that overflows the right margin by one pixel",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [859, 100, 50, 20], // 909 + 84 = 993 > 992 → over by 1
      placement: "right",
      expected: 775, // left: 859 - 80 - 4
    },
    {
      name: "keeps a left placement that fits, even when there is more room right",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [200, 100, 50, 20], // 200 - 4 - 80 = 116, well inside the margin
      placement: "left",
      expected: 116,
    },
    {
      name: "keeps a left placement when the room right and left is equal",
      vpWidth: 200,
      vpHeight: 1000,
      rect: [5, 100, 190, 20],
      placement: "left",
      expected: -79,
    },
    {
      name: "keeps a left placement whose panel exactly reaches the left margin",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [92, 100, 50, 20], // 92 - 4 - 80 = 8 = margin → not over
      placement: "left",
      expected: 8,
    },
    {
      name: "flips a left placement that overflows the left margin by one pixel",
      vpWidth: 1000,
      vpHeight: 1000,
      rect: [91, 100, 50, 20], // 91 - 84 = 7 < 8 → over by 1
      placement: "left",
      expected: 145, // right: 141 + 4
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const anchor = document.createElement("button");
      const panel = document.createElement("div");
      document.body.append(anchor, panel);
      stubViewport(c.vpWidth, c.vpHeight);
      stubRect(anchor, c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
      stubSize(panel, 80, 40);
      placeAnchored(panel, anchor, { placement: c.placement });
      expect(leftOf(panel)).toBe(c.expected);
    });
  }
});

// ===== placeAnchored: clamp ===============================================

describe("placeAnchored — clamp", () => {
  it("clamps the cross-axis left to the upper bound for top/bottom", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(200, 800);
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
    stubViewport(200, 800);
    stubRect(anchor, -50, 50, 50, 20); // start-align left would be -50
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", margin: 8 });
    expect(leftOf(panel)).toBe(8); // lower bound = margin
  });

  it("clamps the cross-axis top for left/right placements", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(800, 200);
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
    stubViewport(200, 800);
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
    stubViewport(100, 800);
    stubRect(anchor, 40, 50, 20, 20);
    stubSize(panel, 200, 40); // wider than the 100px viewport
    placeAnchored(panel, anchor, { placement: "bottom", align: "start", flip: false, margin: 8 });
    // hi = 100 - 200 - 8 = -108 < lo (8) → pinned to the leading margin.
    expect(leftOf(panel)).toBe(8);
  });

  it("clamps the cross-axis left for a top placement too, not the main axis", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(200, 800);
    stubRect(anchor, 180, 400, 50, 20); // start-align left would be 180
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "top", align: "start", flip: false, margin: 8 });
    expect(leftOf(panel)).toBe(112); // hi = 200 - 80 - 8
    expect(topOf(panel)).toBe(356); // main axis untouched: 400 - 40 - 4
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

  it("measures the room above from the visualViewport's top edge, not the document's", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    // Pinch-zoomed / keyboard-shifted: the visible box starts 100px down.
    fakeVisualViewport({ offsetLeft: 0, offsetTop: 100, width: 1000, height: 200 });
    stubRect(anchor, 100, 110, 50, 10); // bottom 120; only 10px of visible room above
    stubSize(panel, 80, 180);
    placeAnchored(panel, anchor, { placement: "bottom" });
    // Overflows below (120 + 4 + 180 > 292), but the room above is 110 - 100 =
    // 10px, less than the 180px below — measuring from the document top (210)
    // would flip it into the hidden strip above the visible box.
    expect(topOf(panel)).toBe(124);
  });

  it("measures the room to the left from the visualViewport's left edge, not the document's", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    fakeVisualViewport({ offsetLeft: 100, offsetTop: 0, width: 200, height: 1000 });
    stubRect(anchor, 110, 100, 10, 20); // right 120; only 10px of visible room left
    stubSize(panel, 180, 40);
    placeAnchored(panel, anchor, { placement: "right" });
    // Overflows right (120 + 4 + 180 > 292), but the visible room left is 10px
    // against 180px right, so it stays right.
    expect(leftOf(panel)).toBe(124);
  });
});

// ===== placeAnchored: property ============================================

describe("placeAnchored — property", () => {
  it("the clamped cross-axis coord stays within the viewport box for random rects/sizes", () => {
    vi.stubGlobal("visualViewport", undefined);
    stubViewport(1000, 800);
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

  it("hide() begins the leave (aria reset immediately) then conceals after the transition", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    c.hide();
    // Logically closed at once; the panel fades (is-leaving) before it hides.
    expect(c.isOpen).toBe(false);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(panel.classList.contains("is-leaving")).toBe(true);
    expect(panel.hidden).toBe(false); // still in the DOM, mid-fade
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    expect(anchor.getAttribute("aria-haspopup")).toBe("true");
    // Transition ends → panel is hidden and the leave state is dropped.
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains("is-leaving")).toBe(false);
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

  it("advertises a custom aria-haspopup value from the haspopup option", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { haspopup: "listbox" });
    c.show();
    expect(anchor.getAttribute("aria-haspopup")).toBe("listbox");
    c.dispose();
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
    stubViewport(1000, 800);
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
    vi.advanceTimersToNextFrame(); // tracking is rAF-throttled — flush the frame
    expect(topOf(panel)).toBe(74);
  });

  it("a scroll in an ancestor container repositions (non-bubbling, so capture-phase)", () => {
    const scroller = document.createElement("div");
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    scroller.appendChild(anchor);
    document.body.append(scroller, panel);
    stubViewport(1000, 800);
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
    stubRect(anchor, 100, 50, 50, 20); // the container scrolled the anchor up
    // A real element scroll event does NOT bubble, so only a capture-phase
    // listener on document sees it.
    scroller.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(topOf(panel)).toBe(74);
    c.dispose();
  });

  it("a window resize repositions", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubViewport(1000, 800);
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
    vi.advanceTimersToNextFrame(); // tracking is rAF-throttled — flush the frame
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

// ===== createPopover: focus management (opt-in) ===========================

describe("createPopover — focus management", () => {
  it("initialFocus focuses the given element after show", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const field = document.createElement("input");
    panel.appendChild(field);
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { initialFocus: field, flip: false, clamp: false });
    c.show();
    expect(document.activeElement).toBe(field);
  });

  it("leaves focus alone on show when initialFocus is omitted", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const before = document.createElement("button");
    document.body.append(before, anchor, panel);
    before.focus();
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.show();
    expect(document.activeElement).toBe(before); // unchanged — caller owns focus
  });

  it("a detached initialFocus target is a safe no-op", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const before = document.createElement("button");
    const detached = document.createElement("input"); // never connected
    document.body.append(before, anchor, panel);
    before.focus();
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { initialFocus: detached, flip: false, clamp: false });
    c.show();
    expect(document.activeElement).toBe(before); // detached target ignored
  });

  it("returnFocus:true restores the pre-show active element on hide", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const trigger = document.createElement("button");
    document.body.append(trigger, anchor, panel);
    trigger.focus(); // focused at open time
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { returnFocus: true, flip: false, clamp: false });
    c.show();
    anchor.focus(); // focus moves elsewhere while open
    expect(document.activeElement).toBe(anchor);
    c.hide();
    expect(document.activeElement).toBe(trigger); // restored to the pre-show element
  });

  it("returnFocus as an element focuses that element on hide", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const target = document.createElement("button");
    document.body.append(anchor, panel, target);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { returnFocus: target, flip: false, clamp: false });
    c.show();
    c.hide();
    expect(document.activeElement).toBe(target);
  });

  it("leaves focus alone on hide when returnFocus is unset", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const trigger = document.createElement("button");
    document.body.append(trigger, anchor, panel);
    trigger.focus();
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.show();
    anchor.focus(); // focus moved while open
    c.hide();
    expect(document.activeElement).toBe(anchor); // hide did NOT restore to trigger
  });

  it("moves focus back out on hide when initialFocus moved it in but returnFocus was omitted", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const field = document.createElement("input");
    const opener = document.createElement("button");
    panel.appendChild(field);
    document.body.append(opener, anchor, panel);
    opener.focus(); // the user's place before the popover opens
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    // initialFocus set, returnFocus deliberately OMITTED — the focus-loss trap.
    const c = createPopover(anchor, panel, { initialFocus: field, flip: false, clamp: false });
    c.show();
    expect(document.activeElement).toBe(field); // controller moved focus into the panel
    c.hide();
    // Focus is NOT stranded on the now-hidden panel field and NOT dropped to
    // <body> — it returns to the opener so the user keeps their place (WCAG 2.4.3).
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement).not.toBe(field);
  });

  it("blurs focus off the hidden panel on hide when initialFocus moved it in and the restore target is gone", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const field = document.createElement("input");
    const opener = document.createElement("button");
    panel.appendChild(field);
    document.body.append(opener, anchor, panel);
    opener.focus(); // captured as the restore target when focus moves into the panel
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { initialFocus: field, flip: false, clamp: false });
    c.show();
    expect(document.activeElement).toBe(field); // controller moved focus into the panel
    opener.remove(); // the restore target is removed while the popover is open
    c.hide();
    // Restore target gone: focus can't return to it, so the controller must move
    // focus OUT of the now-hidden panel (WCAG 2.4.3) rather than strand it on the field.
    expect(document.activeElement).not.toBe(field);
    expect(panel.contains(document.activeElement)).toBe(false);
  });

  it("a detached returnFocus target is a safe no-op on hide", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    const detached = document.createElement("button"); // never connected
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { returnFocus: detached, flip: false, clamp: false });
    c.show();
    c.hide();
    expect(document.activeElement).not.toBe(detached); // never focused the detached node
  });
});

// ===== createPopover: Escape isolation ====================================

describe("createPopover — Escape isolation", () => {
  it("stops propagation so an outer (window-level) Escape handler does not also fire", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    // An outer handler above the popover's document listener in the propagation
    // path — e.g. a modal's own Escape-to-close handler.
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1); // install the deferred keydown listener
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    const stopSpy = vi.spyOn(ev, "stopPropagation");
    document.dispatchEvent(ev);
    // Snapshot before assertions so cleanup always runs even if one fails.
    const outerCalls = outer.mock.calls.length;
    const stopCalls = stopSpy.mock.calls.length;
    window.removeEventListener("keydown", outer);
    expect(c.isOpen).toBe(false); // popover handled Escape and closed
    expect(stopCalls).toBeGreaterThanOrEqual(1); // it called stopPropagation
    expect(outerCalls).toBe(0); // the outer handler was isolated from this Escape
  });

  it("does not stop propagation for non-Escape keys", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    vi.advanceTimersByTime(1);
    const ev = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
    const stopSpy = vi.spyOn(ev, "stopPropagation");
    document.dispatchEvent(ev);
    expect(stopSpy).not.toHaveBeenCalled();
    expect(c.isOpen).toBe(true); // still open — only Escape closes
  });
});

// ===== createPopover: rAF-throttled reposition tracking ===================

describe("createPopover — rAF-throttled reposition tracking", () => {
  it("coalesces a burst of scroll events into one placeAnchored per frame", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubViewport(1000, 800);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    c.show();
    vi.advanceTimersByTime(1); // install the deferred tracking listeners
    // placeAnchored reads anchor.getBoundingClientRect() exactly once per call,
    // so its call count is the reposition count. Spy after show() so we measure
    // only tracking-driven repositions.
    const rectSpy = vi.spyOn(anchor, "getBoundingClientRect");
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    expect(rectSpy).not.toHaveBeenCalled(); // coalesced — nothing until the frame
    vi.advanceTimersToNextFrame(); // run the single pending frame
    expect(rectSpy).toHaveBeenCalledOnce(); // ONE reposition for the whole burst
    // A later burst in a new frame repositions again — the frame id resets.
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(rectSpy).toHaveBeenCalledTimes(2);
  });

  it("public reposition() stays synchronous (not throttled)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.show();
    const rectSpy = vi.spyOn(anchor, "getBoundingClientRect");
    c.reposition();
    expect(rectSpy).toHaveBeenCalledOnce(); // immediate — no frame flush needed
  });

  it("cancels a pending tracking frame on hide (no reposition after close)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubViewport(1000, 800);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel, { flip: false, clamp: false });
    c.show();
    vi.advanceTimersByTime(1);
    const rectSpy = vi.spyOn(anchor, "getBoundingClientRect");
    document.dispatchEvent(new Event("scroll")); // schedule a frame
    c.hide(); // cancels the pending frame
    vi.advanceTimersToNextFrame();
    expect(rectSpy).not.toHaveBeenCalled(); // the cancelled frame never ran
  });
});

// ===== createPopover: dispose ARIA cleanup ================================

describe("createPopover — dispose ARIA cleanup", () => {
  it("dispose removes aria-haspopup and aria-expanded from the anchor", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.appendChild(anchor);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    const c = createPopover(anchor, panel);
    c.show();
    expect(anchor.getAttribute("aria-haspopup")).toBe("true");
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    c.dispose();
    expect(anchor.hasAttribute("aria-haspopup")).toBe(false);
    expect(anchor.hasAttribute("aria-expanded")).toBe(false);
  });
});

// ===== pointAnchor ========================================================

describe("pointAnchor", () => {
  it("returns a zero-size rect with left/top/right/bottom = x/y and width/height 0", () => {
    const rect = pointAnchor(300, 200).getBoundingClientRect();
    expect(rect.left).toBe(300);
    expect(rect.right).toBe(300);
    expect(rect.top).toBe(200);
    expect(rect.bottom).toBe(200);
    expect(rect.x).toBe(300);
    expect(rect.y).toBe(200);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
    expect(rect.toJSON()).toEqual({}); // DOMRect shape completeness
  });
});

// ===== placeAnchored: virtual anchor ======================================

describe("placeAnchored — virtual anchor", () => {
  it("positions at a point (bottom/start): left = x, top = y + offset", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    stubSize(panel, 80, 40);
    placeAnchored(panel, pointAnchor(300, 200), {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    expect(leftOf(panel)).toBe(300);
    expect(topOf(panel)).toBe(204); // 200 + default offset 4
  });

  it("a virtual anchor with a non-zero rect positions like an element rect", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    stubSize(panel, 80, 40);
    // Same rect an element test uses (left 100, top 100, w 50, h 20).
    const virtual = { getBoundingClientRect: (): DOMRect => rectOf(100, 100, 50, 20) };
    placeAnchored(panel, virtual, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    expect(leftOf(panel)).toBe(100); // rect.left
    expect(topOf(panel)).toBe(124); // rect.bottom 120 + 4
  });
});

// ===== createPopover: point (virtual) anchor ==============================

describe("createPopover — point (virtual) anchor", () => {
  it("show() does not throw and sets NO aria on any element", () => {
    const panel = document.createElement("div");
    // A nearby real element that must stay untouched — there is no trigger
    // element for a point anchor, so nothing should be annotated.
    const probe = document.createElement("button");
    document.body.appendChild(probe);
    stubSize(panel, 80, 40);
    const c = createPopover(pointAnchor(300, 200), panel, { flip: false, clamp: false });
    expect(() => {
      c.show();
    }).not.toThrow();
    expect(c.isOpen).toBe(true);
    expect(probe.hasAttribute("aria-expanded")).toBe(false);
    expect(probe.hasAttribute("aria-haspopup")).toBe(false);
    expect(panel.hasAttribute("aria-expanded")).toBe(false);
    expect(panel.hasAttribute("aria-haspopup")).toBe(false);
    c.dispose();
  });

  it("positions the panel at the point (bottom/start opens just below-right)", () => {
    const panel = document.createElement("div");
    stubSize(panel, 80, 40);
    const c = createPopover(pointAnchor(300, 200), panel, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    c.show();
    expect(panel.isConnected).toBe(true); // hoisted to body (was detached)
    expect(leftOf(panel)).toBe(300);
    expect(topOf(panel)).toBe(204);
  });

  it("a click inside the panel keeps it open; an outside click closes it", () => {
    const panel = document.createElement("div");
    const inner = document.createElement("button");
    panel.appendChild(inner);
    const outside = document.createElement("div");
    document.body.append(panel, outside);
    stubSize(panel, 80, 40);
    const c = createPopover(pointAnchor(300, 200), panel, { flip: false, clamp: false });
    c.show();
    vi.advanceTimersByTime(1); // install the deferred listeners
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(true); // panel-internal click keeps it open
    outside.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(false); // no anchor to exempt — any outside click closes
  });

  it("Escape closes and dispose() does not throw", () => {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    stubSize(panel, 80, 40);
    const c = createPopover(pointAnchor(300, 200), panel, { flip: false, clamp: false });
    c.show();
    vi.advanceTimersByTime(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(c.isOpen).toBe(false);
    expect(() => {
      c.dispose();
    }).not.toThrow();
  });

  it("a non-point virtual anchor positions and tracks on scroll", () => {
    stubViewport(1000, 800);
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    stubSize(panel, 80, 40);
    // A movable virtual rect source (not a point): re-read fresh each placement.
    let top = 100;
    const virtual = { getBoundingClientRect: (): DOMRect => rectOf(100, top, 50, 20) };
    const c = createPopover(virtual, panel, {
      placement: "bottom",
      align: "start",
      flip: false,
      clamp: false,
    });
    c.show();
    vi.advanceTimersByTime(1);
    expect(topOf(panel)).toBe(124); // bottom 120 + 4
    top = 50; // the virtual rect moved up; bottom now 70
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame(); // tracking is rAF-throttled — flush the frame
    expect(topOf(panel)).toBe(74);
    c.dispose();
  });
});

// ===== placeAnchored: full-bleed (stretch: "viewport") ====================

describe("placeAnchored — full-bleed (stretch: viewport)", () => {
  it("bottom spans the viewport inline axis (left+right = margin) and drops below the anchor", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(500, 800);
    stubRect(anchor, 100, 100, 50, 20); // bottom 120
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", stretch: "viewport", flip: false });
    expect(panel.style.left).toBe("8px"); // default margin
    expect(panel.style.right).toBe("8px");
    expect(topOf(panel)).toBe(124); // rect.bottom 120 + default offset 4
    expect(panel.style.minWidth).toBe(""); // full-bleed clears any min-width
  });

  it("respects a custom margin on both inline edges (margin 0 → flush edges)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, {
      placement: "bottom",
      stretch: "viewport",
      margin: 0,
      flip: false,
    });
    expect(panel.style.left).toBe("0px");
    expect(panel.style.right).toBe("0px");
  });

  it("top places the panel above the anchor, still full-width", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20); // top 100
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "top", stretch: "viewport", flip: false });
    expect(panel.style.left).toBe("8px");
    expect(panel.style.right).toBe("8px");
    expect(topOf(panel)).toBe(56); // rect.top 100 - panelH 40 - offset 4
  });

  it("flips bottom → top on the main axis when there is no room below", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(500, 200);
    stubRect(anchor, 100, 170, 50, 20); // bottom 190 near the viewport bottom
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", stretch: "viewport" });
    expect(topOf(panel)).toBe(126); // flipped above: 170 - 40 - 4
    expect(panel.style.left).toBe("8px"); // still full-width
    expect(panel.style.right).toBe("8px");
  });

  it("is ignored for a left/right placement (content-sized; no inline-end pin)", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubViewport(800, 800);
    stubRect(anchor, 100, 100, 50, 20); // right 150
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, {
      placement: "right",
      stretch: "viewport",
      flip: false,
      clamp: false,
    });
    expect(leftOf(panel)).toBe(154); // content-sized right: rect.right 150 + offset 4
    expect(panel.style.right).toBe(""); // no inline-end pin outside full-bleed
  });

  it("clears a stale inline-end pin when the same panel is re-placed content-sized", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);
    placeAnchored(panel, anchor, { placement: "bottom", stretch: "viewport", flip: false });
    expect(panel.style.right).toBe("8px");
    // Re-place without stretch → the inline-end pin must drop so the panel's own
    // width is honored again (placeAnchored stays idempotent across modes).
    placeAnchored(panel, anchor, { placement: "bottom", flip: false, clamp: false });
    expect(panel.style.right).toBe("");
    expect(leftOf(panel)).toBe(100); // start-aligned content-sized left
  });

  it("property: pins both inline edges to `margin` regardless of anchor x/width", () => {
    vi.stubGlobal("visualViewport", undefined);
    stubViewport(500, 800);
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 1500 }),
        fc.integer({ min: -200, max: 700 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 0, max: 40 }),
        (ax, ay, aw, ph, margin) => {
          stubRect(anchor, ax, ay, aw, 20);
          stubSize(panel, 80, ph);
          placeAnchored(panel, anchor, {
            placement: "bottom",
            stretch: "viewport",
            margin,
            flip: false,
          });
          // Full-bleed always pins to the margins, whatever the anchor's x/width.
          expect(panel.style.left).toBe(`${margin.toString()}px`);
          expect(panel.style.right).toBe(`${margin.toString()}px`);
          // Main axis stays anchored below the trigger (bottom + default offset 4).
          expect(topOf(panel)).toBe(ay + 20 + 4);
        },
      ),
    );
  });
});

// ===== createPopover: leave animation lifecycle ===========================

/** A popover with a stubbed anchor rect + panel size, anchor mounted in the DOM.
 *  Focused helper for the leave-lifecycle tests (placement math is covered
 *  above); flip/clamp are off so positioning never interferes with the assertions. */
function mountPopover(opts?: Parameters<typeof createPopover>[2]): {
  c: ReturnType<typeof createPopover>;
  anchor: HTMLButtonElement;
  panel: HTMLDivElement;
} {
  const anchor = document.createElement("button");
  const panel = document.createElement("div");
  document.body.appendChild(anchor);
  stubRect(anchor, 100, 100, 50, 20);
  stubSize(panel, 80, 40);
  const c = createPopover(anchor, panel, { flip: false, clamp: false, ...opts });
  return { c, anchor, panel };
}

describe("createPopover — leave animation lifecycle", () => {
  it("show enters clean: is-open set, is-leaving absent, visible", () => {
    const { c, panel } = mountPopover();
    c.show();
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.classList.contains("is-leaving")).toBe(false);
    expect(panel.hidden).toBe(false);
  });

  it("hide swaps is-open → is-leaving and keeps the panel visible until transitionend", () => {
    const { c, panel } = mountPopover();
    c.show();
    c.hide();
    expect(c.isOpen).toBe(false);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(panel.classList.contains("is-leaving")).toBe(true);
    expect(panel.hidden).toBe(false); // still in the DOM, mid-fade
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.classList.contains("is-leaving")).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it("completes the leave via the fallback timeout when no transition fires", () => {
    const { c, panel } = mountPopover();
    c.show();
    c.hide();
    expect(panel.hidden).toBe(false);
    vi.advanceTimersByTime(400); // LEAVE_FALLBACK_MS
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains("is-leaving")).toBe(false);
  });

  it("only the panel's own transitionend finalizes it (a descendant's is ignored)", () => {
    const { c, panel } = mountPopover();
    const child = document.createElement("span");
    panel.appendChild(child);
    c.show();
    c.hide();
    child.dispatchEvent(new Event("transitionend", { bubbles: true }));
    expect(panel.hidden).toBe(false); // a child's transition is not the panel's
    expect(panel.classList.contains("is-leaving")).toBe(true);
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.hidden).toBe(true);
  });

  it("hide() is idempotent: a second hide mid-fade does not restart the leave", () => {
    const { c, panel } = mountPopover();
    c.show();
    c.hide();
    c.hide(); // no-op: open is already false
    expect(panel.classList.contains("is-leaving")).toBe(true);
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.hidden).toBe(true);
  });

  it("show() during the fade cancels the leave and re-reveals (no pending hide fires)", () => {
    const { c, panel } = mountPopover();
    c.show();
    c.hide();
    expect(panel.classList.contains("is-leaving")).toBe(true);
    c.show(); // re-open mid-fade
    expect(c.isOpen).toBe(true);
    expect(panel.classList.contains("is-leaving")).toBe(false);
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(panel.hidden).toBe(false);
    // The cancelled leave must NOT later hide the re-shown panel.
    vi.advanceTimersByTime(400);
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.hidden).toBe(false);
    expect(c.isOpen).toBe(true);
  });

  it("leave still completes without a transition event (the reduced-motion path)", () => {
    // Under prefers-reduced-motion the CSS neutralizes the transition to ~0ms
    // and no transitionend arrives, so the fallback timer is what guarantees
    // the leave lifecycle still finishes promptly. Fake timers reproduce that
    // shape: a suspended clock advances no CSS transition either.
    const { c, panel } = mountPopover();
    c.show();
    c.hide();
    vi.advanceTimersByTime(400);
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains("is-leaving")).toBe(false);
  });

  it("threads stretch into positioning and toggles is-stretched around the leave", () => {
    const { c, panel } = mountPopover({ stretch: "viewport", placement: "bottom" });
    c.show();
    expect(panel.classList.contains("is-stretched")).toBe(true);
    expect(panel.style.left).toBe("8px"); // full-bleed inline pin from placeAnchored
    expect(panel.style.right).toBe("8px");
    c.hide();
    expect(panel.classList.contains("is-stretched")).toBe(true); // kept during the fade
    panel.dispatchEvent(new Event("transitionend"));
    expect(panel.classList.contains("is-stretched")).toBe(false);
  });

  it("does not add is-stretched for a normal (content-sized) popover", () => {
    const { c, panel } = mountPopover();
    c.show();
    expect(panel.classList.contains("is-stretched")).toBe(false);
  });

  it("marks a top-placed stretch popover is-stretched too (both vertical sides)", () => {
    const { c, panel } = mountPopover({ stretch: "viewport", placement: "top" });
    c.show();
    expect(panel.classList.contains("is-stretched")).toBe(true);
  });

  it("does not mark a left/right-placed stretch popover is-stretched (full-bleed is vertical only)", () => {
    const { c, panel } = mountPopover({ stretch: "viewport", placement: "right" });
    c.show();
    expect(panel.classList.contains("is-stretched")).toBe(false);
  });

  it("dispose() runs the leave and leaves the caller's panel in the DOM", () => {
    const { c, panel } = mountPopover();
    c.show();
    c.dispose();
    // dispose triggers the fade rather than yanking the panel out instantly.
    expect(panel.classList.contains("is-leaving")).toBe(true);
    expect(panel.isConnected).toBe(true);
    vi.advanceTimersByTime(400);
    expect(panel.hidden).toBe(true);
    expect(panel.isConnected).toBe(true); // the caller owns it; never removed
  });
});

describe("createPopover: setOptions (responsive placement)", () => {
  it("flips a live open popover between content-sized and full-bleed stretch", () => {
    stubViewport(1000, 800);
    const anchor = document.createElement("button");
    stubRect(anchor, 100, 50, 200, 40);
    const panel = document.createElement("div");
    stubSize(panel, 300, 200);
    document.body.append(anchor, panel);

    const pop = createPopover(anchor, panel, { placement: "bottom", offset: 6, margin: 8 });
    pop.show();
    expect(panel.classList.contains("is-stretched")).toBe(false);
    expect(leftOf(panel)).toBe(100);
    expect(topOf(panel)).toBe(96); // anchor bottom 90 + offset 6

    // Breakpoint flip: full-bleed, flush to the edges, larger offset.
    pop.setOptions({ stretch: "viewport", margin: 0, offset: 10 });
    expect(panel.classList.contains("is-stretched")).toBe(true);
    expect(panel.style.left).toBe("0px");
    expect(panel.style.right).toBe("0px");
    expect(topOf(panel)).toBe(100); // anchor bottom 90 + offset 10

    // And back: explicit undefined clears stretch; the inline-end pin is
    // cleared so the panel is content-sized again.
    pop.setOptions({ stretch: undefined, margin: 8, offset: 6 });
    expect(panel.classList.contains("is-stretched")).toBe(false);
    expect(panel.style.right).toBe("");
    expect(leftOf(panel)).toBe(100);
    expect(topOf(panel)).toBe(96);

    pop.dispose();
  });

  it("re-arms dismissal listeners under patched flags while open", () => {
    const anchor = document.createElement("button");
    stubRect(anchor, 10, 10, 50, 20);
    const panel = document.createElement("div");
    stubSize(panel, 100, 100);
    document.body.append(anchor, panel);

    const pop = createPopover(anchor, panel);
    pop.show();
    vi.advanceTimersByTime(0);

    pop.setOptions({ closeOnOutside: false });
    vi.advanceTimersByTime(0);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(pop.isOpen).toBe(true);

    pop.setOptions({ closeOnOutside: true });
    vi.advanceTimersByTime(0);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(pop.isOpen).toBe(false);

    pop.dispose();
  });

  it("a placement-only patch leaves the popup lifecycle options untouched", () => {
    const { c, panel } = mountPopover({ closeOnEscape: false });
    c.show();
    vi.advanceTimersByTime(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(c.isOpen).toBe(true); // closeOnEscape:false honored

    c.setOptions({ offset: 12 }); // placement-only: no popup keys present
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(c.isOpen).toBe(true); // still honored — the patch forwarded nothing
    expect(topOf(panel)).toBe(132); // and the new offset did apply: 120 + 12
    c.dispose();
  });

  it("a placement-only patch does not disarm the armed dismissal listeners", () => {
    const { c } = mountPopover();
    c.show();
    vi.advanceTimersByTime(1); // deferred install done: an outside click closes

    c.setOptions({ offset: 12 }); // forwards nothing to the popup layer
    // No re-arm happened, so the listeners are live in this very tick.
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(c.isOpen).toBe(false);
    c.dispose();
  });

  it("setOptions on a closed popover writes nothing to the panel", () => {
    const { c, panel } = mountPopover();
    c.setOptions({ stretch: "viewport" }); // never shown
    expect(panel.classList.contains("is-stretched")).toBe(false);
    expect(panel.style.left).toBe("");
    expect(panel.style.top).toBe("");
    c.dispose();
  });
});

describe("placeAnchored — clearing matchAnchorWidth", () => {
  it("a placement without the option clears the inline min-width a prior one wrote", () => {
    const anchor = document.createElement("button");
    const panel = document.createElement("div");
    document.body.append(anchor, panel);
    stubRect(anchor, 100, 100, 50, 20);
    stubSize(panel, 80, 40);

    placeAnchored(panel, anchor, { matchAnchorWidth: 220, flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("220px");

    // The setOptions({ matchAnchorWidth: undefined }) seam ends here: the
    // next placement runs with the option at its default (false) and must
    // clear the stale inline min-width, not leave it stuck on the panel.
    placeAnchored(panel, anchor, { flip: false, clamp: false });
    expect(panel.style.minWidth).toBe("");
  });
});

describe("createPopover — pointAnchor panel hosting under a modal", () => {
  it("hosts a disconnected point-anchored panel into the open modal (context menu in a modal)", () => {
    const modal = document.createElement("dialog");
    document.body.appendChild(modal);
    modal.showModal();

    // A virtual anchor has no trigger element, so the trigger-derived dialog
    // rule can't apply; the core's topmost-open-dialog fallback keeps the
    // context menu usable (a body-hosted panel would be inert behind the
    // modal).
    const panel = document.createElement("div");
    stubSize(panel, 100, 40);
    const pop = createPopover(pointAnchor(50, 60), panel);
    pop.show();
    expect(panel.parentElement).toBe(modal);

    pop.dispose();
    modal.close();
    modal.remove();
  });
});

describe("createPopover — the tracking frame is released on hide", () => {
  it("cancels the pending frame by its handle and clears the handle", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { c } = mountPopover();

    c.show();
    vi.advanceTimersByTime(1); // install the deferred tracking listeners
    document.dispatchEvent(new Event("scroll")); // schedules one frame
    expect(raf).toHaveBeenCalledOnce();
    const pending = raf.mock.results[0]!.value as number;
    // Guard the assertion below against a vacuous pass: if the handle were
    // undefined, `toHaveBeenCalledWith(pending)` would also match a cancel of
    // undefined, and the test would prove nothing.
    expect(pending).toBeTypeOf("number");

    c.hide();

    // The frame belongs to a popover that is closing: it is cancelled, not left
    // to run into a torn-down tracker.
    expect(cancel).toHaveBeenCalledWith(pending);

    // ...and the handle is cleared, so tracking re-arms. Without that, the
    // throttle still believes a frame is pending and coalesces every later
    // scroll into a frame that will never come.
    c.show();
    vi.advanceTimersByTime(1);
    document.dispatchEvent(new Event("scroll"));
    expect(raf).toHaveBeenCalledTimes(2);
    c.dispose();
  });

  it("gives the capture-phase scroll listener back with the capture flag it used", () => {
    const docRemove = vi.spyOn(document, "removeEventListener");
    const { c } = mountPopover();

    c.show();
    vi.advanceTimersByTime(1);
    c.hide();

    // Anchor tracking listens for scroll in the capture phase because a scroll
    // in an ancestor container does not bubble. removeEventListener matches on
    // that flag, so a mismatch leaves the tracker wired to a closed popover for
    // the life of the page. The engine here honours the flag, so a mismatch leaks.
    expect(docRemove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    c.dispose();
  });
});
