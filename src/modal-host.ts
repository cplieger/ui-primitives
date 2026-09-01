// modal-host.ts — INTERNAL helper (not a subpath export): resolve the open
// <dialog> that page-level chrome must live inside to stay usable.
//
// showModal() makes everything outside the dialog's SUBTREE inert regardless
// of stacking order, so chrome painted above the modal (toast stack, announce
// live regions) is still dead to clicks/hover/AT unless re-hosted inside it.

/** Falls through to the last-open-dialog fallback on an engine with no
 *  faithful `:modal`. */
function isModal(dialog: HTMLDialogElement): boolean {
  try {
    return dialog.matches(":modal");
  } catch {
    return false;
  }
}

/** The open `<dialog>` chrome should host into, or `null` when none is open:
 *  the last open dialog matching `:modal` (document order approximates
 *  top-layer order for built-on-demand modals), falling back to the last open
 *  dialog of any kind when `:modal` is unfaithful. */
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
