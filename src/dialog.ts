/**
 * dialog.ts — Thin behavior layer over the native `<dialog>` element. The
 * platform gives us focus containment, the top layer, and Escape-to-close for
 * free; this module adds backdrop-click dismissal (drag-safe) and a fade-out
 * lifecycle via a namespaced `is-leaving` class before the element is closed.
 *
 * @module
 */

import { endOpen, trackOpen } from "./modal-host.js";
import { cancelTransition, runTransition } from "./transition.js";

/** Which user gestures dismiss a wrapped `<dialog>`, an optional veto over
 *  them, and a hook that runs once the fade-out has finished. All optional; by
 *  default both backdrop and Escape dismiss it. */
export interface DialogOptions {
  /** Close when the backdrop is clicked. Default `true`. */
  closeOnBackdrop?: boolean;
  /** Close on Escape. Default `true`. */
  closeOnEscape?: boolean;
  /** Dismiss guard, consulted on every USER dismissal attempt (backdrop click,
   *  Escape): return `false` to refuse it and keep the dialog open. The wiring
   *  stays armed, so later attempts re-consult the guard. Perform any "why
   *  not" feedback (a toast, a shake) inside the guard before returning.
   *  Programmatic `close()` is unaffected. Omitted = always dismissible. */
  canDismiss?: () => boolean;
  /** Invoked after the dialog has finished closing. */
  onClose?: () => void;
}

/** Handle on a wrapped `<dialog>`. The element is the caller's throughout: this
 *  controller adds wiring, classes and, on open, the dialog's live-region pair,
 *  and creates or removes no other node. The pair stays the dialog's last two
 *  children while it is open, and leaves when its last owner releases: render
 *  content into a child element, never by replacing the dialog's children, or
 *  announcements go silent. */
export interface DialogController {
  /** Open as a platform modal, cancelling a leave fade still in flight so a
   *  reopen mid-fade is safe. A no-op while already open. Throws as
   *  `openDialog` does. */
  open(): void;
  /** Close through the fade-out lifecycle. Programmatic, so `canDismiss` does
   *  not apply. */
  close(): void;
  /** The `<dialog>` handed to `createDialog`, never a node this controller
   *  made. Only the caller may remove it, and removing it neither unwires the
   *  controller nor clears this reference: it keeps reading back a detached
   *  node, listeners and all, until `dispose()` runs. */
  readonly el: HTMLDialogElement;
  /** Close the dialog at once if it is open (no fade, no `onClose`), remove
   *  the dismissal wiring and the `uip-dialog` class, and end its open,
   *  releasing its hold on the dialog's live-region pair. */
  dispose(): void;
}

/** Open a native <dialog> as a modal, first mounting its polite and assertive
 *  live regions so `announce` reaches assistive tech while the rest of the
 *  page is inert, and rank it above every dialog opened before it:
 *  announcements, toasts and popups go to the last one opened. The open ends,
 *  releasing its hold on the regions, at the next `close` event delivered
 *  while the dialog is closed. A no-op on an open dialog beyond cancelling its
 *  leave fade. Rethrows `showModal()`'s `InvalidStateError` for a
 *  disconnected dialog or one showing as a popover, holding nothing. */
export function openDialog(dialog: HTMLDialogElement): void {
  // A reopen inside the leave fade cancels it outright: the pending settle
  // belongs to a close this call is replacing, so drop it rather than leaving
  // it to be no-oped by a guard downstream.
  cancelTransition(dialog);
  dialog.classList.remove("is-leaving");
  if (dialog.open) {
    return;
  }
  trackOpen(dialog);
  try {
    dialog.showModal();
  } catch (error) {
    endOpen(dialog);
    throw error;
  }
}

/** Close a native <dialog> after a fade-out: add `is-leaving`, wait for
 *  `transitionend` (or the fallback), then close and invoke `onClosed`. A
 *  reopen (`openDialog`) cancels a pending close, so `onClosed` does not fire
 *  for a dialog that was reclaimed mid-fade. */
export function closeDialog(dialog: HTMLDialogElement, onClosed?: () => void): void {
  if (!dialog.open) {
    onClosed?.();
    return;
  }
  runTransition(dialog, {
    change: () => {
      dialog.classList.add("is-leaving");
    },
    settled: () => {
      dialog.classList.remove("is-leaving");
      dialog.close();
      onClosed?.();
    },
  });
}

/** Wire drag-safe backdrop dismissal on a native <dialog>: `onDismiss` fires
 *  only when a press both starts and ends on the dialog element itself.
 *  Returns a cleanup fn that removes both listeners. */
export function wireBackdropDismiss(dialog: HTMLDialogElement, onDismiss: () => void): () => void {
  let downOnDialog = false;
  const onMouseDown = (e: MouseEvent): void => {
    // A backdrop press targets the dialog element itself (content presses
    // target a descendant). Record it so a drag-select that ends on the
    // backdrop doesn't count as a backdrop click.
    downOnDialog = e.target === dialog;
  };
  const onMouseUp = (e: MouseEvent): void => {
    const onBackdrop = e.target === dialog && downOnDialog;
    downOnDialog = false;
    if (onBackdrop) {
      onDismiss();
    }
  };
  dialog.addEventListener("mousedown", onMouseDown);
  dialog.addEventListener("mouseup", onMouseUp);
  return (): void => {
    dialog.removeEventListener("mousedown", onMouseDown);
    dialog.removeEventListener("mouseup", onMouseUp);
  };
}

/** Wrap an existing native <dialog> with backdrop + Escape dismissal and the
 *  fade-out close lifecycle. Adds the `uip-dialog` class for the base skin. */
export function createDialog(dialog: HTMLDialogElement, opts?: DialogOptions): DialogController {
  const closeOnBackdrop = opts?.closeOnBackdrop ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;
  const onClose = opts?.onClose;

  dialog.classList.add("uip-dialog");

  const doClose = (): void => {
    closeDialog(dialog, onClose);
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
    // A nested `<input type=file>` fires a bubbling `cancel` when its picker
    // is dismissed (https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/cancel_event);
    // only the dialog's own `cancel` is an Escape.
    if (e.target !== dialog) {
      return;
    }
    // The platform fires `cancel` on Escape then closes instantly. Intercept
    // it so the fade-out lifecycle runs (or so Escape is ignored entirely, or
    // refused by the guard).
    e.preventDefault();
    if (closeOnEscape) {
      dismiss();
    }
  };

  dialog.addEventListener("cancel", onCancel);

  return {
    el: dialog,
    open: () => {
      openDialog(dialog);
    },
    close: doClose,
    dispose: () => {
      cleanupBackdrop?.();
      dialog.removeEventListener("cancel", onCancel);
      cancelTransition(dialog);
      dialog.classList.remove("uip-dialog", "is-leaving");
      dialog.close();
      endOpen(dialog);
    },
  };
}
