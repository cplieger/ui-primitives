// modal.ts — Native-<dialog> modal built from caller content. The sibling to
// the `dialog` member: `dialog` wraps an EXISTING <dialog> element; `modal`
// BUILDS one from arbitrary content. The platform gives focus containment, the
// top layer, background inerting, Escape, nested stacking, and focus-return-to-
// opener for free; this module adds only what a native <dialog> does NOT:
//   - wrapping content in a <dialog class="uip-modal"> with ARIA wiring,
//   - drag-safe backdrop dismissal + the shared fade-out leave lifecycle
//     (reusing openDialog / closeDialog), and
//   - an iOS-safe, ref-counted background scroll-lock (a native <dialog> does
//     NOT lock background scroll, and `overflow:hidden` on the root is ignored
//     by iOS Safari for touch-scroll — so pin the body with position:fixed at
//     the negated scroll offset and restore + scrollTo on release).
//
// The overlay-<div> incarnation (openModal / closeModal / closeTopModal on a
// raw div, a hand-rolled focus-trap stack, ref-counted inert, and overlay
// hoisting) was removed with this rewrite: every one of those is provided by
// the platform once the modal is a real <dialog>.

import { el } from "@cplieger/reactive";

import { closeDialog, openDialog } from "./dialog.js";

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

// ----- iOS-safe, ref-counted background scroll-lock -------------------------
// Ref-counted so nested modals lock once and release only when the last closes.
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

  let downOnDialog = false;
  const onMouseDown = (e: MouseEvent): void => {
    // A backdrop press targets the <dialog> itself; content presses target a
    // descendant. Recorded so a drag-select ending on the backdrop doesn't
    // count as a backdrop click.
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
    // The platform fires `cancel` on Escape then closes instantly. Intercept it
    // so the fade-out lifecycle runs (or so Escape is ignored entirely).
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
    get isOpen(): boolean {
      return dialog.open && !dialog.classList.contains("is-leaving");
    },
    open(): void {
      if (dialog.open) {
        // Reopened mid fade-out: cancel the leave by clearing `is-leaving` (the
        // pending closeDialog finish() no-ops on its guard). The scroll-lock was
        // never released, so there is nothing to re-acquire.
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
      dialog.removeEventListener("mousedown", onMouseDown);
      dialog.removeEventListener("mouseup", onMouseUp);
      dialog.removeEventListener("cancel", onCancel);
      // Cancel any in-flight leave so its pending finish() no-ops, release the
      // lock, close the native dialog (so `open` clears), then remove it.
      dialog.classList.remove("is-leaving");
      releaseLock();
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          // close() absent / not implemented (happy-dom) — degrade to the attr.
          dialog.open = false;
        }
      }
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
