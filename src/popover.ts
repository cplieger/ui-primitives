// popover.ts — An anchored floating panel and the placement engine under it.
// Two exports, deliberately split:
//
//   - placeAnchored(panel, anchor, opts) — the pure positioner. Given a panel
//     (position:fixed) and an anchor, it reads the anchor's rect + the panel's
//     measured size and writes panel.style.left/top so the panel sits on the
//     requested side (placement) and edge (align), gapped by `offset`, flipped
//     to the opposite side when it would overflow, and clamped into the
//     viewport on the cross axis. Idempotent — safe to call on every
//     scroll/resize or after the panel's content changes size. Uses
//     window.visualViewport for the viewport box when present so it stays
//     correct above the mobile on-screen keyboard.
//
//   - createPopover(anchor, panel, opts) — the interactive controller for
//     dropdowns, filter panels, and pickers (the interactive superset of
//     tooltip, and the substrate a menu/listbox sits on). It reveals the
//     caller-supplied panel, positions it with placeAnchored, wires
//     outside-click / Escape dismissal and scroll/resize/visualViewport
//     reposition tracking, and manages aria-expanded/aria-haspopup on the
//     anchor. It never builds or owns the panel: dispose hides + unlistens but
//     leaves the caller's element in the DOM.
//
// JS positioning (getBoundingClientRect + fixed) rather than the native Popover
// API / CSS anchor positioning, for testability and consistency with tooltip.

// createPopover is layered on the shared popup lifecycle core (popup-core.ts,
// internal): the core owns the reveal / light-dismiss lifecycle (state
// classes, outside-click, Escape isolation, trigger ARIA, groups, opt-in
// focus) and popover adds anchored placement, scroll/resize/visualViewport
// tracking, and the full-bleed stretch mode through the core's hooks seam.

import { createPopupCore } from "./popup-core.js";
import type { PopupOptions, PopupOptionsPatch } from "./popup-core.js";

export type PopoverPlacement = "top" | "bottom" | "left" | "right";
export type PopoverAlign = "start" | "center" | "end";

/** A virtual anchor: anything that can report a bounding rect. Lets a popover
 *  be positioned against a coordinate/right-click point (see pointAnchor) or
 *  any non-DOM rect source, not just an element. */
export interface VirtualAnchor {
  getBoundingClientRect(): DOMRect;
}

/** What a popover can be anchored to: a real element, or a virtual rect source
 *  (e.g. a coordinate via pointAnchor). */
export type PopoverAnchor = HTMLElement | VirtualAnchor;

/** Build a virtual anchor at a viewport coordinate — for positioning a popover
 *  at a right-click / pointer point. The rect is zero-size at (x, y), so the
 *  popover opens from that point (bottom/start places it just below-right of the
 *  cursor). Read fresh each placement, so pass a function-free fixed point; for a
 *  moving point, build a new pointAnchor and call reposition/placeAnchored again.
 *
 *  Inside a modal `<dialog>`: a virtual anchor has no trigger element to derive
 *  the dialog from, so a DISCONNECTED point-anchored panel is hosted into the
 *  topmost open dialog (falling back to `document.body` when none is open) —
 *  a right-click context menu inside a modal stays interactive. A
 *  caller-connected panel stays where the caller put it, as always. */
export function pointAnchor(x: number, y: number): VirtualAnchor {
  return {
    getBoundingClientRect: (): DOMRect => ({
      x,
      y,
      left: x,
      top: y,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    }),
  };
}

export interface PlacementOptions {
  /** Side of the anchor the panel sits on. Default `"bottom"`. */
  placement?: PopoverPlacement;
  /** Cross-axis edge alignment. Default `"start"`. */
  align?: PopoverAlign;
  /** Main-axis gap between anchor and panel, in px. Default `4`. */
  offset?: number;
  /** Flip to the opposite side when the chosen side doesn't fit. Default `true`. */
  flip?: boolean;
  /** Clamp the cross-axis coordinate into the viewport. Default `true`. */
  clamp?: boolean;
  /** Set the panel's `min-width` to the anchor width (`true`) or to
   *  `max(anchorWidth, n)` (a number). Default `false`. Ignored when
   *  `stretch: "viewport"` is set (the panel spans the full width instead). */
  matchAnchorWidth?: boolean | number;
  /** Viewport edge margin used by flip + clamp — and, in `stretch: "viewport"`
   *  mode, the inline inset from each viewport edge — in px. Default `8`. */
  margin?: number;
  /** Full-bleed / edge-pinned mode. `"viewport"` makes the panel span the
   *  viewport's inline axis (pinned to both inline edges, respecting `margin`)
   *  instead of being sized to its content and cross-aligned to the anchor —
   *  the mobile full-width dropdown / action-sheet pattern. The main axis stays
   *  anchored to the trigger (below for `placement: "bottom"`, above for
   *  `"top"`) and still flips when there is no room. Only meaningful for a
   *  top/bottom `placement`; ignored for left/right. The inset is written as an
   *  inline style, so a consumer never needs `!important` to express it in their
   *  own CSS. `align`, cross-axis `clamp`, and `matchAnchorWidth` do not apply in
   *  this mode. Default unset (content-sized). */
  stretch?: "viewport";
}

/** Placement options plus the popup lifecycle options (dismissal, Escape
 *  isolation, single-open `group`, opt-in focus, open/close callbacks,
 *  `haspopup` — advertised on an element anchor; ignored for a virtual/point
 *  anchor, which has no element to annotate). The popup `trigger` is not an
 *  option here: the anchor is the trigger when it is a real element. */
export interface PopoverOptions extends PlacementOptions, Omit<PopupOptions, "trigger"> {}

/** A merge-patch for `setOptions`: keys PRESENT in the patch override the
 *  current value — including an explicit `undefined`, which clears the option
 *  back to its default (e.g. `{ stretch: undefined }` leaves full-bleed mode).
 *  Keys absent from the patch are left unchanged. */
export type PopoverOptionsPatch = {
  [K in keyof PopoverOptions]?: PopoverOptions[K] | undefined;
};

export interface PopoverController {
  show(): void;
  hide(): void;
  toggle(): void;
  /** Recompute placement. Call after the panel's content changes size. */
  reposition(): void;
  readonly isOpen: boolean;
  /** The panel element (the caller's, never one this controller created). */
  readonly el: HTMLElement;
  /** Merge-patch the options on the LIVE controller — the seam for responsive
   *  placement (e.g. flip `stretch` / `offset` / `margin` on a breakpoint
   *  change instead of disposing and rebuilding). Keys present in the patch
   *  override (an explicit `undefined` clears back to the default); absent
   *  keys are unchanged. An open popover repositions immediately and updates
   *  its `is-stretched` marker; dismissal listeners re-arm under the new
   *  flags. The anchor is constructor-bound and cannot be patched. */
  setOptions(patch: PopoverOptionsPatch): void;
  dispose(): void;
}

interface ViewportBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The visible viewport box. Uses `window.visualViewport` when present (so the
 *  box tracks pinch-zoom and stays above the mobile on-screen keyboard), else
 *  the layout viewport with zero offsets. */
function viewportBox(): ViewportBox {
  const vv = window.visualViewport;
  if (vv != null) {
    return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** Cross-axis coordinate for `align` along an axis whose anchor extent is
 *  `[start, start + size]` and whose panel extent is `panelSize`. */
function alignCoord(align: PopoverAlign, start: number, size: number, panelSize: number): number {
  if (align === "center") {
    return start + size / 2 - panelSize / 2;
  }
  if (align === "end") {
    return start + size - panelSize;
  }
  return start;
}

/** Resolve the effective placement, flipping to the opposite side when the
 *  chosen side overflows its viewport edge (beyond `margin`) and the opposite
 *  side has more room. */
function resolvePlacement(
  placement: PopoverPlacement,
  rect: DOMRect,
  panelW: number,
  panelH: number,
  offset: number,
  margin: number,
  vp: ViewportBox,
): PopoverPlacement {
  const vpRight = vp.left + vp.width;
  const vpBottom = vp.top + vp.height;
  const spaceAbove = rect.top - vp.top;
  const spaceBelow = vpBottom - rect.bottom;
  const spaceLeft = rect.left - vp.left;
  const spaceRight = vpRight - rect.right;

  if (placement === "bottom") {
    const overflows = rect.bottom + offset + panelH > vpBottom - margin;
    return overflows && spaceAbove > spaceBelow ? "top" : "bottom";
  }
  if (placement === "top") {
    const overflows = rect.top - offset - panelH < vp.top + margin;
    return overflows && spaceBelow > spaceAbove ? "bottom" : "top";
  }
  if (placement === "right") {
    const overflows = rect.right + offset + panelW > vpRight - margin;
    return overflows && spaceLeft > spaceRight ? "left" : "right";
  }
  const overflows = rect.left - offset - panelW < vp.left + margin;
  return overflows && spaceRight > spaceLeft ? "right" : "left";
}

/** Main + cross axis coordinates for a resolved placement. */
function computeCoords(
  placement: PopoverPlacement,
  align: PopoverAlign,
  rect: DOMRect,
  panelW: number,
  panelH: number,
  offset: number,
): { left: number; top: number } {
  if (placement === "top" || placement === "bottom") {
    const top = placement === "bottom" ? rect.bottom + offset : rect.top - panelH - offset;
    return { left: alignCoord(align, rect.left, rect.width, panelW), top };
  }
  const left = placement === "right" ? rect.right + offset : rect.left - panelW - offset;
  return { left, top: alignCoord(align, rect.top, rect.height, panelH) };
}

/** Clamp a coordinate so the panel stays within `[margin, size - margin]` of the
 *  viewport box on that axis. Pins to the leading margin when the panel is
 *  larger than the available space. */
function clampCoord(
  coord: number,
  panelSize: number,
  vpStart: number,
  vpSize: number,
  margin: number,
): number {
  const lo = vpStart + margin;
  const hi = vpStart + vpSize - panelSize - margin;
  if (hi < lo) {
    return lo;
  }
  return Math.max(lo, Math.min(coord, hi));
}

/**
 * Position `panel` (set to `position: fixed`) relative to `anchor` per `opts`.
 * Idempotent; safe to call repeatedly on scroll/resize or after the panel's
 * content changes size.
 */
export function placeAnchored(
  panel: HTMLElement,
  anchor: PopoverAnchor,
  opts?: PlacementOptions,
): void {
  const placement = opts?.placement ?? "bottom";
  const align = opts?.align ?? "start";
  const offset = opts?.offset ?? 4;
  const flip = opts?.flip ?? true;
  const clamp = opts?.clamp ?? true;
  const margin = opts?.margin ?? 8;
  const matchWidth = opts?.matchAnchorWidth ?? false;

  const rect = anchor.getBoundingClientRect();
  panel.style.position = "fixed";
  const vp = viewportBox();

  // Full-bleed / edge-pinned mode: the panel spans the viewport's inline axis
  // (pinned to both inline edges with `margin`) instead of being sized to its
  // content. Only for a top/bottom placement — a left/right panel can't also
  // span the full width. The main axis stays anchored to the trigger and still
  // flips when there is no room below/above, which is the mobile full-width
  // dropdown / action-sheet pattern. Everything is written as inline style so a
  // consumer never needs `!important` to express it.
  if (opts?.stretch === "viewport" && (placement === "top" || placement === "bottom")) {
    // Pin both inline edges. In fixed positioning `right` is measured from the
    // viewport's inline-end edge, so left + right together span the width minus
    // `margin` on each side — robust to the panel's box-sizing and padding (no
    // explicit width to fight the app's skin). Clear any min-width a prior
    // content-sized placement set so it can't widen the pinned panel.
    panel.style.left = `${margin}px`;
    panel.style.right = `${margin}px`;
    panel.style.minWidth = "";
    // Main axis: anchor-relative, flipping to the other side when it overflows
    // (panelW is unused by the top/bottom flip test, so 0 is fine).
    const panelH = panel.offsetHeight;
    const effective = flip
      ? resolvePlacement(placement, rect, 0, panelH, offset, margin, vp)
      : placement;
    const top = effective === "bottom" ? rect.bottom + offset : rect.top - panelH - offset;
    panel.style.top = `${top}px`;
    return;
  }

  // Content-sized placement. Clear an inline-end pin a prior stretch placement
  // may have written so the panel's own width is honored again.
  panel.style.right = "";

  // Apply matchAnchorWidth first so the measured panel size reflects it — and
  // CLEAR the inline min-width when the option is off, so disabling it via
  // setOptions({ matchAnchorWidth: undefined }) doesn't leave the previous
  // placement's min-width stuck on the panel.
  if (matchWidth !== false) {
    const min = matchWidth === true ? rect.width : Math.max(rect.width, matchWidth);
    panel.style.minWidth = `${min}px`;
  } else {
    panel.style.minWidth = "";
  }

  const panelW = panel.offsetWidth;
  const panelH = panel.offsetHeight;

  const effective = flip
    ? resolvePlacement(placement, rect, panelW, panelH, offset, margin, vp)
    : placement;
  const { left, top } = computeCoords(effective, align, rect, panelW, panelH, offset);

  let finalLeft = left;
  let finalTop = top;
  if (clamp) {
    if (effective === "top" || effective === "bottom") {
      finalLeft = clampCoord(left, panelW, vp.left, vp.width, margin);
    } else {
      finalTop = clampCoord(top, panelH, vp.top, vp.height, margin);
    }
  }

  panel.style.left = `${finalLeft}px`;
  panel.style.top = `${finalTop}px`;
}

/** The popup-lifecycle options forwarded from a PopoverOptions object / patch
 *  to the underlying popup controller. Placement keys stay local. A `Record`
 *  over `keyof` so the compiler enforces exhaustiveness BOTH ways: adding an
 *  option to PopupOptions (other than `trigger`, which popover owns) without
 *  listing it here — or listing a key popup no longer has — is a type error,
 *  so a new popup option can never silently fail to forward. */
const FORWARDED_POPUP_OPTIONS: Record<keyof Omit<PopupOptions, "trigger">, true> = {
  closeOnOutside: true,
  closeOnEscape: true,
  isolateEscape: true,
  group: true,
  initialFocus: true,
  returnFocus: true,
  haspopup: true,
  onOpen: true,
  onClose: true,
};

const POPUP_OPTION_KEYS = Object.keys(FORWARDED_POPUP_OPTIONS) as readonly (keyof Omit<
  PopupOptions,
  "trigger"
>)[];

/** Pick the popup-relevant keys PRESENT in `patch` (preserving merge-patch
 *  semantics: an absent key is not forwarded, an explicit undefined is). */
function popupSubset(patch: PopoverOptionsPatch): PopupOptionsPatch {
  const out: Record<string, unknown> = {};
  const source: Record<string, unknown> = patch;
  for (const key of POPUP_OPTION_KEYS) {
    if (key in source) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Wire `anchor` and a caller-supplied `panel` into an anchored, dismissible
 * popover. The controller reveals + positions the panel, tracks the anchor on
 * scroll/resize, and dismisses on outside-click / Escape. It does not build the
 * panel and never removes it from the DOM — the caller owns that element.
 *
 * Built on the popup primitive: popup owns the reveal / light-dismiss
 * lifecycle; this layer adds placeAnchored placement on reveal, rAF-throttled
 * anchor tracking (scroll / resize / visualViewport), and the `is-stretched`
 * full-bleed marker.
 */
export function createPopover(
  anchor: PopoverAnchor,
  panel: HTMLElement,
  opts?: PopoverOptions,
): PopoverController {
  // Element-only operations (ARIA on the trigger, anchor-contains for the
  // outside-click guard) are the popup layer's, gated on a real element:
  // a virtual/point anchor has no element to annotate or hit-test.
  // Positioning via placeAnchored works for both anchor kinds.
  const anchorEl = anchor instanceof HTMLElement ? anchor : null;

  // Mutable option state — setOptions() merge-patches this. placeAnchored
  // reads it fresh on every call, so a patch takes effect on the next
  // (immediate, for an open popover) reposition.
  const current: PopoverOptions = { ...opts };

  let trackingFrame: number | null = null;

  // Whether the CURRENT options put the panel in full-bleed mode. Drives the
  // `is-stretched` skin hook; positioning itself is inline via placeAnchored.
  const isStretched = (): boolean => {
    const placement = current.placement ?? "bottom";
    return current.stretch === "viewport" && (placement === "top" || placement === "bottom");
  };

  const place = (): void => {
    placeAnchored(panel, anchor, current);
  };

  // Public reposition: synchronous. Callers invoke it after a content change
  // and expect an immediate re-measure + re-clamp.
  const reposition = (): void => {
    if (popup.isOpen) {
      place();
    }
  };

  // Internal tracking reposition: rAF-throttled. Scroll/resize/visualViewport
  // bursts coalesce into one placeAnchored per frame — if a frame is already
  // pending, don't schedule another.
  const scheduleReposition = (): void => {
    if (trackingFrame !== null) {
      return;
    }
    trackingFrame = requestAnimationFrame(() => {
      trackingFrame = null;
      reposition();
    });
  };

  // Track the anchor: capture-phase scroll catches scrolling in any ancestor,
  // resize covers layout changes, and visualViewport events cover pinch-zoom
  // and the mobile keyboard. Armed/disarmed alongside the popup's dismissal
  // listeners (so the tracking also waits out the opening click's tick).
  const addTracking = (): void => {
    document.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.addEventListener("resize", scheduleReposition);
      vv.addEventListener("scroll", scheduleReposition);
    }
  };

  const removeTracking = (): void => {
    if (trackingFrame !== null) {
      cancelAnimationFrame(trackingFrame);
      trackingFrame = null;
    }
    document.removeEventListener("scroll", scheduleReposition, true);
    window.removeEventListener("resize", scheduleReposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.removeEventListener("resize", scheduleReposition);
      vv.removeEventListener("scroll", scheduleReposition);
    }
  };

  // The cast is sound: `current` is a spread of an exact-optional options
  // object, so the subset never carries an explicitly-undefined value here
  // (only setOptions patches can, and those go to popup.setOptions instead).
  const popup = createPopupCore(
    panel,
    { ...popupSubset(current), trigger: anchorEl } as PopupOptions,
    {
      stateClass: "uip-popover",
      onReveal: (): void => {
        if (isStretched()) {
          // Skin hook for the full-bleed variant (positioning is inline via
          // placeAnchored; this only lets the app square edges / drop borders).
          panel.classList.add("is-stretched");
        }
        place();
      },
      // A show() while open just repositions (idempotent).
      onShowWhileOpen: place,
      onListeners: (armed: boolean): void => {
        if (armed) {
          addTracking();
        } else {
          removeTracking();
        }
      },
      onLeaveEnd: (): void => {
        panel.classList.remove("is-stretched");
      },
    },
  );

  return {
    show(): void {
      popup.show();
    },
    hide(): void {
      popup.hide();
    },
    toggle(): void {
      popup.toggle();
    },
    reposition,
    get isOpen(): boolean {
      return popup.isOpen;
    },
    get el(): HTMLElement {
      return panel;
    },
    setOptions(patch: PopoverOptionsPatch): void {
      Object.assign(current, patch);
      const sub = popupSubset(patch);
      if (Object.keys(sub).length > 0) {
        popup.setOptions(sub);
      }
      if (popup.isOpen) {
        // Apply the new placement immediately: recompute the stretch marker
        // and re-place. placeAnchored clears the inline styles the other mode
        // wrote (stretch pins left+right; content-sized restores width).
        panel.classList.toggle("is-stretched", isStretched());
        place();
      }
    },
    dispose(): void {
      popup.dispose();
    },
  };
}
