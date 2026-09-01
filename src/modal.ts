// modal.ts — Native-<dialog> modal built from caller content. `dialog` wraps
// an EXISTING <dialog>; `modal` builds one from arbitrary content. Adds ARIA
// wiring, drag-safe backdrop dismissal, the shared fade-out lifecycle, and an
// iOS-safe scroll-lock — iOS Safari ignores `overflow:hidden` on the root for
// touch-scroll, so the body is pinned via position:fixed at the negated
// scroll offset instead.

import { el } from "@cplieger/reactive";

import { closeDialog, openDialog, wireBackdropDismiss } from "./dialog.js";
import { cancelTransition } from "./transition.js";

export interface ModalOptions {
  /** Close when the backdrop is clicked (drag-safe). Default `true`. */
  closeOnBackdrop?: boolean;
  /** Close on Escape. Default `true`. */
  closeOnEscape?: boolean;
  /** ARIA role for the dialog. Default `"dialog"` (the <dialog> implicit role);
   *  `"alertdialog"` sets the role + the `.uip-modal--alert` modifier. */
  role?: "dialog" | "alertdialog";
  /** `id` for `aria-labelledby`. When omitted, a descendant whose `id` ends in
   *  `-title` is auto-detected. */
  labelledBy?: string;
  /** `id` for `aria-describedby`. When omitted, a descendant whose `id` ends in
   *  `-desc` / `-description` is auto-detected. */
  describedBy?: string;
  /** Element to focus on open. Omit to leave focus to the platform (the first
   *  focusable / an `autofocus` element inside the dialog). */
  initialFocus?: HTMLElement | null;
  /** Dismiss guard, consulted on every USER dismissal attempt (backdrop click,
   *  Escape): return `false` to refuse it and keep the modal open. The wiring
   *  stays armed, so later attempts re-consult the guard. Programmatic
   *  `close()` is unaffected. Omitted = always dismissible. */
  canDismiss?: () => boolean;
  /** Lock background page scroll while open, ref-counted across nested modals.
   *  iOS-safe (position:fixed body + scroll restore). Default `true`. */
  scrollLock?: boolean;
  /** Invoked after this modal has finished closing. */
  onClose?: () => void;
}

export interface ModalController {
  open(): void;
  close(): void;
  readonly el: HTMLDialogElement;
  readonly isOpen: boolean;
  dispose(): void;
}

// Ref-counted: nested modals lock once, release only when the last closes.
interface SavedBodyStyle {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
}
let scrollLockCount = 0;
let savedScrollY = 0;
let savedBody: SavedBodyStyle | null = null;

function applyScrollLock(): void {
  scrollLockCount++;
  if (scrollLockCount !== 1) {
    return;
  }
  savedScrollY = window.scrollY;
  const s = document.body.style;
  savedBody = {
    position: s.position,
    top: s.top,
    left: s.left,
    right: s.right,
    width: s.width,
    overflow: s.overflow,
  };
  s.position = "fixed";
  s.top = `-${savedScrollY}px`;
  s.left = "0";
  s.right = "0";
  s.width = "100%";
  s.overflow = "hidden";
}

function restoreBody(): void {
  if (savedBody === null) {
    return;
  }
  const s = document.body.style;
  s.position = savedBody.position;
  s.top = savedBody.top;
  s.left = savedBody.left;
  s.right = savedBody.right;
  s.width = savedBody.width;
  s.overflow = savedBody.overflow;
  savedBody = null;
}

function releaseScrollLock(): void {
  if (scrollLockCount === 0) {
    return;
  }
  scrollLockCount--;
  if (scrollLockCount !== 0) {
    return;
  }
  restoreBody();
  window.scrollTo(0, savedScrollY);
}

/** Auto-detect an accessible-name target: a descendant whose id ends `-title`. */
function autoLabelId(content: HTMLElement): string | null {
  const titled = content.querySelector<HTMLElement>("[id$='-title']");
  return titled !== null && titled.id !== "" ? titled.id : null;
}

/** Auto-detect a description target: a descendant whose id ends `-desc` or
 *  `-description`. */
function autoDescribeId(content: HTMLElement): string | null {
  const described = content.querySelector<HTMLElement>("[id$='-desc'], [id$='-description']");
  return described !== null && described.id !== "" ? described.id : null;
}

/** Build a modal from `content`: wrap it in a native `<dialog class="uip-modal">`
 *  appended to `<body>`, and return a controller. The platform provides focus
 *  containment, the top layer, background inerting, Escape, nested stacking, and
 *  focus-return-to-opener; this adds ARIA wiring, drag-safe backdrop dismissal,
 *  the fade-out lifecycle, and an iOS-safe scroll-lock. */
export function createModal(content: HTMLElement, opts?: ModalOptions): ModalController {
  const closeOnBackdrop = opts?.closeOnBackdrop ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;
  const role = opts?.role ?? "dialog";
  const scrollLock = opts?.scrollLock ?? true;
  const onClose = opts?.onClose;

  content.classList.add("uip-modal-dialog");
  const dialog = el("dialog", { className: "uip-modal" }, content) as HTMLDialogElement;
  if (role === "alertdialog") {
    dialog.setAttribute("role", "alertdialog");
    dialog.classList.add("uip-modal--alert");
  }
  const labelledBy = opts?.labelledBy ?? autoLabelId(content);
  if (labelledBy !== null) {
    dialog.setAttribute("aria-labelledby", labelledBy);
  }
  const describedBy = opts?.describedBy ?? autoDescribeId(content);
  if (describedBy !== null) {
    dialog.setAttribute("aria-describedby", describedBy);
  }
  document.body.appendChild(dialog);

  let locked = false;
  const releaseLock = (): void => {
    if (locked) {
      releaseScrollLock();
      locked = false;
    }
  };

  const doClose = (): void => {
    if (!dialog.open) {
      return;
    }
    closeDialog(dialog, () => {
      releaseLock();
      onClose?.();
    });
  };

  // User dismissals (backdrop, Escape) route through the guard; programmatic
  // close() calls doClose directly and always closes.
  const dismiss = (): void => {
    if (opts?.canDismiss?.() === false) {
      return;
    }
    doClose();
  };

  const cleanupBackdrop = closeOnBackdrop ? wireBackdropDismiss(dialog, dismiss) : null;
  const onCancel = (e: Event): void => {
    // The platform fires `cancel` on Escape then closes instantly. Intercept it
    // so the fade-out lifecycle runs (or so Escape is ignored entirely, or
    // refused by the guard).
    e.preventDefault();
    if (closeOnEscape) {
      dismiss();
    }
  };
  dialog.addEventListener("cancel", onCancel);

  return {
    el: dialog,
    get isOpen(): boolean {
      return dialog.open && !dialog.classList.contains("is-leaving");
    },
    open(): void {
      if (dialog.open) {
        // Reopened mid fade-out: cancel the pending close and drop the leaving
        // state. The scroll-lock was never released, so there is nothing to
        // re-acquire.
        cancelTransition(dialog);
        dialog.classList.remove("is-leaving");
        return;
      }
      if (scrollLock) {
        applyScrollLock();
        locked = true;
      }
      openDialog(dialog);
      const initial = opts?.initialFocus;
      if (initial?.isConnected) {
        initial.focus();
      }
    },
    close: doClose,
    dispose(): void {
      cleanupBackdrop?.();
      dialog.removeEventListener("cancel", onCancel);
      // Cancel any in-flight leave so its pending settle never runs, release
      // the lock, close the native dialog (so `open` clears), then remove it.
      cancelTransition(dialog);
      dialog.classList.remove("is-leaving");
      releaseLock();
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          // close() absent or not implemented — degrade to the attribute.
          dialog.open = false;
        }
      }
      content.classList.remove("uip-modal-dialog");
      dialog.remove();
    },
  };
}

/** Test-only: restore any active scroll-lock and reset shared state. */
export function _resetForTest(): void {
  if (scrollLockCount > 0) {
    restoreBody();
  }
  scrollLockCount = 0;
  savedScrollY = 0;
  savedBody = null;
}
