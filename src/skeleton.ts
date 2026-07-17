// skeleton.ts — anti-flicker timing for a "show a skeleton, then replace it
// with content" load. Pure timing, no DOM: the caller paints the skeleton and
// the content; this owns WHEN.
//
// Two flickers are avoided:
//   - a fast load flashing the skeleton for a couple of frames (show-delay:
//     a load that settles inside the window never paints the skeleton), and
//   - a medium load showing the skeleton then yanking it away almost at once
//     (opt-in min-visible: once painted, the skeleton stays up long enough).
//
// Two consumption styles, unified:
//
//   // commit-style: the content render replaces the skeleton in place
//   const t = skeletonTiming(() => paint(out, skeleton), { minVisibleMs: 300, signal });
//   const data = await load(signal);
//   t.commit(() => paint(out, content(data)));
//
//   // teardown-style: the skeleton is its own element, removed on settle
//   const t = skeletonTiming(() => {
//     const node = makeSkeleton();
//     list.append(node);
//     return () => node.remove();
//   });
//   await load();
//   t.cancel(); // removes the skeleton if it was painted

export interface SkeletonTimingOptions {
  /** Delay before the skeleton is painted (default 150ms). A load that settles
   *  within this window never paints the skeleton at all. */
  showDelayMs?: number;
  /** Minimum time the skeleton stays up once painted (default 0 = none), so it
   *  never appears then instantly vanishes. Leave at 0 when the skeleton
   *  shares its container with the real content and must clear the instant the
   *  load completes. */
  minVisibleMs?: number;
  /** Abort signal for the underlying load. If it fires before the skeleton is
   *  painted, the skeleton is suppressed — no orphaned skeleton for a
   *  cancelled or superseded load. It does NOT retract an already-painted
   *  skeleton (settle with `commit` or `cancel` for that). */
  signal?: AbortSignal;
}

export interface SkeletonTimingController {
  /** Paint the content. Call once, after the awaited work settles. Honors
   *  show-delay (renders immediately when the skeleton was never painted) and
   *  min-visible (defers until the skeleton has been up long enough); any
   *  teardown returned by `show` runs immediately before the render.
   *
   *  The render always runs (unless `cancel()` won first) — a caller whose
   *  content is a captured, stale-sensitive result should guard its own render
   *  closure (e.g. `if (signal.aborted) return;`). */
  commit(render: () => void): void;
  /** Abandon the load: clears a pending skeleton (so it never paints), runs
   *  the `show` teardown if it was painted, and drops any pending deferred
   *  `commit` render. Idempotent; the teardown runs at most once. */
  cancel(): void;
}

/**
 * Build an anti-flicker controller. `show` paints the skeleton (deferred by
 * show-delay) and may return a teardown that removes it again; the returned
 * controller settles the load with `commit(render)` (paint content) or
 * `cancel()` (abandon).
 */
export function skeletonTiming(
  show: (() => () => void) | (() => void),
  opts?: SkeletonTimingOptions,
): SkeletonTimingController {
  const showDelayMs = opts?.showDelayMs ?? 150;
  const minVisibleMs = opts?.minVisibleMs ?? 0;

  let shownAt: number | null = null;
  let teardown: (() => void) | undefined;
  let committed = false;
  let cancelled = false;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;

  const showTimer = setTimeout(() => {
    if (opts?.signal?.aborted === true) {
      return;
    }
    shownAt = Date.now();
    // `show` either returns a teardown or nothing (a union of the two
    // callback shapes, so plain void callbacks assign cleanly).
    const result = show();
    teardown = typeof result === "function" ? result : undefined;
  }, showDelayMs);

  const runTeardown = (): void => {
    if (teardown !== undefined) {
      const t = teardown;
      teardown = undefined;
      t();
    }
  };

  return {
    commit(render: () => void): void {
      if (committed || cancelled) {
        return;
      }
      committed = true;
      clearTimeout(showTimer);
      if (shownAt === null) {
        // Skeleton never painted (fast load, or suppressed by abort) — paint
        // the content straight away.
        render();
        return;
      }
      const paint = (): void => {
        commitTimer = null;
        runTeardown();
        render();
      };
      const remaining = minVisibleMs - (Date.now() - shownAt);
      if (remaining <= 0) {
        paint();
      } else {
        commitTimer = setTimeout(paint, remaining);
      }
    },
    cancel(): void {
      if (cancelled) {
        return;
      }
      cancelled = true;
      clearTimeout(showTimer);
      if (commitTimer !== null) {
        // A commit deferred by min-visible loses to a later cancel: the render
        // must not fire into a view the caller is abandoning.
        clearTimeout(commitTimer);
        commitTimer = null;
      }
      runTeardown();
    },
  };
}
