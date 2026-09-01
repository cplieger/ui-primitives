// popup-core.ts — INTERNAL lifecycle core shared by popup and popover (not a
// subpath export). `popup` re-exports it as-is; `popover` layers placement on
// top through the `PopupHooks` seam. One module keeps the group registry
// shared, so a popup and a popover can share a `group`.

import { topmostOpenDialog } from "./modal-host.js";
import { cancelTransition, runTransition } from "./transition.js";

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
  /** Merge-patch the options (see {@link PopupOptionsPatch}). Dismissal
   *  listeners re-arm if open; a `trigger`/`haspopup` change applies on the
   *  next `show()`. */
  setOptions(patch: PopupOptionsPatch): void;
  dispose(): void;
}

/** Extension seam for the popover layer: popover reuses this exact lifecycle
 *  and layers placement on top through these hooks. Internal by construction —
 *  this module is not a subpath export, so the seam is invisible to package
 *  consumers (the public `popup` wrapper does not accept hooks). */
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

/** Core implementation behind `createPopup` and `createPopover`. */
export function createPopupCore(
  panel: HTMLElement,
  opts?: PopupOptions,
  hooks?: PopupHooks,
): PopupController {
  // Reads go through `current` so a setOptions patch takes effect immediately.
  const current: PopupOptions = { ...opts };
  const stateClass = hooks?.stateClass ?? "uip-popup";

  let open = false;
  let listening = false;
  let installTimer: ReturnType<typeof setTimeout> | null = null;
  let restoreFocus: HTMLElement | null = null;
  // Whether show() moved focus into the panel — hide() forces focus back out
  // even without returnFocus, so it is never stranded on the hidden panel
  // (WCAG 2.4.3).
  let movedFocusIn = false;

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

  // Lets a re-show mid-fade re-reveal cleanly instead of the stale leave
  // firing later and hiding the panel again.
  const clearLeave = (): void => {
    cancelTransition(panel);
    panel.classList.remove("is-leaving");
  };

  const onDocClick = (e: MouseEvent): void => {
    const target = e.target;
    // A click on the trigger keeps the popup open — its own handler typically toggles.
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
      // Isolate by default so the same Escape doesn't also close a parent modal.
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

  // Deferred so the click that opened the popup doesn't immediately self-close.
  const armListenersDeferred = (): void => {
    if (installTimer !== null) {
      clearTimeout(installTimer);
    }
    installTimer = setTimeout(addListeners, 0);
  };

  const show = (): void => {
    clearLeave();
    if (open) {
      hooks?.onShowWhileOpen?.();
      return;
    }
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
      // showModal() inerts everything outside the dialog subtree, so a
      // disconnected panel must host inside the open dialog to stay usable.
      const host = current.trigger?.closest("dialog[open]") ?? topmostOpenDialog() ?? document.body;
      host.appendChild(panel);
    }
    // runTransition commits the resting state before adding is-open, so the
    // transition plays from it.
    runTransition(panel, {
      change: () => {
        panel.classList.add("is-open");
      },
    });
    hooks?.onReveal?.();
    current.trigger?.setAttribute("aria-expanded", "true");
    current.trigger?.setAttribute("aria-haspopup", String(current.haspopup ?? "true"));
    // Capture the restore target before moving initial focus, so it records
    // what was focused at open time rather than initialFocus itself.
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
      return;
    }
    open = false;
    removeListeners();
    current.trigger?.setAttribute("aria-expanded", "false");
    // Synchronous — focus must not wait for the fade. Blur as a fallback when
    // the moved-in focus has no restore target left.
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
    // A re-show cancels this settle (clearLeave), so it can't yank a
    // re-shown panel shut.
    runTransition(panel, {
      change: () => {
        panel.classList.remove("is-open");
        panel.classList.add("is-leaving");
      },
      settled: () => {
        panel.classList.remove("is-leaving");
        hooks?.onLeaveEnd?.();
        panel.hidden = true;
      },
    });
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
      Object.assign(current, patch);
      syncGroup();
      if (open) {
        // Deferred for the same reason as show(): must not install a listener
        // the same click trips.
        removeListeners();
        armListenersDeferred();
      }
    },
    dispose(): void {
      hide();
      removeListeners();
      // hide() only flips aria-expanded to "false"; the trigger no longer
      // owns a popup at all, so drop the ARIA it advertised entirely.
      current.trigger?.removeAttribute("aria-haspopup");
      current.trigger?.removeAttribute("aria-expanded");
      if (groupName !== undefined) {
        leaveGroup(groupName, entry);
        groupName = undefined;
      }
    },
  };
}
