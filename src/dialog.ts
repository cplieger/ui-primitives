// dialog.ts — Thin behavior layer over the native <dialog> element. The
// platform gives us focus containment, the top layer, and Escape-to-close for
// free; this module adds backdrop-click dismissal (drag-safe) and a fade-out
// lifecycle via a namespaced `is-leaving` class before the element is closed.

/** Fallback timeout (ms) if `transitionend` never fires (no CSS transition,
 *  reduced motion, or an interrupted animation). */
const LEAVE_FALLBACK_MS = 400;

export interface DialogOptions {
  /** Close when the backdrop is clicked. Default `true`. */
  closeOnBackdrop?: boolean;
  /** Close on Escape. Default `true`. */
  closeOnEscape?: boolean;
  /** Invoked after the dialog has finished closing. */
  onClose?: () => void;
}

export interface DialogController {
  open(): void;
  close(): void;
  readonly el: HTMLDialogElement;
  dispose(): void;
}

/** Open a native <dialog> as a modal. happy-dom / older engines may lack
 *  `showModal()`; fall back to the `open` property so behavior degrades. */
export function openModal(dialog: HTMLDialogElement): void {
  if (dialog.open) {
    return;
  }
  try {
    dialog.showModal();
    return;
  } catch {
    // showModal() absent or not implemented (happy-dom) — degrade gracefully.
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
 *  `transitionend` (or the fallback), then close and invoke `onClosed`. */
export function closeModal(dialog: HTMLDialogElement, onClosed?: () => void): void {
  if (!dialog.open) {
    onClosed?.();
    return;
  }
  let done = false;
  let fallback: ReturnType<typeof setTimeout> | null = null;
  const finish = (): void => {
    if (done) {
      return;
    }
    done = true;
    if (fallback !== null) {
      clearTimeout(fallback);
    }
    dialog.removeEventListener("transitionend", onEnd);
    // If the leaving state was reset (e.g. the element was reused by a newer
    // caller), don't yank it closed out from under the new owner.
    if (dialog.classList.contains("is-leaving")) {
      dialog.classList.remove("is-leaving");
      closeNative(dialog);
      onClosed?.();
    }
  };
  const onEnd = (e: TransitionEvent): void => {
    if (e.target === dialog) {
      finish();
    }
  };
  dialog.addEventListener("transitionend", onEnd);
  fallback = setTimeout(finish, LEAVE_FALLBACK_MS);
  dialog.classList.add("is-leaving");
}

/** Wrap an existing native <dialog> with backdrop + Escape dismissal and the
 *  fade-out close lifecycle. Adds the `uip-dialog` class for the base skin. */
export function createDialog(dialog: HTMLDialogElement, opts?: DialogOptions): DialogController {
  const closeOnBackdrop = opts?.closeOnBackdrop ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;
  const onClose = opts?.onClose;

  dialog.classList.add("uip-dialog");

  let downOnDialog = false;

  const doClose = (): void => {
    closeModal(dialog, onClose);
  };

  const onMouseDown = (e: MouseEvent): void => {
    // A backdrop press targets the dialog element itself (content presses
    // target a descendant). Record it so a drag-select that ends on the
    // backdrop doesn't count as a backdrop click.
    downOnDialog = e.target === dialog;
  };
  const onMouseUp = (e: MouseEvent): void => {
    const onBackdrop = e.target === dialog && downOnDialog;
    downOnDialog = false;
    if (closeOnBackdrop && onBackdrop) {
      doClose();
    }
  };
  const onCancel = (e: Event): void => {
    // The platform fires `cancel` on Escape then closes instantly. Intercept
    // it so the fade-out lifecycle runs (or so Escape is ignored entirely).
    e.preventDefault();
    if (closeOnEscape) {
      doClose();
    }
  };

  dialog.addEventListener("mousedown", onMouseDown);
  dialog.addEventListener("mouseup", onMouseUp);
  dialog.addEventListener("cancel", onCancel);

  return {
    el: dialog,
    open: () => {
      openModal(dialog);
    },
    close: doClose,
    dispose: () => {
      dialog.removeEventListener("mousedown", onMouseDown);
      dialog.removeEventListener("mouseup", onMouseUp);
      dialog.removeEventListener("cancel", onCancel);
      dialog.classList.remove("uip-dialog");
    },
  };
}
