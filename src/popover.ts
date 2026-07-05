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
 *  moving point, build a new pointAnchor and call reposition/placeAnchored again. */
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
  /** Focus this element after the popover opens, if it is a connected element.
   *  Omit (or pass `null`) to leave focus alone — by default the caller owns
   *  focus. Opt-in. */
  initialFocus?: HTMLElement | null;
  /** Restore focus when the popover closes. `true` captures whatever was
   *  focused at open time and refocuses it on close; an element refocuses that
   *  element; `false`/omitted leaves focus alone. Opt-in. */
  returnFocus?: boolean | HTMLElement;
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
  anchor: PopoverAnchor,
  panel: HTMLElement,
  opts?: PopoverOptions,
): PopoverController {
  const closeOnOutside = opts?.closeOnOutside ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;
  // Element-only operations (ARIA on the trigger, anchor-contains for the
  // outside-click guard) are gated on this: a virtual/point anchor has no
  // element to annotate or hit-test, so they no-op for it. Positioning via
  // placeAnchored works for both anchor kinds — it only reads
  // getBoundingClientRect(), which both HTMLElement and VirtualAnchor provide.
  const anchorEl = anchor instanceof HTMLElement ? anchor : null;

  let open = false;
  let listening = false;
  let installTimer: ReturnType<typeof setTimeout> | null = null;
  let trackingFrame: number | null = null;
  // Focus-restore target, captured at show() time when `returnFocus` is set.
  let restoreFocus: HTMLElement | null = null;

  // Public reposition: synchronous. Callers invoke it after a content change
  // and expect an immediate re-measure + re-clamp.
  const reposition = (): void => {
    if (open) {
      placeAnchored(panel, anchor, opts);
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

  const cancelTrackingFrame = (): void => {
    if (trackingFrame !== null) {
      cancelAnimationFrame(trackingFrame);
      trackingFrame = null;
    }
  };

  const onDocClick = (e: MouseEvent): void => {
    const target = e.target;
    // A click on the anchor keeps the popover open only when the anchor is a
    // real element. For a virtual/point anchor (anchorEl === null) there is no
    // anchor element, so only a click inside the panel keeps it open — a click
    // anywhere else (including where the right-click happened) closes it.
    if (target instanceof Node && (panel.contains(target) || anchorEl?.contains(target) === true)) {
      return;
    }
    hide();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      // Isolate Escape: a popover opened inside a modal consumes the key so the
      // same keystroke doesn't also close the modal underneath. Deeper Escape
      // coordination (nested document-level handlers) stays the caller's
      // concern.
      e.stopPropagation();
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
    // and the mobile keyboard. All route through the rAF throttle so a burst of
    // events coalesces into one reposition per frame.
    document.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.addEventListener("resize", scheduleReposition);
      vv.addEventListener("scroll", scheduleReposition);
    }
  };

  const removeListeners = (): void => {
    if (installTimer !== null) {
      clearTimeout(installTimer);
      installTimer = null;
    }
    // Drop any pending tracking frame regardless of listener state.
    cancelTrackingFrame();
    if (!listening) {
      return;
    }
    listening = false;
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("scroll", scheduleReposition, true);
    window.removeEventListener("resize", scheduleReposition);
    const vv = window.visualViewport;
    if (vv != null) {
      vv.removeEventListener("resize", scheduleReposition);
      vv.removeEventListener("scroll", scheduleReposition);
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
      // Host the panel in the nearest open <dialog> ancestor of the anchor when
      // there is one, so a popover opened from within a native-<dialog> modal
      // renders in that dialog's top layer (above it) rather than the base layer
      // (behind it). Mirrors the tooltip's dialog-hosting. A virtual/point
      // anchor (anchorEl === null), or an anchor outside any dialog, falls back
      // to <body>. A caller-connected panel is left where the caller put it.
      const host = anchorEl?.closest("dialog[open]") ?? document.body;
      host.appendChild(panel);
    }
    placeAnchored(panel, anchor, opts);
    // ARIA is set only on a real element; a virtual/point anchor has none.
    anchorEl?.setAttribute("aria-expanded", "true");
    anchorEl?.setAttribute("aria-haspopup", "true");
    // Focus management is opt-in — by default the caller owns focus. Capture the
    // restore target BEFORE moving initial focus, so `returnFocus: true` records
    // whatever was focused when we opened rather than the initialFocus element.
    const returnFocus = opts?.returnFocus;
    if (returnFocus === true) {
      const active = document.activeElement;
      restoreFocus = active instanceof HTMLElement ? active : null;
    } else if (returnFocus instanceof HTMLElement) {
      restoreFocus = returnFocus;
    }
    const initialFocus = opts?.initialFocus;
    if (initialFocus?.isConnected) {
      initialFocus.focus();
    }
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
    anchorEl?.setAttribute("aria-expanded", "false");
    // Restore focus only if a target was captured/supplied at show() time and it
    // is still in the document; otherwise leave focus alone.
    const target = restoreFocus;
    restoreFocus = null;
    if (target?.isConnected) {
      target.focus();
    }
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
      // The controller is gone: the anchor no longer owns a popover, so drop the
      // ARIA it advertised (hide() only flips aria-expanded to "false"). No-op
      // for a virtual/point anchor, which never had ARIA set.
      anchorEl?.removeAttribute("aria-haspopup");
      anchorEl?.removeAttribute("aria-expanded");
    },
  };
}
