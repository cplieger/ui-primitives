// prompt.ts — Promise-based single-input dialog on a lazily-created, reused
// native <dialog>: the input-collecting sibling of confirm (and the styled,
// non-blocking replacement for window.prompt). Resolves the input's value on
// OK / Enter, or `null` on Cancel, Escape, backdrop click, or preemption by a
// newer prompt(). The message doubles as the input's visible <label>.

import { el } from "@cplieger/reactive";

import { closeDialog, openDialog, wireBackdropDismiss } from "./dialog.js";

export interface PromptOptions {
  /** Optional concise heading. With a title, the dialog is labelled by it and
   *  described by the message; without one, the message is the label. */
  title?: string;
  /** OK button text. Default `"OK"`. */
  confirmLabel?: string;
  /** Cancel button text. Default `"Cancel"`. */
  cancelLabel?: string;
  /** Input type. Default `"text"`. */
  type?: "text" | "password";
  /** Pre-filled value, focused and selected on open (like window.prompt). */
  initialValue?: string;
  /** Input placeholder. */
  placeholder?: string;
  /** Maximum input length (the native `maxlength` constraint). */
  maxLength?: number;
  /** Autocomplete hint (e.g. `"new-password"` for a password-manager-aware
   *  password prompt). Default `"off"`. */
  autocomplete?: string;
}

interface PromptRefs {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  message: HTMLLabelElement;
  input: HTMLInputElement;
  form: HTMLFormElement;
  ok: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

const TITLE_ID = "uip-prompt-title";
const MSG_ID = "uip-prompt-msg";
const INPUT_ID = "uip-prompt-input";

let refs: PromptRefs | null = null;

interface Pending {
  preempt(): void;
}
let pending: Pending | null = null;

function ensureRefs(): PromptRefs {
  if (refs !== null) {
    return refs;
  }
  const title = el("h2", { className: "uip-prompt-title", id: TITLE_ID });
  // The message is the input's real <label>, so the association is native form
  // semantics rather than ARIA plumbing.
  const message = el("label", {
    className: "uip-prompt-msg",
    id: MSG_ID,
    for: INPUT_ID,
  }) as HTMLLabelElement;
  const input = el("input", {
    className: "uip-prompt-input",
    id: INPUT_ID,
  }) as HTMLInputElement;
  const cancel = el("button", {
    type: "button",
    className: "uip-prompt-cancel",
  }) as HTMLButtonElement;
  // OK is the form's submit button, so Enter inside the input activates it.
  const ok = el("button", { type: "submit", className: "uip-prompt-ok" }) as HTMLButtonElement;
  const actions = el("div", { className: "uip-prompt-actions" }, cancel, ok);
  const form = el(
    "form",
    { className: "uip-prompt-form" },
    message,
    input,
    actions,
  ) as HTMLFormElement;
  const dialog = el("dialog", { className: "uip-prompt" }, title, form) as HTMLDialogElement;
  document.body.appendChild(dialog);
  refs = { dialog, title, message, input, form, ok, cancel };
  return refs;
}

/** Show a single-input dialog. Resolves the input's value on OK / Enter, or
 *  `null` on Cancel, Escape, backdrop click, or preemption by a later
 *  `prompt()` call. The value is returned as-is (not trimmed); an empty
 *  submission resolves `""`, distinct from the `null` of a cancellation. */
export function prompt(message: string, opts?: PromptOptions): Promise<string | null> {
  const r = ensureRefs();
  const titleText = opts?.title;

  // Preempt any prior open prompt — it resolves null and its listeners drop,
  // but the (reused) dialog stays open for this new prompt.
  if (pending !== null) {
    const prev = pending;
    pending = null;
    prev.preempt();
  }

  if (titleText !== undefined && titleText !== "") {
    r.title.textContent = titleText;
    r.title.hidden = false;
    r.dialog.setAttribute("aria-labelledby", TITLE_ID);
    r.dialog.setAttribute("aria-describedby", MSG_ID);
  } else {
    r.title.textContent = "";
    r.title.hidden = true;
    r.dialog.setAttribute("aria-labelledby", MSG_ID);
    r.dialog.removeAttribute("aria-describedby");
  }
  r.message.textContent = message;
  r.ok.textContent = opts?.confirmLabel ?? "OK";
  r.cancel.textContent = opts?.cancelLabel ?? "Cancel";

  r.input.type = opts?.type ?? "text";
  r.input.value = opts?.initialValue ?? "";
  r.input.autocomplete = (opts?.autocomplete ?? "off") as AutoFill;
  if (opts?.placeholder !== undefined) {
    r.input.placeholder = opts.placeholder;
  } else {
    r.input.removeAttribute("placeholder");
  }
  if (opts?.maxLength !== undefined) {
    r.input.maxLength = opts.maxLength;
  } else {
    r.input.removeAttribute("maxlength");
  }

  // Clear a stale leaving state in case this reuses a dialog mid fade-out.
  r.dialog.classList.remove("is-leaving");

  return new Promise<string | null>((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    let settled = false;

    openDialog(r.dialog);
    // Native <dialog>.showModal() already traps Tab and restores focus to the
    // opener on close. Focus the input and select any pre-filled value, like
    // window.prompt does, so typing replaces it.
    r.input.focus();
    r.input.select();

    const teardown = (): void => {
      controller.abort();
      cleanupBackdrop();
    };

    // Preemption: resolve null without animating closed — the newer prompt
    // reuses the still-open dialog.
    const preempt = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      teardown();
      resolve(null);
    };

    const self: Pending = { preempt };
    pending = self;

    const settle = (value: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (pending === self) {
        pending = null;
      }
      teardown();
      closeDialog(r.dialog);
      resolve(value);
    };

    r.form.addEventListener(
      "submit",
      (e) => {
        // Enter in the input and the OK button both land here.
        e.preventDefault();
        settle(r.input.value);
      },
      { signal },
    );
    r.cancel.addEventListener(
      "click",
      () => {
        settle(null);
      },
      { signal },
    );
    r.dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        settle(null);
      },
      { signal },
    );

    const cleanupBackdrop = wireBackdropDismiss(r.dialog, () => {
      settle(null);
    });
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
