// modal-host.ts — INTERNAL helper (not a subpath export): resolve the open
// <dialog> that page-level chrome must live inside to stay usable.
//
// Why: `showModal()` makes everything outside the dialog's SUBTREE inert —
// inertness is DOM-tree-scoped, not stacking-scoped, so an element merely
// painted above the modal (top layer, high z-index) is still dead to clicks,
// hover, and assistive technology while the modal is open. Chrome that must
// stay live during a modal (the toast stack, the announce live regions) has to
// be re-hosted INTO the dialog subtree — the same rule tooltip and popup apply
// per-show via `closest("dialog[open]")`, generalized for chrome that has no
// anchor element to derive the dialog from.

/** `:modal` matches only dialogs opened via `showModal()`. Engines without a
 *  faithful `:modal` (happy-dom reports `false` even for showModal-opened
 *  dialogs) fall through to the caller's last-open-dialog fallback. */
function isModal(dialog: HTMLDialogElement): boolean {
  try {
    return dialog.matches(":modal");
  } catch {
    return false;
  }
}

/** The open `<dialog>` chrome should host into, or `null` when none is open:
 *  the last open dialog matching `:modal` (document order approximates
 *  top-layer order whenever dialogs are appended in open order — the common
 *  case for built-on-demand modals), falling back to the last open dialog of
 *  any kind. The fallback keeps the resolution working where `:modal` is
 *  unfaithful (happy-dom) and is harmless when the dialog is genuinely
 *  non-modal: nothing is inert then, and the hosted chrome is
 *  `position: fixed`, so it paints in the same viewport spot either way. */
export function topmostOpenDialog(): HTMLDialogElement | null {
  let lastModal: HTMLDialogElement | null = null;
  let lastOpen: HTMLDialogElement | null = null;
  for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) {
    lastOpen = dialog;
    if (isModal(dialog)) {
      lastModal = dialog;
    }
  }
  return lastModal ?? lastOpen;
}
