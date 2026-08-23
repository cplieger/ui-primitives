// transition.ts — the ONE way this library changes an element's state and lets
// the change animate.
//
// A CSS state transition is a sequence, not two steps: commit the state the
// change starts FROM, apply the change, then own the "it finished" callback
// until something supersedes it. Every part of that is easy to get wrong on its
// own. The start state has to be flushed to the engine or the browser coalesces
// both writes into one frame and no transition runs at all — and the flush is a
// layout READ whose only purpose is its discarded side effect, so a caller has
// to know it exists and where it goes. The end callback may never arrive
// (no CSS transition, reduced motion, an interrupted animation), so it needs a
// ceiling. And a rapid re-toggle must not let a stale callback finalize a state
// that has already moved on.
//
// So the sequence is the unit, and `runTransition` is it. Callers write the
// start state normally, then call: the commit happens at the call, which is the
// one place it cannot be misplaced, because nobody writes it.

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
 * Run one CSS transition on `el` to completion.
 *
 * The state written before this call is committed to the engine, then
 * `spec.change` writes the state to animate to, so the change transitions
 * instead of collapsing into a single frame. `spec.settled`, when given, runs
 * once on the first `transitionend` whose `target` is `el` (a descendant's
 * transition is not the element's), or after the fallback ceiling.
 *
 * Supersession is per element: this call drops any settle already pending on
 * `el` without running it, so a caller never has to ask whether it still owns
 * the element's transition. `cancelTransition(el)` does the same without
 * starting a new transition.
 */
export function runTransition(el: HTMLElement, spec: TransitionSpec): void {
  // A settle pending on this element belongs to the state this call replaces.
  cancelTransition(el);

  // Commit the caller's start state. Reading a layout property is what forces
  // the engine to resolve the style written so far; without it the change below
  // lands in the same frame and there is nothing to transition from.
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
  // No "already ran" latch: detaching the listener is what makes this run once.
  // A single change can end several transitions (the shipped toast animates
  // opacity AND transform, so two events arrive in separate dispatches), and by
  // the second the listener is gone. Deleting the detach makes `settled` run
  // twice, which transition.motion.test.ts pins.
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
