// focus-trap.ts — Keep Tab / Shift+Tab cycling within a container, per the
// WAI-ARIA dialog pattern. Headless: no DOM is created, only focus is managed.
//
//   const release = trapFocus(dialogEl, { returnFocus: true });
//   // ... interaction ...
//   release(); // restores focus to the previously-focused element

/** The standard focusable-element selector. Elements are additionally filtered
 *  to those that are visible (`offsetParent !== null`) at trap time. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null,
    );

  const initial = opts?.initialFocus ?? getFocusable()[0] ?? null;
  initial?.focus();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") {
      return;
    }
    const focusable = getFocusable();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey) {
      // Wrap to the end when focus is at (or has escaped before) the first item.
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener("keydown", onKeyDown);

  return (): void => {
    container.removeEventListener("keydown", onKeyDown);
    const returnFocus = opts?.returnFocus ?? true;
    if (returnFocus === false) {
      return;
    }
    const target = returnFocus instanceof HTMLElement ? returnFocus : previousFocus;
    target?.focus();
  };
}
