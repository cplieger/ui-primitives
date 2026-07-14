// view-transition.ts — Queued, feature-detected, rejection-safe wrapper over
// document.startViewTransition. Overlapping calls serialize through a
// module-level pending promise so transitions never visually overlap; when the
// API is unavailable the callback runs directly. The returned promise resolves
// when the transition (or the direct run) finishes; both paths swallow errors
// (ready/finished rejections such as a transition skipped under
// prefers-reduced-motion, AND a throwing/rejecting `fn`) so a cosmetic
// transition never rejects the caller — the contract is identical either way.
//
// Suspended-renderer safety: startViewTransition's update callback and its
// `finished` promise both require rendering opportunities. A hidden tab (and
// some remote/virtualized sessions that stay "visible" while the compositor is
// suspended) never grants one — the callback never runs, `finished` never
// settles, and every later call chains behind it: the whole app's view swaps
// wedge while URLs keep changing. Two guards close that class:
//   1. `document.hidden` fast-path — run the swap directly, no transition
//      (nothing is visible to animate anyway);
//   2. a watchdog that calls `transition.skipTransition()` when `finished`
//      has not settled in time. Skipping still runs the update callback and
//      settles `finished` via task queues, no frames needed, so the DOM swap
//      always lands.

let pending: Promise<void> = Promise.resolve();

/** How long a transition may stay unsettled before the watchdog skips it.
 *  Generous next to real transition durations (a few hundred ms): only a
 *  starved renderer ever reaches it. */
const SKIP_WATCHDOG_MS = 1_000;

/** Run `fn` inside a serialized document view transition. Resolves when the
 *  transition (or, when the API is absent or the document is hidden, the
 *  direct call) finishes. */
export function viewTransition(fn: () => void | Promise<void>): Promise<void> {
  const run = async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime feature detection
    if (!document.startViewTransition || document.hidden) {
      // Match the API-present path: a cosmetic DOM update that throws/rejects
      // must not reject the caller. Both paths resolve.
      try {
        await fn();
      } catch {
        // swallow — the direct run "completes" like a skipped transition.
      }
      return;
    }
    const transition = document.startViewTransition(fn);
    transition.ready.catch(() => undefined);
    const watchdog = setTimeout(() => {
      // Safe on a transition in any state: skipping after finish is a no-op.
      transition.skipTransition();
    }, SKIP_WATCHDOG_MS);
    try {
      await transition.finished.catch(() => undefined);
    } finally {
      clearTimeout(watchdog);
    }
  };
  // Chain off the previous call regardless of how it settled, then reset the
  // shared tail to a swallowed promise so one failure can't wedge the queue.
  const result = pending.then(run, run);
  pending = result.catch(() => undefined);
  return result;
}
