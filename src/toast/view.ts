// view.ts — DOM implementation of the toast `ToastView` port. Builds the stack
// container + per-toast nodes with `el`, wires interaction to the engine's
// callbacks, and manages the enter/leave lifecycle via `is-entering` →
// `is-shown` → `is-leaving` state classes. The countdown is driven by the
// `--uip-toast-duration` custom property (the CSS animates the progress bar
// from it); pause/resume freeze the progress animation via play-state.

import { el } from "@cplieger/reactive";

import type { ToastCallbacks, ToastRenderData, ToastView } from "./engine.js";

/** Fallback (ms) if `transitionend` never fires so a toast is always removed. */
const LEAVE_FALLBACK_MS = 400;

export interface ToastHandle {
  readonly el: HTMLElement;
  readonly progressEl: HTMLElement | null;
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
        "aria-label": `${data.level} notification: ${data.message}. Click to dismiss.`,
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
      node.addEventListener("mouseenter", () => {
        ctx.pause();
      });
      node.addEventListener("mouseleave", () => {
        ctx.resume();
      });
      node.addEventListener("focusin", () => {
        ctx.pause();
      });
      node.addEventListener("focusout", () => {
        ctx.resume();
      });

      stack.appendChild(node);
      requestAnimationFrame(() => {
        node.classList.remove("is-entering");
        node.classList.add("is-shown");
      });

      return { el: node, progressEl };
    },

    scheduleLeave(handle: ToastHandle, done: () => void): void {
      const node = handle.el;
      let finished = false;
      let fallback: ReturnType<typeof setTimeout> | null = null;
      const finish = (): void => {
        if (finished) {
          return;
        }
        finished = true;
        if (fallback !== null) {
          clearTimeout(fallback);
        }
        node.removeEventListener("transitionend", onEnd);
        node.remove();
        done();
      };
      const onEnd = (e: TransitionEvent): void => {
        if (e.target === node) {
          finish();
        }
      };
      node.addEventListener("transitionend", onEnd);
      fallback = setTimeout(finish, LEAVE_FALLBACK_MS);
      node.classList.remove("is-shown");
      node.classList.add("is-leaving");
    },

    remove(handle: ToastHandle): void {
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
