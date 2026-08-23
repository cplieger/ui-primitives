// dialog.ts — Thin behavior layer over the native <dialog> element. The
// platform gives us focus containment, the top layer, and Escape-to-close for
// free; this module adds backdrop-click dismissal (drag-safe) and a fade-out
// lifecycle via a namespaced `is-leaving` class before the element is closed.

import { cancelTransition, runTransition } from "./transition.js";

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

export interface DialogController {
  open(): void;
  close(): void;
  readonly el: HTMLDialogElement;
  dispose(): void;
}

/** Open a native <dialog> as a modal. An older engine may lack `showModal()`;
 *  fall back to the `open` property so behavior degrades. */
export function openDialog(dialog: HTMLDialogElement): void {
  // A reopen inside the leave fade cancels it outright: the pending settle
  // belongs to a close this call is replacing, so drop it rather than leaving
  // it to be no-oped by a guard downstream.
  cancelTransition(dialog);
  dialog.classList.remove("is-leaving");
  if (dialog.open) {
    return;
  }
  try {
    dialog.showModal();
    return;
  } catch {
    // showModal() absent or not implemented — degrade gracefully.
  }
  dialog.open = true;
}

function closeNative(dialog: HTMLDialogElement): void {
  try {
    dialog.close();
    return;
  } catch {
    // close() absent or not implemented — degrade to the attribute.
  }
  dialog.open = false;
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
      closeNative(dialog);
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
      dialog.classList.remove("uip-dialog");
    },
  };
}
