// view.ts — DOM implementation of the toast `ToastView` port. Builds the stack
// container + per-toast nodes with `el`, wires interaction to the engine's
// callbacks, and manages the enter/leave lifecycle via `is-entering` →
// `is-shown` → `is-leaving` state classes. The countdown is driven by the
// `--uip-toast-duration` custom property (the CSS animates the progress bar
// from it); pause/resume freeze the progress animation via play-state.

import { el } from "@cplieger/reactive";

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
}

/** Create a DOM-backed toast view. Owns a lazily-created `.uip-toast-stack`. */
export function createToastView(): ToastView<ToastHandle> {
  let container: HTMLElement | null = null;

  const ensureContainer = (): HTMLElement => {
    if (container !== null) {
      return container;
    }
    const stack = el("div", {
      className: "uip-toast-stack",
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "false",
    });
    document.body.appendChild(stack);
    container = stack;
    return stack;
  };

  return {
    mount(data: ToastRenderData, ctx: ToastCallbacks): ToastHandle {
      const stack = ensureContainer();
      const node = el("div", {
        className: `uip-toast uip-toast--${data.level} is-entering`,
        tabindex: "0",
        // The message is announced by the visible `.uip-toast-msg` text (inside
        // the polite live region), so the label carries only the affordance
        // hint — repeating the message here would double-announce it.
        "aria-label": `${data.level} notification. Click to dismiss.`,
      });
      if (data.level === "error") {
        node.setAttribute("role", "alert");
      }

      node.appendChild(el("span", { className: "uip-toast-msg" }, data.message));

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

      const handle: ToastHandle = { el: node, progressEl, enterRaf: null };
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
      afterTransition(
        node,
        () => {
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
