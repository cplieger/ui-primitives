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

export type PopoverPlacement = "top" | "bottom" | "left" | "right";
export type PopoverAlign = "start" | "center" | "end";

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
   *  `max(anchorWidth, n)` (a number). Default `false`. */
  matchAnchorWidth?: boolean | number;
  /** Viewport edge margin used by flip + clamp, in px. Default `8`. */
  margin?: number;
}

export interface PopoverOptions extends PlacementOptions {
  /** Click outside the panel and anchor closes the popover. Default `true`. */
  closeOnOutside?: boolean;
  /** Escape closes the popover. Default `true`. */
  closeOnEscape?: boolean;
  /** Invoked after the popover opens. */
  onOpen?: () => void;
  /** Invoked after the popover closes. */
  onClose?: () => void;
}

export interface PopoverController {
  show(): void;
  hide(): void;
  toggle(): void;
  /** Recompute placement. Call after the panel's content changes size. */
  reposition(): void;
  readonly isOpen: boolean;
  /** The panel element (the caller's, never one this controller created). */
  readonly el: HTMLElement;
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
  anchor: HTMLElement,
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

  // Apply matchAnchorWidth first so the measured panel size reflects it.
  if (matchWidth !== false) {
    const min = matchWidth === true ? rect.width : Math.max(rect.width, matchWidth);
    panel.style.minWidth = `${min}px`;
  }

  const panelW = panel.offsetWidth;
  const panelH = panel.offsetHeight;
  const vp = viewportBox();

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

/**
 * Wire `anchor` and a caller-supplied `panel` into an anchored, dismissible
 * popover. The controller reveals + positions the panel, tracks the anchor on
 * scroll/resize, and dismisses on outside-click / Escape. It does not build the
 * panel and never removes it from the DOM — the caller owns that element.
 */
export function createPopover(
  anchor: HTMLElement,
  panel: HTMLElement,
  opts?: PopoverOptions,
): PopoverController {
  const closeOnOutside = opts?.closeOnOutside ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;

  let open = false;
  let listening = false;
  let installTimer: ReturnType<typeof setTimeout> | null = null;

  const reposition = (): void => {
    if (open) {
      placeAnchored(panel, anchor, opts);
    }
  };

  const onDocClick = (e: MouseEvent): void => {
    const target = e.target;
    if (target instanceof Node && (panel.contains(target) || anchor.contains(target))) {
      return;
    }
    hide();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      hide();
    }
  };

  const addListeners = (): void => {
    installTimer = null;
    if (!open) {
      return;
    }
    listening = true;
    if (closeOnOutside) {
      document.addEventListener("click", onDocClick);
    }
    if (closeOnEscape) {
      document.addEventListener("keydown", onKeyDown);
    }
    // Track the anchor: capture-phase scroll catches scrolling in any ancestor,
    // resize covers layout changes, and visualViewport events cover pinch-zoom
    // and the mobile keyboard.
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.addEventListener("resize", reposition);
      vv.addEventListener("scroll", reposition);
    }
  };

  const removeListeners = (): void => {
    if (installTimer !== null) {
      clearTimeout(installTimer);
      installTimer = null;
    }
    if (!listening) {
      return;
    }
    listening = false;
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.removeEventListener("resize", reposition);
      vv.removeEventListener("scroll", reposition);
    }
  };

  const show = (): void => {
    if (open) {
      // Idempotent: a show() while open just repositions.
      placeAnchored(panel, anchor, opts);
      return;
    }
    open = true;
    panel.classList.add("uip-popover");
    panel.hidden = false;
    panel.classList.add("is-open");
    if (!panel.isConnected) {
      document.body.appendChild(panel);
    }
    placeAnchored(panel, anchor, opts);
    anchor.setAttribute("aria-expanded", "true");
    anchor.setAttribute("aria-haspopup", "true");
    // Defer listener install one tick so the click that opened us doesn't
    // immediately trip the outside-click handler and self-close.
    installTimer = setTimeout(addListeners, 0);
    opts?.onOpen?.();
  };

  const hide = (): void => {
    if (!open) {
      return;
    }
    open = false;
    removeListeners();
    panel.hidden = true;
    panel.classList.remove("is-open");
    anchor.setAttribute("aria-expanded", "false");
    opts?.onClose?.();
  };

  return {
    show,
    hide,
    toggle(): void {
      if (open) {
        hide();
      } else {
        show();
      }
    },
    reposition,
    get isOpen(): boolean {
      return open;
    },
    get el(): HTMLElement {
      return panel;
    },
    dispose(): void {
      hide();
      // Defensive: drop any listeners / pending install even if already hidden.
      // The panel is the caller's — never removed from the DOM here.
      removeListeners();
    },
  };
}
