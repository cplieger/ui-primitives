// toast/index.ts — Public toast surface: the `Toaster` factory + a default
// module singleton for convenience, with `info` / `success` / `error` free
// functions bound to it.

import { ToastEngine } from "./engine.js";
import type { ToastLevel, ToastOptions, ToastRetry } from "./engine.js";
import { createToastView } from "./view.js";
import type { ToastHandle } from "./view.js";

export type { ToastLevel, ToastOptions, ToastRetry };

export interface Toaster {
  /** Show a toast; returns a function that dismisses it. */
  show(message: string, opts?: ToastOptions): () => void;
  info(message: string): () => void;
  success(message: string): () => void;
  error(message: string, retry?: ToastRetry): () => void;
  /** Dismiss all visible toasts and clear the queue. */
  clear(): void;
  /** Tear down this toaster: remove its document keydown (Escape) listener,
   *  clear all toasts, and remove its stack container. Call this for any
   *  per-component `createToaster()` so its listener doesn't outlive the
   *  component. (The module `toast` singleton lives for the app's lifetime, so
   *  it is never disposed.) */
  dispose(): void;
}

interface ResettableToaster extends Toaster {
  /** Clear state + remove the container (kept internal; the ESC handler stays). */
  reset(): void;
}

export interface ToasterOptions {
  /** Maximum simultaneously-visible toasts (`"stack"` mode). Default `3`. */
  maxVisible?: number;
  /** Overflow queue capacity (`"stack"` mode; oldest dropped). Default `20`. */
  maxQueue?: number;
  /** Auto-dismiss window (ms) for non-error toasts. Default `4000`. */
  defaultDuration?: number;
  /** Mount the toast stack inside this element instead of `document.body` —
   *  for an embeddable widget that must confine its chrome to its own root. */
  container?: HTMLElement;
  /** `"stack"` (default): up to `maxVisible` show, the rest queue.
   *  `"replace"`: single-slot latest-wins — a new toast instantly replaces the
   *  visible one; nothing queues. */
  mode?: "stack" | "replace";
}

function build(opts?: ToasterOptions): ResettableToaster {
  const view = createToastView(opts?.container);
  const engine = new ToastEngine<ToastHandle>({
    view,
    ...(opts?.maxVisible !== undefined ? { maxVisible: opts.maxVisible } : {}),
    ...(opts?.maxQueue !== undefined ? { maxQueue: opts.maxQueue } : {}),
    ...(opts?.defaultDuration !== undefined ? { defaultDuration: opts.defaultDuration } : {}),
    ...(opts?.mode !== undefined ? { mode: opts.mode } : {}),
  });

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      engine.dismissNewest();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  return {
    show: (message, showOpts) => engine.show(message, showOpts),
    info: (message) => engine.show(message, { level: "info" }),
    success: (message) => engine.show(message, { level: "success" }),
    error: (message, retry) =>
      engine.show(message, retry !== undefined ? { level: "error", retry } : { level: "error" }),
    clear: () => {
      engine.clear();
    },
    dispose: () => {
      document.removeEventListener("keydown", onKeyDown);
      engine.clear();
      view.dispose();
    },
    reset: () => {
      engine.clear();
      view.dispose();
    },
  };
}

/** Create an isolated toaster with its own stack container and queue. */
export function createToaster(opts?: ToasterOptions): Toaster {
  return build(opts);
}

const singleton = build();

/** Default shared toaster. */
export const toast: Toaster = singleton;

/** Show an info toast on the default toaster. */
export function info(message: string): () => void {
  return singleton.info(message);
}

/** Show a success toast on the default toaster. */
export function success(message: string): () => void {
  return singleton.success(message);
}

/** Show an error toast on the default toaster. */
export function error(message: string, retry?: ToastRetry): () => void {
  return singleton.error(message, retry);
}

/** Test-only: clear the default toaster and remove its container. */
export function _resetForTest(): void {
  singleton.reset();
}
