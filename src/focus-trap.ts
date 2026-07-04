// focus-trap.ts — Keep Tab / Shift+Tab cycling within a container, per the
// WAI-ARIA dialog pattern. Headless: no DOM is created, only focus is managed.
//
//   const release = trapFocus(dialogEl, { returnFocus: true });
//   // ... interaction ...
//   release(); // restores focus to the previously-focused element

/** The standard focusable-element selector. Elements are additionally filtered
 *  to those that are rendered (see `isVisible`) at each Tab. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Is `el` laid out (and, where the engine supports it, actually visible)?
 *  Uses `getClientRects().length` rather than `offsetParent !== null` so that
 *  `position: fixed` elements — whose `offsetParent` is `null` — still count as
 *  focusable. `checkVisibility` (when present) additionally rejects elements
 *  hidden via `visibility`/`content-visibility`. */
function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) {
    return false;
  }
  return (
    typeof el.checkVisibility !== "function" || el.checkVisibility({ visibilityProperty: true })
  );
}

export interface FocusTrapOptions {
  /** Element to focus on entry. Defaults to the first focusable descendant.
   *  A `null` value is treated the same as omitting it. */
  initialFocus?: HTMLElement | null;
  /** Where focus goes on release. `true` (default) or omitted restores the
   *  previously-focused element; an `HTMLElement` focuses that element; `false`
   *  leaves focus untouched. */
  returnFocus?: boolean | HTMLElement;
}

/** Trap Tab focus within `container`. Returns a release function. */
export function trapFocus(container: HTMLElement, opts?: FocusTrapOptions): () => void {
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const getFocusable = (): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);

  const initialFocusables = getFocusable();
  if (initialFocusables.length === 0) {
    // Fail closed: with nothing focusable, the container itself holds focus so
    // Tab can't escape to the page behind it.
    container.tabIndex = -1;
    container.focus();
  } else {
    const initialFocus = opts?.initialFocus ?? null;
    if (initialFocus !== null) {
      // Only focus an explicit initialFocus target that is still in the
      // document. A detached node (e.g. a returnFocus opener chained from a
      // modal that has since been removed) is a safe no-op, not a throw.
      if (initialFocus.isConnected) {
        initialFocus.focus();
      }
    } else {
      initialFocusables[0]?.focus();
    }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") {
      return;
    }
    const focusable = getFocusable();
    const active = document.activeElement;
    const inside = active instanceof Node && container.contains(active);

    if (focusable.length === 0) {
      // No focusable targets — pin focus to the container, never let Tab out.
      e.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }

    if (!inside) {
      // Focus is outside the container (it escaped, or was never inside).
      // Pull it back to the appropriate edge.
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Capture phase on `document` (not `container`): focus that is currently
  // outside the container still routes through here so it can be redirected in.
  document.addEventListener("keydown", onKeyDown, true);

  return (): void => {
    document.removeEventListener("keydown", onKeyDown, true);
    const returnFocus = opts?.returnFocus ?? true;
    if (returnFocus === false) {
      return;
    }
    const target = returnFocus instanceof HTMLElement ? returnFocus : previousFocus;
    // Only restore focus to a target that is still in the document; focusing a
    // detached node throws in some engines and silently no-ops in others.
    if (target?.isConnected) {
      target.focus();
    }
  };
}
