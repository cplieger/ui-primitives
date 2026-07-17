// ask.ts — ONE Promise-shaped question dialog: the styled, non-blocking
// replacement for BOTH window.confirm and window.prompt. A plain ask resolves
// `Promise<boolean>` (OK → true; Cancel / Escape / backdrop / preemption →
// false). Passing `input` turns it into a single-input ask resolving
// `Promise<string | null>` (OK / Enter → the value as-is; cancellation paths →
// null) — the overloads narrow the return type from the options shape, so
// call sites keep the exact contracts the old confirm/prompt pair had.
//
// One primitive, one preemption domain: a newer ask() preempts ANY open ask —
// same shape reuses the still-open dialog seamlessly; the other shape's
// dialog is faded closed. Internally each shape keeps its own lazily-created,
// reused native <dialog> (the input shape needs a <form> + <label>-for-input
// structure a boolean ask must not carry), but both share the `.uip-ask`
// class family; the input dialog adds the `.uip-ask--input` modifier.
//
// `variant: "destructive"` upgrades either shape to role="alertdialog" and
// marks OK `is-destructive`. On a boolean ask it also moves initial focus to
// Cancel (WAI-ARIA: a keyboard user must not confirm by accident); an input
// ask always focuses its input — the typed value is what gets submitted, so
// the accidental-Enter hazard the Cancel-focus rule guards against does not
// apply, and type-to-confirm flows (destructive + input) need the caret.

import { el } from "@cplieger/reactive";

import { closeDialog, openDialog, wireBackdropDismiss } from "./dialog.js";

/** Input configuration for an input-collecting ask. */
export interface AskInput {
  /** Input type. Default `"text"`. */
  type?: "text" | "password";
  /** Pre-filled value, focused and selected on open (like window.prompt). */
  initialValue?: string;
  /** Input placeholder. */
  placeholder?: string;
  /** Maximum input length (the native `maxlength` constraint). */
  maxLength?: number;
  /** Autocomplete hint (e.g. `"new-password"` for a password-manager-aware
   *  password ask). Default `"off"`. */
  autocomplete?: string;
}

export interface AskOptions {
  /** Optional concise heading. With a title, the dialog is labelled by it and
   *  described by the message; without one, the message is the label. */
  title?: string;
  /** OK button text. Default `"Confirm"` (boolean ask) / `"OK"` (input ask). */
  confirmLabel?: string;
  /** Cancel button text. Default `"Cancel"`. */
  cancelLabel?: string;
  /** `"destructive"` upgrades to `role="alertdialog"`, marks OK
   *  `is-destructive`, and (boolean ask only) focuses Cancel. */
  variant?: "normal" | "destructive";
  /** Collect a value: the ask gains an input (the message becomes its
   *  `<label>`) and resolves `string | null` instead of `boolean`. Pass a
   *  configuration object or `true` for a default text input. */
  input?: AskInput | true;
}

interface AskRefs {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  message: HTMLElement;
  ok: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

interface AskInputRefs extends AskRefs {
  input: HTMLInputElement;
  form: HTMLFormElement;
}

const INPUT_ID = "uip-ask-input";

let booleanRefs: AskRefs | null = null;
let inputRefs: AskInputRefs | null = null;

/** The one pending ask across BOTH shapes (single preemption domain). */
interface Pending {
  preempt(): void;
  dialog: HTMLDialogElement;
}
let pending: Pending | null = null;

/** The shared action row (Cancel, OK). */
function buildActions(): { ok: HTMLButtonElement; cancel: HTMLButtonElement; row: HTMLElement } {
  const cancel = el("button", {
    type: "button",
    className: "uip-ask-cancel",
  }) as HTMLButtonElement;
  // In the input shape OK is the form's submit button (Enter in the input
  // activates it); in the boolean shape it is a plain button.
  const ok = el("button", { type: "button", className: "uip-ask-ok" }) as HTMLButtonElement;
  const row = el("div", { className: "uip-ask-actions" }, cancel, ok);
  return { ok, cancel, row };
}

function buildBoolean(): AskRefs {
  const title = el("h2", { className: "uip-ask-title", id: "uip-ask-title" });
  const message = el("p", { className: "uip-ask-msg", id: "uip-ask-msg" });
  const { ok, cancel, row } = buildActions();
  const dialog = el("dialog", { className: "uip-ask" }, title, message, row) as HTMLDialogElement;
  document.body.appendChild(dialog);
  return { dialog, title, message, ok, cancel };
}

function buildInput(): AskInputRefs {
  const title = el("h2", { className: "uip-ask-title", id: "uip-ask-input-title" });
  // The message is the input's real <label>, so the association is native
  // form semantics rather than ARIA plumbing.
  const message = el("label", {
    className: "uip-ask-msg",
    id: "uip-ask-input-msg",
    for: INPUT_ID,
  }) as HTMLLabelElement;
  const input = el("input", { className: "uip-ask-input", id: INPUT_ID }) as HTMLInputElement;
  const { ok, cancel, row } = buildActions();
  ok.type = "submit";
  const form = el("form", { className: "uip-ask-form" }, message, input, row) as HTMLFormElement;
  const dialog = el(
    "dialog",
    { className: "uip-ask uip-ask--input" },
    title,
    form,
  ) as HTMLDialogElement;
  document.body.appendChild(dialog);
  return { dialog, title, message, input, form, ok, cancel };
}

/** Show a question dialog. Without `input`, resolves `true` on confirm and
 *  `false` on cancel, Escape, backdrop click, or preemption by a later
 *  `ask()`. */
export function ask(message: string, opts?: AskOptions & { input?: undefined }): Promise<boolean>;
/** Show a single-input dialog (`input` present). Resolves the input's value
 *  on OK / Enter — as-is, not trimmed; an empty submission resolves `""`,
 *  distinct from the `null` of cancellation — or `null` on Cancel, Escape,
 *  backdrop click, or preemption by a later `ask()`. */
export function ask(
  message: string,
  opts: AskOptions & { input: AskInput | true },
): Promise<string | null>;
export function ask(message: string, opts?: AskOptions): Promise<boolean | string | null> {
  const inputOpt = opts?.input;
  const input: AskInput | null = inputOpt === undefined ? null : inputOpt === true ? {} : inputOpt;
  const destructive = (opts?.variant ?? "normal") === "destructive";

  // Resolve this shape's reused dialog (built lazily on first use).
  const ir = input !== null ? (inputRefs ??= buildInput()) : null;
  const r: AskRefs = ir ?? (booleanRefs ??= buildBoolean());
  const cancelValue = input !== null ? null : false;

  // Preempt any prior open ask — across shapes. It resolves to its cancel
  // value and its listeners drop. Same shape: the reused dialog stays open
  // for this new ask (seamless takeover). Other shape: fade its dialog
  // closed; this shape's dialog opens over it.
  if (pending !== null) {
    const prev = pending;
    pending = null;
    prev.preempt();
    if (prev.dialog !== r.dialog) {
      closeDialog(prev.dialog);
    }
  }

  const titleText = opts?.title;
  if (titleText !== undefined && titleText !== "") {
    // With a title, the dialog's accessible NAME is the concise title and its
    // DESCRIPTION is the message body (alertdialog wants a short name + body).
    r.title.textContent = titleText;
    r.title.hidden = false;
    r.dialog.setAttribute("aria-labelledby", r.title.id);
    r.dialog.setAttribute("aria-describedby", r.message.id);
  } else {
    // Title-less: fall back to labelling the dialog by its message.
    r.title.textContent = "";
    r.title.hidden = true;
    r.dialog.setAttribute("aria-labelledby", r.message.id);
    r.dialog.removeAttribute("aria-describedby");
  }
  r.message.textContent = message;
  r.ok.textContent = opts?.confirmLabel ?? (input !== null ? "OK" : "Confirm");
  r.cancel.textContent = opts?.cancelLabel ?? "Cancel";

  if (destructive) {
    r.dialog.setAttribute("role", "alertdialog");
    r.ok.classList.add("is-destructive");
  } else {
    r.dialog.removeAttribute("role");
    r.ok.classList.remove("is-destructive");
  }

  if (ir !== null && input !== null) {
    ir.input.type = input.type ?? "text";
    ir.input.value = input.initialValue ?? "";
    // Set the attribute rather than the IDL property: the property's
    // `AutoFill` union doesn't cover every legal value (autocomplete grammar
    // allows token lists like "section-blue shipping street-address"), so
    // assigning our free-form option would need a lying cast. The attribute
    // reflects into the property identically.
    ir.input.setAttribute("autocomplete", input.autocomplete ?? "off");
    if (input.placeholder !== undefined) {
      ir.input.placeholder = input.placeholder;
    } else {
      ir.input.removeAttribute("placeholder");
    }
    if (input.maxLength !== undefined) {
      ir.input.maxLength = input.maxLength;
    } else {
      ir.input.removeAttribute("maxlength");
    }
  }

  // Clear a stale leaving state in case this reuses a dialog mid fade-out.
  r.dialog.classList.remove("is-leaving");

  return new Promise<boolean | string | null>((resolve) => {
    const controller = new AbortController();
    const { signal } = controller;
    let settled = false;

    openDialog(r.dialog);
    // Native <dialog>.showModal() already traps Tab and restores focus to the
    // opener on close; only the initial placement is ours. Input ask: the
    // input, with any pre-filled value selected. Boolean ask: OK — or Cancel
    // when destructive, so a keyboard user can't confirm by accident.
    if (ir !== null) {
      ir.input.focus();
      ir.input.select();
    } else {
      (destructive ? r.cancel : r.ok).focus();
    }

    const teardown = (): void => {
      controller.abort();
      cleanupBackdrop();
    };

    // Preemption: resolve the cancel value without animating closed — a
    // same-shape successor reuses the still-open dialog (the cross-shape
    // close is the preempting call's job, above).
    const preempt = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      teardown();
      resolve(cancelValue);
    };

    const self: Pending = { preempt, dialog: r.dialog };
    pending = self;

    const settle = (value: boolean | string | null): void => {
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

    if (ir !== null) {
      ir.form.addEventListener(
        "submit",
        (e) => {
          // Enter in the input and the OK button both land here.
          e.preventDefault();
          settle(ir.input.value);
        },
        { signal },
      );
    } else {
      r.ok.addEventListener(
        "click",
        () => {
          settle(true);
        },
        { signal },
      );
    }
    r.cancel.addEventListener(
      "click",
      () => {
        settle(cancelValue);
      },
      { signal },
    );
    r.dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        settle(cancelValue);
      },
      { signal },
    );

    const cleanupBackdrop = wireBackdropDismiss(r.dialog, () => {
      settle(cancelValue);
    });
  });
}

/** Test-only: remove both shared dialogs and reset internal state. */
export function _resetForTest(): void {
  if (pending !== null) {
    const prev = pending;
    pending = null;
    prev.preempt();
  }
  if (booleanRefs !== null) {
    booleanRefs.dialog.remove();
    booleanRefs = null;
  }
  if (inputRefs !== null) {
    inputRefs.dialog.remove();
    inputRefs = null;
  }
}
