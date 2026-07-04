// view-transition.ts — Queued, feature-detected, rejection-safe wrapper over
// document.startViewTransition. Overlapping calls serialize through a
// module-level pending promise so transitions never visually overlap; when the
// API is unavailable the callback runs directly. The returned promise resolves
// when the transition (or the direct run) finishes — ready/finished rejections
// (e.g. a transition skipped under prefers-reduced-motion) are swallowed so a
// cosmetic transition never rejects the caller.

let pending: Promise<void> = Promise.resolve();

/** Run `fn` inside a serialized document view transition. Resolves when the
 *  transition (or, when the API is absent, the direct call) finishes. */
export function viewTransition(fn: () => void | Promise<void>): Promise<void> {
  const run = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime feature detection
    if (!document.startViewTransition) {
      await fn();
      return;
    }
    const transition = document.startViewTransition(fn);
    transition.ready.catch(() => undefined);
    await transition.finished.catch(() => undefined);
  };
  // Chain off the previous call regardless of how it settled, then reset the
  // shared tail to a swallowed promise so one failure can't wedge the queue.
  const result = pending.then(run, run);
  pending = result.catch(() => undefined);
  return result;
}
