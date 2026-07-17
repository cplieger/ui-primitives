// view.ts — DOM implementation of the toast `ToastView` port. Builds a
// purely-visual `.uip-toast-stack` container + per-toast nodes with `el`, wires
// interaction to the engine's callbacks, and manages the enter/leave lifecycle
// via `is-entering` → `is-shown` → `is-leaving` state classes. The countdown is
// driven by the `--uip-toast-duration` custom property (the CSS animates the
// progress bar from it); pause/resume freeze the progress animation via
// play-state. Screen-reader announcement is delegated to `announce()`: neither
// the stack nor the toast nodes are live regions, so no live region ever nests
// inside another, and importing this module mutates no DOM (the stack is
// created lazily, on the first toast shown).

import { el } from "@cplieger/reactive";

import { announce } from "../announce.js";
import { topmostOpenDialog } from "../modal-host.js";
import { afterTransition } from "../transition.js";
import type { ToastCallbacks, ToastRenderData, ToastView } from "./engine.js";

/** Fallback (ms) if `transitionend` never fires so a toast is always removed. */
const LEAVE_FALLBACK_MS = 400;

export interface ToastHandle {
  readonly el: HTMLElement;
  readonly progressEl: HTMLElement | null;
  /** Handle of the pending enter `requestAnimationFrame`, or `null` once it has
   *  run (or been cancelled). Cancelled on leave/remove so a late enter frame
   *  can't re-apply `is-shown` mid-leave. */
  enterRaf: number | null;
  /** afterTransition cancel for the pending leave, or null when idle. */
  leaveCancel: (() => void) | null;
}

/**
 * Create a DOM-backed toast view. Owns a lazily-created `.uip-toast-stack` — a
 * purely VISUAL container (no `role` / `aria-live`), created on the first
 * `mount`, so importing this module appends nothing to the DOM. Screen-reader
 * announcement is handled separately by `announce()` in `mount`, which keeps
 * the visual stack and the SR live region from ever nesting.
 *
 * The stack mounts on `document.body` by default; pass `host` to confine it to
 * an app-owned element instead (an embeddable widget's root, a specific pane),
 * so its stacking and positioning compose with the host page. The base
 * stylesheet positions the stack `fixed` relative to the viewport; a host with
 * a `transform`/`filter`/`contain` creates a new containing block, which scopes
 * the stack to the host — usually exactly what an embedded widget wants.
 *
 * Modal `<dialog>`s: `showModal()` inerts everything outside the dialog
 * subtree, so a body-mounted stack under an open modal would paint behind it
 * AND be dead to clicks/hover/AT. Without an explicit `host`, the stack
 * therefore auto-hosts into the topmost open modal dialog (re-evaluated on
 * every toast shown, and when that dialog closes), so toasts stay visible and
 * interactive over the modal, then return to `document.body`. An explicit
 * `host` pins the stack — an embedded widget's chrome must never escape its
 * root, so it is exempt from auto-hosting.
 */
export function createToastView(host?: HTMLElement): ToastView<ToastHandle> {
  let container: HTMLElement | null = null;
  // The open modal <dialog> currently hosting the stack (auto-hosting only;
  // null when the stack sits on `host` / document.body). Its `close` event
  // re-runs syncHost so a sticky toast is evacuated before the closed dialog
  // hides it.
  let adoptedDialog: HTMLDialogElement | null = null;

  const onAdoptedClose = (): void => {
    syncHost();
  };

  const releaseAdopted = (): void => {
    if (adoptedDialog !== null) {
      adoptedDialog.removeEventListener("close", onAdoptedClose);
      adoptedDialog = null;
    }
  };

  /** Move the stack to where it must live RIGHT NOW: the explicit `host` when
   *  configured, else the topmost open modal dialog, else `document.body`.
   *  `appendChild` MOVES the stack, so live toasts (with their timers,
   *  listeners, and progress state) ride along untouched. */
  const syncHost = (): void => {
    if (container === null) {
      return;
    }
    const desired: HTMLElement = host ?? topmostOpenDialog() ?? document.body;
    if (container.parentElement !== desired) {
      desired.appendChild(container);
    }
    const dialog = host === undefined && desired instanceof HTMLDialogElement ? desired : null;
    if (dialog !== adoptedDialog) {
      releaseAdopted();
      if (dialog !== null) {
        adoptedDialog = dialog;
        dialog.addEventListener("close", onAdoptedClose);
      }
    }
  };

  const ensureContainer = (): HTMLElement => {
    // Visual-only container: deliberately NOT a live region. Announcement
    // goes through announce() (see `mount`), so an error node's live region
    // can never nest inside a polite stack, and nothing is appended to the
    // DOM until a toast is actually shown.
    container ??= el("div", { className: "uip-toast-stack" });
    // Re-resolve the host on every mount: a modal may have opened or closed
    // since the last toast (and covers hosts that vanished, e.g. a disposed
    // dialog that was removed while the stack sat inside it).
    syncHost();
    return container;
  };

  return {
    mount(data: ToastRenderData, ctx: ToastCallbacks): ToastHandle {
      const stack = ensureContainer();

      // Announce the message to screen readers through the shared live region
      // (announce()), NOT through the toast node. The node stays a plain,
      // non-live element, so no live region nests inside another and there is
      // no double-announce. announce()'s region pre-exists its text and
      // clears-then-sets, so even the first toast announces reliably. Errors
      // interrupt (assertive); info / success are polite.
      announce(data.message, data.level === "error" ? "assertive" : "polite");

      const node = el("div", {
        className: `uip-toast uip-toast--${data.level} is-entering`,
        tabindex: "0",
      });

      // The visible message, then the dismiss hint as a visually-hidden (NOT
      // aria-hidden) span. The node is not a live region, so this subtree is not
      // auto-announced; the hint is here so the FOCUSABLE node is
      // self-describing — the toast is `tabindex=0`, so a keyboard /
      // screen-reader user who tabs to it hears the message plus how to dismiss
      // it. (The transient "a toast appeared: <message>" announcement is
      // announce()'s job, above.)
      node.appendChild(el("span", { className: "uip-toast-msg" }, data.message));
      node.appendChild(el("span", { className: "uip-visually-hidden" }, "Click to dismiss."));

      const retry = data.retry;
      if (retry !== undefined) {
        const btn = el(
          "button",
          { type: "button", className: "uip-toast-retry" },
          retry.label ?? "Retry",
        );
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          ctx.dismiss();
          runRetry(retry.onClick);
        });
        node.appendChild(btn);
      }

      let progressEl: HTMLElement | null = null;
      if (data.duration > 0) {
        // Documented contract: the duration lives in a custom property; the CSS
        // animates the progress bar from it (no inline transition-duration).
        node.style.setProperty("--uip-toast-duration", `${data.duration}ms`);
        progressEl = el("span", { className: "uip-toast-progress", "aria-hidden": "true" });
        node.appendChild(progressEl);
      }

      node.addEventListener("click", () => {
        ctx.dismiss();
      });
      // tabindex=0 is for pause-on-focus; make the FOCUSED toast dismissable by
      // keyboard too (Escape only targets the newest toast, not the focused one).
      // Guard to the node itself so it doesn't swallow the retry button's Enter.
      node.addEventListener("keydown", (e) => {
        if (e.target !== node) {
          return;
        }
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          ctx.dismiss();
        }
      });

      // Two independent pause sources (hover and focus) share one engine timer,
      // so ref-count them: pause on the first (0 -> 1) and resume only on the
      // last (1 -> 0). Without this, un-hovering a still-focused toast would
      // resume the countdown and it could auto-dismiss while focused.
      let pauseCount = 0;
      const addPause = (): void => {
        pauseCount++;
        if (pauseCount === 1) {
          ctx.pause();
        }
      };
      const removePause = (): void => {
        if (pauseCount === 0) {
          return;
        }
        pauseCount--;
        if (pauseCount === 0) {
          ctx.resume();
        }
      };
      node.addEventListener("mouseenter", addPause);
      node.addEventListener("mouseleave", removePause);
      node.addEventListener("focusin", addPause);
      node.addEventListener("focusout", removePause);

      const handle: ToastHandle = { el: node, progressEl, enterRaf: null, leaveCancel: null };
      stack.appendChild(node);
      handle.enterRaf = requestAnimationFrame(() => {
        handle.enterRaf = null;
        node.classList.remove("is-entering");
        node.classList.add("is-shown");
      });

      return handle;
    },

    scheduleLeave(handle: ToastHandle, done: () => void): void {
      const node = handle.el;
      // A dismiss can land before the enter frame runs. Cancel it (so it can't
      // re-add `is-shown` mid-leave) and settle the node into `is-shown` now, so
      // the leave transition runs from a defined start state and its
      // `transitionend` fires instead of stalling on the fallback timer.
      if (handle.enterRaf !== null) {
        cancelAnimationFrame(handle.enterRaf);
        handle.enterRaf = null;
        node.classList.remove("is-entering");
        node.classList.add("is-shown");
      }
      handle.leaveCancel = afterTransition(
        node,
        () => {
          handle.leaveCancel = null;
          node.remove();
          done();
        },
        LEAVE_FALLBACK_MS,
      );
      node.classList.remove("is-shown");
      node.classList.add("is-leaving");
    },

    remove(handle: ToastHandle): void {
      if (handle.enterRaf !== null) {
        cancelAnimationFrame(handle.enterRaf);
        handle.enterRaf = null;
      }
      if (handle.leaveCancel !== null) {
        handle.leaveCancel();
        handle.leaveCancel = null;
      }
      handle.el.remove();
    },

    pauseProgress(handle: ToastHandle): void {
      if (handle.progressEl !== null) {
        handle.progressEl.style.animationPlayState = "paused";
      }
    },

    resumeProgress(handle: ToastHandle): void {
      if (handle.progressEl !== null) {
        handle.progressEl.style.animationPlayState = "running";
      }
    },

    dispose(): void {
      releaseAdopted();
      if (container !== null) {
        container.remove();
        container = null;
      }
    },
  };
}

/** Invoke a retry handler, guarding both sync throws and async rejections. */
function runRetry(onClick: () => void | Promise<void>): void {
  try {
    const result = onClick();
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        console.error("[uip-toast] retry handler rejected", err);
      });
    }
  } catch (err) {
    console.error("[uip-toast] retry handler threw", err);
  }
}
