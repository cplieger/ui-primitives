// disclosure.ts — Animated collapsible (show/hide) region wired to a trigger,
// per the WAI-ARIA disclosure pattern. Headless: it wires two elements you
// supply — no DOM is created. The trigger gets button semantics
// (`aria-expanded`, Enter/Space when it isn't a native <button>) and is linked
// to the region via `aria-controls`; the region toggles `aria-hidden`.
//
// Height animates 0 <-> auto. Modern engines interpolate the `auto` keyword
// directly (`interpolate-size: allow-keywords`, set on the region in the base
// stylesheet); engines without it fall back to a measured `scrollHeight` px
// target. Both honor `prefers-reduced-motion` by skipping the tween.

/** Fallback (ms) if `transitionend` never fires on the region. */
const OPEN_FALLBACK_MS = 400;

export interface DisclosureOptions {
  /** Initial open state. Default `false`. */
  open?: boolean;
  /** Animate height changes. Default `true`. Ignored under reduced motion. */
  animate?: boolean;
  /** Invoked whenever the open state changes via the controller or the trigger. */
  onToggle?: (open: boolean) => void;
}

export interface DisclosureController {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

let idSeq = 0;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Whether the engine can transition `height` to/from the `auto` keyword. */
function supportsInterpolateSize(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("interpolate-size", "allow-keywords")
  );
}

/** Read a layout property to flush a pending style change (force reflow) so the
 *  next change starts a transition rather than collapsing into one frame. */
function forceReflow(node: HTMLElement): void {
  node.getBoundingClientRect();
}

/** Wire `trigger` (a button, or any element given button semantics) to `region`
 *  as an animated disclosure. */
export function createDisclosure(
  trigger: HTMLElement,
  region: HTMLElement,
  opts?: DisclosureOptions,
): DisclosureController {
  const animateDefault = opts?.animate ?? true;
  const onToggle = opts?.onToggle;

  region.classList.add("uip-disclosure-region");
  if (region.id === "") {
    region.id = `uip-disclosure-${(++idSeq).toString()}`;
  }
  trigger.setAttribute("aria-controls", region.id);

  const isNativeButton = trigger instanceof HTMLButtonElement;
  if (!isNativeButton) {
    if (!trigger.hasAttribute("role")) {
      trigger.setAttribute("role", "button");
    }
    if (!trigger.hasAttribute("tabindex")) {
      trigger.setAttribute("tabindex", "0");
    }
  }

  let open = opts?.open ?? false;
  let cancelPending: (() => void) | null = null;

  const clearPending = (): void => {
    if (cancelPending !== null) {
      cancelPending();
      cancelPending = null;
    }
  };

  // Run `cb` after the region's height transition (or a fallback), cancelling
  // any prior pending settle so rapid toggles don't clash.
  const afterTransition = (cb: () => void): void => {
    clearPending();
    let done = false;
    const run = (): void => {
      if (done) {
        return;
      }
      done = true;
      region.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      cancelPending = null;
      cb();
    };
    const onEnd = (e: TransitionEvent): void => {
      if (e.target === region) {
        run();
      }
    };
    region.addEventListener("transitionend", onEnd);
    const timer = setTimeout(run, OPEN_FALLBACK_MS);
    cancelPending = (): void => {
      if (done) {
        return;
      }
      done = true;
      region.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
    };
  };

  const reflectAria = (): void => {
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    region.setAttribute("aria-hidden", open ? "false" : "true");
  };

  const applyHeight = (targetOpen: boolean, animate: boolean): void => {
    clearPending();
    if (!animate || prefersReducedMotion()) {
      // No tween: expanded is auto (cleared inline height), collapsed is 0.
      region.style.height = targetOpen ? "" : "0px";
      return;
    }
    if (targetOpen) {
      region.style.height = "0px";
      forceReflow(region);
      region.style.height = supportsInterpolateSize() ? "auto" : `${region.scrollHeight}px`;
      afterTransition(() => {
        // Settle to auto so the content can reflow/grow later — but only if it
        // is still open (a fast close may have won).
        if (open) {
          region.style.height = "";
        }
      });
    } else {
      // Collapse from a concrete height (auto isn't an animatable start on the
      // fallback path) down to 0, and stay there.
      region.style.height = `${region.scrollHeight}px`;
      forceReflow(region);
      region.style.height = "0px";
    }
  };

  const set = (next: boolean, animate: boolean): void => {
    if (next === open) {
      return;
    }
    open = next;
    reflectAria();
    applyHeight(next, animate);
    onToggle?.(next);
  };

  // Initial state, applied without animation or an onToggle callback.
  reflectAria();
  applyHeight(open, false);

  const onClick = (): void => {
    set(!open, animateDefault);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      // Space would scroll the page; Enter/Space both activate a button.
      e.preventDefault();
      set(!open, animateDefault);
    }
  };
  trigger.addEventListener("click", onClick);
  if (!isNativeButton) {
    trigger.addEventListener("keydown", onKeyDown);
  }

  return {
    get isOpen(): boolean {
      return open;
    },
    open(): void {
      set(true, animateDefault);
    },
    close(): void {
      set(false, animateDefault);
    },
    toggle(): void {
      set(!open, animateDefault);
    },
    dispose(): void {
      clearPending();
      trigger.removeEventListener("click", onClick);
      if (!isNativeButton) {
        trigger.removeEventListener("keydown", onKeyDown);
      }
    },
  };
}
