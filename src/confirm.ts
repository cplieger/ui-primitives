// confirm.ts — Promise-based confirmation dialog on a lazily-created, reused
// native <dialog>. Destructive prompts upgrade to role="alertdialog" and focus
// the Cancel button (WAI-ARIA: don't let a keyboard user confirm by accident).
// A newer confirm preempts any open one, resolving the prior to `false`.

import { el } from "@cplieger/reactive";

import { closeModal, openModal } from "./dialog.js";

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "normal" | "destructive";
}

interface ConfirmRefs {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  message: HTMLElement;
  ok: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

const TITLE_ID = "uip-confirm-title";
const MSG_ID = "uip-confirm-msg";

let refs: ConfirmRefs | null = null;

interface Pending {
  preempt(): void;
}
let pending: Pending | null = null;

function ensureRefs(): ConfirmRefs {
  if (refs !== null) {
    return refs;
  }
  const title = el("h2", { className: "uip-confirm-title", id: TITLE_ID });
  const message = el("p", { className: "uip-confirm-msg", id: MSG_ID });
  const cancel = el("button", {
    type: "button",
    className: "uip-confirm-cancel",
  }) as HTMLButtonElement;
  const ok = el("button", { type: "button", className: "uip-confirm-ok" }) as HTMLButtonElement;
  const actions = el("div", { className: "uip-confirm-actions" }, cancel, ok);
  const dialog = el(
    "dialog",
    { className: "uip-confirm" },
    title,
    message,
    actions,
  ) as HTMLDialogElement;
  document.body.appendChild(dialog);
  refs = { dialog, title, message, ok, cancel };
  return refs;
}

/** Show a confirmation dialog. Resolves `true` on confirm, `false` on cancel,
 *  Escape, backdrop click, or preemption by a later `confirm()` call. */
export function confirm(message: string, opts?: ConfirmOptions): Promise<boolean> {
  const r = ensureRefs();
  const variant = opts?.variant ?? "normal";
  const titleText = opts?.title;

  // Preempt any prior open confirm — it resolves false and its listeners drop,
  // but the (reused) dialog stays open for this new prompt.
  if (pending !== null) {
    const prev = pending;
    pending = null;
    prev.preempt();
  }

  if (titleText !== undefined && titleText !== "") {
    // With a title, the dialog's accessible NAME is the concise title and its
    // DESCRIPTION is the message body (alertdialog wants a short name + body).
    r.title.textContent = titleText;
    r.title.hidden = false;
    r.dialog.setAttribute("aria-labelledby", TITLE_ID);
    r.dialog.setAttribute("aria-describedby", MSG_ID);
  } else {
    // Title-less: fall back to labelling the dialog by its message.
    r.title.textContent = "";
    r.title.hidden = true;
    r.dialog.setAttribute("aria-labelledby", MSG_ID);
    r.dialog.removeAttribute("aria-describedby");
  }
  r.message.textContent = message;
  r.ok.textContent = opts?.confirmLabel ?? "Confirm";
  r.cancel.textContent = opts?.cancelLabel ?? "Cancel";

  if (variant === "destructive") {
    r.dialog.setAttribute("role", "alertdialog");
    r.ok.classList.add("is-destructive");
  } else {
    r.dialog.removeAttribute("role");
    r.ok.classList.remove("is-destructive");
  }
  // Clear a stale leaving state in case this reuses a dialog mid fade-out.
  r.dialog.classList.remove("is-leaving");

  return new Promise<boolean>((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    let settled = false;

    openModal(r.dialog);
    // Native <dialog>.showModal() already traps Tab and restores focus to the
    // opener on close, so we don't add a focus-trap (two would fight over Tab).
    // We only place the initial focus: Cancel for destructive prompts, so a
    // keyboard user can't confirm by accident.
    (variant === "destructive" ? r.cancel : r.ok).focus();

    const teardown = (): void => {
      controller.abort();
    };

    // Preemption: resolve false without animating closed — the newer confirm
    // reuses the still-open dialog.
    const preempt = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      teardown();
      resolve(false);
    };

    const self: Pending = { preempt };
    pending = self;

    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (pending === self) {
        pending = null;
      }
      teardown();
      closeModal(r.dialog);
      resolve(value);
    };

    r.ok.addEventListener(
      "click",
      () => {
        settle(true);
      },
      { signal },
    );
    r.cancel.addEventListener(
      "click",
      () => {
        settle(false);
      },
      { signal },
    );
    r.dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        settle(false);
      },
      { signal },
    );

    let downOnDialog = false;
    r.dialog.addEventListener(
      "mousedown",
      (e) => {
        downOnDialog = e.target === r.dialog;
      },
      { signal },
    );
    r.dialog.addEventListener(
      "mouseup",
      (e) => {
        const onBackdrop = e.target === r.dialog && downOnDialog;
        downOnDialog = false;
        if (onBackdrop) {
          settle(false);
        }
      },
      { signal },
    );
  });
}

/** Test-only: remove the shared dialog and reset internal state. */
export function _resetForTest(): void {
  if (pending !== null) {
    const prev = pending;
    pending = null;
    prev.preempt();
  }
  if (refs !== null) {
    refs.dialog.remove();
    refs = null;
  }
}
