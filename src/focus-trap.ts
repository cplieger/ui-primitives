/**
 * focus-trap.ts — Keep Tab / Shift+Tab cycling within a container, per the
 * WAI-ARIA dialog pattern. Headless: no DOM is created, only focus is managed.
 *
 * ```ts
 * const release = trapFocus(dialogEl, { returnFocus: true });
 * // ... interaction ...
 * release(); // restores focus to the previously-focused element
 * ```
 *
 * @module
 */

import { untracked } from "@cplieger/reactive";

import { createDriver, ownedBinding } from "./owner.js";

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

/** The two focus hand-offs a trap owns: which element takes focus on entry,
 *  and where focus lands when the release function runs. Both optional — the
 *  defaults focus the first focusable descendant and restore the element that
 *  was focused when the trap was installed. */
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
  const o = untracked(() => ({
    initialFocus: opts?.initialFocus ?? null,
    returnFocus: opts?.returnFocus ?? true,
  }));

  const getFocusable = (): HTMLElement[] =>
    [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);

  return ownedBinding((binding) => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let listening = false;
    let entered = false;

    /** Where Tab must go instead of the browser's default, or null to leave it. */
    const redirect = (e: KeyboardEvent): HTMLElement | null => {
      const focusable = getFocusable();
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        // No focusable targets: pin focus to the container, never let Tab out.
        return container;
      }
      if (!inside) {
        // Focus escaped, or was never inside: pull it back to the edge.
        return e.shiftKey ? last : first;
      }
      if (e.shiftKey ? active === first : active === last) {
        return e.shiftKey ? last : first;
      }
      return null;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Tab") {
        return;
      }
      driver.act((fx) => {
        const target = redirect(e);
        if (target !== null) {
          e.preventDefault();
          fx.focus(target);
        }
      });
    };
    // Capture phase on `document` (not `container`): focus that is currently
    // outside the container still routes through here so it can be redirected in.
    const listen = (on: boolean): void => {
      if (listening !== on) {
        listening = on;
        if (on) {
          document.addEventListener("keydown", onKey, true);
        } else {
          document.removeEventListener("keydown", onKey, true);
        }
      }
    };

    const driver = createDriver<null>({
      initial: null,
      realize(fx) {
        listen(true);
        if (entered) {
          return;
        }
        entered = true;
        const focusable = getFocusable();
        if (focusable.length === 0) {
          // Fail closed: with nothing focusable, the container itself holds
          // focus so Tab can't escape to the page behind it.
          // The attribute: a div's tabIndex property already reads -1 without it.
          fx.setAttr(container, "tabindex", "-1");
          fx.focus(container);
          return;
        }
        // A detached initialFocus (an opener chained from a removed modal) is
        // a safe no-op, not a throw.
        const target = o.initialFocus ?? focusable[0];
        if (target?.isConnected === true) {
          fx.focus(target);
        }
      },
      terminal(fx) {
        listen(false);
        const target =
          o.returnFocus === true ? previousFocus : o.returnFocus === false ? null : o.returnFocus;
        // Focusing a detached node throws in some engines and no-ops in others.
        if (target?.isConnected === true) {
          fx.focus(target);
        }
      },
    });

    return {
      controller: binding.dispose,
      start: () => {
        driver.flush();
      },
      release: () => {
        driver.release();
      },
    };
  });
}
