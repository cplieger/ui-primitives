// transition.ts — shared "run after the CSS transition, or a fallback" helper.
// The overlay primitives (dialog, modal, toast, disclosure) all animate a
// state change (a leave fade, a height tween) and must run a callback once the
// transition finishes — but a missing CSS transition, reduced motion, or an
// interrupted animation means `transitionend` may never fire, so each also arms
// a fallback timeout. This centralizes that guarded "whichever fires first,
// exactly once" pattern that was copy-pasted across those modules.

/**
 * Run `cb` exactly once, on the first `transitionend` whose `target` is `el`
 * (so a descendant's transition doesn't trigger it), or after `fallbackMs` if
 * that never arrives — whichever comes first. Returns a `cancel` function that
 * detaches the listener and clears the timer WITHOUT running `cb` (for a
 * superseding action, e.g. a rapid re-toggle). Idempotent: after `cb` has run
 * or `cancel` has been called, both are no-ops.
 */
export function afterTransition(el: HTMLElement, cb: () => void, fallbackMs: number): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = (): void => {
    el.removeEventListener("transitionend", onEnd);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const run = (): void => {
    if (done) {
      return;
    }
    done = true;
    cleanup();
    cb();
  };
  const onEnd = (e: TransitionEvent): void => {
    if (e.target === el) {
      run();
    }
  };

  el.addEventListener("transitionend", onEnd);
  timer = setTimeout(run, fallbackMs);

  return (): void => {
    if (done) {
      return;
    }
    done = true;
    cleanup();
  };
}
