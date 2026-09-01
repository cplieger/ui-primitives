// transition.ts — the ONE way this library changes an element's state and lets
// the change animate. A CSS transition needs its start state flushed to the
// engine before the change, or the browser coalesces both writes into one
// frame and nothing animates; `runTransition` does that flush so callers never
// have to.

/**
 * Ceiling (ms) on how long a settle waits for `transitionend` before assuming
 * no transition ran at all. Not an estimate of any duration: every duration in
 * this library is the app's, set through a `--uip-*` custom property, so the
 * library cannot know the real one. One value for every primitive — a leave
 * transition skinned longer than this is truncated.
 */
const SETTLE_FALLBACK_MS = 400;

export interface TransitionSpec {
  /** Writes the state to animate TO. Whatever the caller wrote BEFORE calling
   *  `runTransition` is the state it animates FROM. */
  change: () => void;
  /** Runs exactly once when the transition on the element ends — or after the
   *  fallback ceiling if none ever starts. Omit it when there is nothing to
   *  finalize; then nothing is armed and nothing needs cancelling. */
  settled?: () => void;
}

/** Pending settles, keyed by element: the cancel that detaches one. A WeakMap
 *  so a settle armed against a node that is then dropped retains nothing. */
const inFlight = new WeakMap<HTMLElement, () => void>();

/**
 * Drop the settle pending on `el` WITHOUT running it. For a caller that is
 * taking the element somewhere the pending callback must not follow: a reopen
 * during a fade, a dispose mid-animation, a node about to be removed. A no-op
 * when nothing is pending.
 */
export function cancelTransition(el: HTMLElement): void {
  const cancel = inFlight.get(el);
  if (cancel !== undefined) {
    inFlight.delete(el);
    cancel();
  }
}

/**
 * Run one CSS transition on `el` to completion. `spec.settled` runs once on
 * the first `transitionend` targeting `el` directly, or after the fallback
 * ceiling. Drops any settle already pending on `el` first, so a caller never
 * has to ask whether it still owns the element's transition.
 */
export function runTransition(el: HTMLElement, spec: TransitionSpec): void {
  cancelTransition(el);

  // Reading a layout property forces the engine to resolve the style written
  // so far; without it the change below lands in the same frame.
  el.getBoundingClientRect();

  spec.change();

  const settled = spec.settled;
  if (settled === undefined) {
    return;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const detach = (): void => {
    el.removeEventListener("transitionend", onEnd);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  // Detaching the listener (not a latch) is what makes this run once: a
  // single change can end several transitions (opacity + transform both
  // animating), and by the second event the listener is already gone.
  const finish = (): void => {
    inFlight.delete(el);
    detach();
    settled();
  };
  const onEnd = (e: TransitionEvent): void => {
    if (e.target === el) {
      finish();
    }
  };

  el.addEventListener("transitionend", onEnd);
  timer = setTimeout(finish, SETTLE_FALLBACK_MS);
  inFlight.set(el, detach);
}
