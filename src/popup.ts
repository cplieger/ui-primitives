// popup.ts — Reveal + light-dismiss lifecycle for a caller-supplied panel,
// WITHOUT placement. The behavior half of popover: it reveals/conceals the
// panel through the shared enter/leave state-class lifecycle, dismisses on
// outside-click and Escape (isolated by default, like popover), wires
// aria-expanded / aria-haspopup on an optional trigger, coordinates
// single-open groups, and manages opt-in focus — but it never positions the
// panel. Reach for it when the panel is in-flow or self-positioned (an
// expandable pill/card, an inline tray, a bottom-sheet); reach for popover
// when the panel floats anchored to something.
//
// Motion is entirely the app's: the library toggles `is-open` on reveal
// (after a forced reflow, so a CSS transition from the resting state plays)
// and `is-leaving` on conceal, then sets `[hidden]` once the panel's
// transition ends (or a fallback timeout fires). The base stylesheet ships
// only the `[hidden]` display rule for `.uip-popup` — no default enter/leave
// motion, no custom properties.

import { afterTransition, forceReflow } from "./transition.js";

/** Fallback timeout (ms) if `transitionend` never fires on the panel (no CSS
 *  transition, reduced motion, or an interrupted animation). Mirrors the
 *  dialog / modal / popover leave fallback. */
const LEAVE_FALLBACK_MS = 400;

export interface PopupOptions {
  /** Trigger element to wire ARIA on (`aria-expanded`, `aria-haspopup`) and to
   *  exempt from outside-click dismissal (so a trigger click-handler can
   *  toggle without the document listener closing first). The controller does
   *  NOT wire click/keyboard activation on it — the caller owns that. Omit or
   *  pass `null` for a trigger-less popup. */
  trigger?: HTMLElement | null;
  /** Click outside the panel and trigger closes the popup. Default `true`. */
  closeOnOutside?: boolean;
  /** Escape closes the popup. Default `true`. */
  closeOnEscape?: boolean;
  /** Stop the Escape keydown's propagation when this popup consumes it, so a
   *  popup inside a modal doesn't also close the modal. Default `true`.
   *  Disable when an app-level Escape coordinator must still observe the key. */
  isolateEscape?: boolean;
  /** Single-open coordination group: opening this popup closes any open peer
   *  created with the same group name. See also `closePopupGroup`. */
  group?: string;
  /** Focus this element after the popup opens, if it is a connected element.
   *  Omit (or pass `null`) to leave focus alone — by default the caller owns
   *  focus. Opt-in. */
  initialFocus?: HTMLElement | null;
  /** Restore focus when the popup closes. `true` captures whatever was focused
   *  at open time and refocuses it on close; an element refocuses that element;
   *  `false`/omitted leaves focus alone. Opt-in. */
  returnFocus?: boolean | HTMLElement;
  /** aria-haspopup value advertised on the trigger. Match the panel's role.
   *  Default `true` (menu). Ignored without a trigger. */
  haspopup?: "menu" | "listbox" | "tree" | "grid" | "dialog" | true;
  /** Invoked after the popup opens. */
  onOpen?: () => void;
  /** Invoked after the popup closes. */
  onClose?: () => void;
}

/** A merge-patch for `setOptions`: keys PRESENT in the patch override the
 *  current value — including an explicit `undefined`, which clears the option
 *  back to its default. Keys absent from the patch are left unchanged. */
export type PopupOptionsPatch = {
  [K in keyof PopupOptions]?: PopupOptions[K] | undefined;
};

export interface PopupController {
  show(): void;
  hide(): void;
  toggle(): void;
  readonly isOpen: boolean;
  /** The panel element (the caller's, never one this controller created). */
  readonly el: HTMLElement;
  /** Merge-patch the options. Keys present in the patch override (an explicit
   *  `undefined` clears back to the default); absent keys are unchanged.
   *  Dismissal listeners re-arm if the popup is open; a `trigger` or
   *  `haspopup` change applies on the next `show()`. */
  setOptions(patch: PopupOptionsPatch): void;
  dispose(): void;
}

/** @internal Extension seam for the popover layer (NOT public API): popover
 *  reuses this exact lifecycle and layers placement on top through these
 *  hooks. Subject to change without semver consideration. */
export interface PopupHooks {
  /** State-class base applied to the panel. Default `"uip-popup"`. */
  stateClass?: string;
  /** After the panel is revealed + mounted, before ARIA/focus/listeners. */
  onReveal?: () => void;
  /** A `show()` while already open (the reveal is skipped). */
  onShowWhileOpen?: () => void;
  /** Alongside dismissal-listener arm (`true`) / disarm (`false`). */
  onListeners?: (armed: boolean) => void;
  /** When a leave finishes and the panel is about to be `[hidden]`. */
  onLeaveEnd?: () => void;
}

interface GroupEntry {
  isOpen(): boolean;
  hide(): void;
}

const groups = new Map<string, Set<GroupEntry>>();

function joinGroup(name: string, entry: GroupEntry): void {
  let set = groups.get(name);
  if (set === undefined) {
    set = new Set();
    groups.set(name, set);
  }
  set.add(entry);
}

function leaveGroup(name: string, entry: GroupEntry): void {
  const set = groups.get(name);
  if (set === undefined) {
    return;
  }
  set.delete(entry);
  if (set.size === 0) {
    groups.delete(name);
  }
}

/** Close every open popup in `group` (e.g. collapse all expandable pills when
 *  the app moves focus elsewhere). Unknown group names are a no-op. */
export function closePopupGroup(group: string): void {
  const set = groups.get(group);
  if (set === undefined) {
    return;
  }
  for (const entry of [...set]) {
    if (entry.isOpen()) {
      entry.hide();
    }
  }
}

/**
 * Wire a caller-supplied `panel` into a revealable, light-dismissing popup.
 * The controller reveals/conceals the panel and dismisses on outside-click /
 * Escape, but never positions it and never removes it from the DOM — the
 * caller owns the element, its placement, and its motion.
 */
export function createPopup(
  panel: HTMLElement,
  opts?: PopupOptions,
  hooks?: PopupHooks,
): PopupController {
  // Mutable option state — setOptions() merge-patches this. Reads go through
  // `current` everywhere so a patch takes effect immediately (or, where wiring
  // is bound at arm/show time, on the next re-arm/show as documented).
  const current: PopupOptions = { ...opts };
  const stateClass = hooks?.stateClass ?? "uip-popup";

  let open = false;
  let listening = false;
  let installTimer: ReturnType<typeof setTimeout> | null = null;
  // Focus-restore target, captured at show() time when `returnFocus` is set OR
  // when the controller is about to move focus into the panel (initialFocus).
  let restoreFocus: HTMLElement | null = null;
  // Whether show() moved focus INTO the panel. On hide() this forces focus
  // back out even without returnFocus, so it is never stranded on the
  // now-hidden panel (WCAG 2.4.3 focus-loss).
  let movedFocusIn = false;
  // While a leave animation is in flight this holds afterTransition's cancel
  // handle (else null). A re-show cancels it.
  let cancelLeave: (() => void) | null = null;

  // --- Single-open group registration -----------------------------------
  const entry: GroupEntry = {
    isOpen: () => open,
    hide: () => {
      hide();
    },
  };
  let groupName: string | undefined;
  const syncGroup = (): void => {
    if (current.group === groupName) {
      return;
    }
    if (groupName !== undefined) {
      leaveGroup(groupName, entry);
    }
    groupName = current.group;
    if (groupName !== undefined) {
      joinGroup(groupName, entry);
    }
  };
  syncGroup();

  // Cancel a pending leave synchronously WITHOUT running its callback, then
  // drop the leaving state — used by show() so a re-show mid-fade re-reveals
  // cleanly rather than letting the stale leave fire and hide the panel again.
  const clearLeave = (): void => {
    if (cancelLeave !== null) {
      cancelLeave();
      cancelLeave = null;
    }
    panel.classList.remove("is-leaving");
  };

  const onDocClick = (e: MouseEvent): void => {
    const target = e.target;
    // A click inside the panel — or on the trigger, whose own click handler
    // typically toggles — keeps the popup open.
    if (
      target instanceof Node &&
      (panel.contains(target) || current.trigger?.contains(target) === true)
    ) {
      return;
    }
    hide();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      // Isolate Escape (default): a popup opened inside a modal consumes the
      // key so the same keystroke doesn't also close the modal underneath.
      if (current.isolateEscape ?? true) {
        e.stopPropagation();
      }
      hide();
    }
  };

  const addListeners = (): void => {
    installTimer = null;
    if (!open) {
      return;
    }
    listening = true;
    if (current.closeOnOutside ?? true) {
      document.addEventListener("click", onDocClick);
    }
    if (current.closeOnEscape ?? true) {
      document.addEventListener("keydown", onKeyDown);
    }
    hooks?.onListeners?.(true);
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
    hooks?.onListeners?.(false);
  };

  // Defer listener install one tick so the click that opened the popup doesn't
  // immediately trip the outside-click handler and self-close.
  const armListenersDeferred = (): void => {
    if (installTimer !== null) {
      clearTimeout(installTimer);
    }
    installTimer = setTimeout(addListeners, 0);
  };

  const show = (): void => {
    // A show() during the leave fade cancels it and re-reveals immediately, so
    // a rapid hide→show (or toggle) doesn't strand the panel half-faded.
    clearLeave();
    if (open) {
      hooks?.onShowWhileOpen?.();
      return;
    }
    // Single-open: close any open peer in the same group first.
    if (groupName !== undefined) {
      const set = groups.get(groupName);
      if (set !== undefined) {
        for (const peer of [...set]) {
          if (peer !== entry && peer.isOpen()) {
            peer.hide();
          }
        }
      }
    }
    open = true;
    panel.classList.add(stateClass);
    panel.hidden = false;
    if (!panel.isConnected) {
      // Host a disconnected panel in the nearest open <dialog> ancestor of the
      // trigger when there is one, so a popup opened from within a native
      // <dialog> modal renders in that dialog's top layer rather than behind
      // it. Falls back to <body>. A caller-connected panel stays where the
      // caller put it.
      const host = current.trigger?.closest("dialog[open]") ?? document.body;
      host.appendChild(panel);
    }
    // Flush the un-hide before adding is-open so a CSS *transition* from the
    // resting state plays (an animation on is-open plays either way).
    forceReflow(panel);
    panel.classList.add("is-open");
    hooks?.onReveal?.();
    current.trigger?.setAttribute("aria-expanded", "true");
    current.trigger?.setAttribute("aria-haspopup", String(current.haspopup ?? "true"));
    // Focus management is opt-in — with neither initialFocus nor returnFocus
    // the controller leaves focus untouched at both ends. Capture the restore
    // target BEFORE moving initial focus, so it records whatever was focused
    // when we opened rather than the initialFocus element.
    const returnFocus = current.returnFocus;
    const initialFocus = current.initialFocus;
    const willMoveFocusIn = initialFocus?.isConnected === true;
    if (returnFocus instanceof HTMLElement) {
      restoreFocus = returnFocus;
    } else if (returnFocus === true || willMoveFocusIn) {
      const active = document.activeElement;
      restoreFocus = active instanceof HTMLElement ? active : null;
    }
    if (initialFocus?.isConnected === true) {
      initialFocus.focus();
      movedFocusIn = true;
    }
    armListenersDeferred();
    current.onOpen?.();
  };

  const hide = (): void => {
    if (!open) {
      // Idempotent: already closed, or a leave animation is already running
      // (open flips to false the instant hide() begins).
      return;
    }
    open = false;
    removeListeners();
    current.trigger?.setAttribute("aria-expanded", "false");
    // Restore focus to the target captured/supplied at show() time if it is
    // still connected. If the controller moved focus INTO the panel but that
    // target is gone, blur the panel so focus is not stranded on the
    // now-hidden node. Done synchronously — focus must not wait for the fade.
    const target = restoreFocus;
    const didMoveFocusIn = movedFocusIn;
    restoreFocus = null;
    movedFocusIn = false;
    if (target?.isConnected) {
      target.focus();
    } else if (didMoveFocusIn) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active)) {
        active.blur();
      }
    }
    // Leave lifecycle: swap is-open → is-leaving and keep the panel in the DOM
    // until its transition ends — or the fallback fires when there is no
    // transition / reduced motion / an interruption — then set [hidden] and
    // drop the state classes. Mirrors dialog/modal/toast/popover.
    panel.classList.remove("is-open");
    panel.classList.add("is-leaving");
    cancelLeave = afterTransition(
      panel,
      () => {
        cancelLeave = null;
        // A re-show during the fade clears is-leaving; only finalize if we're
        // still leaving, so we never yank a freshly re-shown panel shut.
        if (panel.classList.contains("is-leaving")) {
          panel.classList.remove("is-leaving");
          hooks?.onLeaveEnd?.();
          panel.hidden = true;
        }
      },
      LEAVE_FALLBACK_MS,
    );
    current.onClose?.();
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
    get isOpen(): boolean {
      return open;
    },
    get el(): HTMLElement {
      return panel;
    },
    setOptions(patch: PopupOptionsPatch): void {
      // Merge-patch: Object.assign copies exactly the keys PRESENT in the
      // patch (including explicit `undefined`, which clears back to default)
      // and leaves absent keys untouched.
      Object.assign(current, patch);
      syncGroup();
      if (open) {
        // Re-arm dismissal listeners under the new flags. Deferred a tick for
        // the same reason as show(): a setOptions inside the opening click's
        // handler must not install a document listener that same click trips.
        removeListeners();
        armListenersDeferred();
      }
    },
    dispose(): void {
      hide();
      // Defensive: drop listeners / pending install even if already hidden.
      // The panel is the caller's — never removed from the DOM here.
      removeListeners();
      // The controller is gone: the trigger no longer owns a popup, so drop
      // the ARIA it advertised (hide() only flips aria-expanded to "false").
      current.trigger?.removeAttribute("aria-haspopup");
      current.trigger?.removeAttribute("aria-expanded");
      if (groupName !== undefined) {
        leaveGroup(groupName, entry);
        groupName = undefined;
      }
    },
  };
}
