// showModal() makes everything outside the topmost modal dialog's SUBTREE
// inert regardless of stacking order, so chrome painted above it (the toast
// stack, a popup panel, the announce live regions) is still dead to
// clicks/hover/AT unless re-hosted inside it.

import { acquireRegions } from "./live-regions.js";

/** Each open begun by `trackOpen` and not yet ended, oldest first, mapped to
 *  what ends it. The platform exposes no top-layer order, and document order
 *  is not it: a dialog built early and opened last is on top. */
const opened = new Map<HTMLDialogElement, () => void>();

function isLive(dialog: HTMLDialogElement): boolean {
  return dialog.open && dialog.isConnected;
}

/** Begin an open of `dialog`, which `openDialog` is about to show: rank it
 *  newest, hold its live-region pair, and end this open at the next `close`
 *  event delivered while the dialog is closed. A previous open not yet ended
 *  (its `close` event still queued, or the dialog closed by clearing `open`)
 *  ends first. */
export function trackOpen(dialog: HTMLDialogElement): void {
  endOpen(dialog);
  const release = acquireRegions(dialog);
  const listener = new AbortController();
  dialog.addEventListener(
    "close",
    () => {
      // A `close` queued before this open is delivered after it, with the
      // dialog open again.
      if (!dialog.open) {
        endOpen(dialog);
      }
    },
    { signal: listener.signal },
  );
  opened.set(dialog, () => {
    listener.abort();
    release();
  });
}

/** End `dialog`'s current open now: drop its rank, remove its `close`
 *  listener and release its hold on the dialog's pair. A no-op when no open
 *  is held. */
export function endOpen(dialog: HTMLDialogElement): void {
  const end = opened.get(dialog);
  if (end === undefined) {
    return;
  }
  opened.delete(dialog);
  end();
}

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
 *  the last dialog opened through `openDialog` that is still open and
 *  connected. With none, a dialog opened by a direct `showModal()` is found by
 *  a scan, which can only rank by document order: the last open `:modal`
 *  dialog, else the last open dialog of any kind when `:modal` is unfaithful.
 *  Such a dialog never outranks a tracked one. */
export function topmostOpenDialog(): HTMLDialogElement | null {
  const tracked = [...opened.keys()].findLast(isLive);
  if (tracked !== undefined) {
    return tracked;
  }
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
