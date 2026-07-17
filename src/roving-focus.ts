// roving-focus.ts — WAI-ARIA roving-tabindex keyboard navigation for
// composite widgets: menus, listboxes, pickers, toolbars, any container whose
// items should be one Tab stop navigated with the arrow keys.
//
// Headless: it wires listeners on the container you supply and manages only
// `tabindex` and focus. Items are queried live on every keystroke, so rows
// added or removed after wiring (a filtered list, a reconciled menu) are
// picked up automatically; call `refresh()` after a bulk re-render to restore
// the single-Tab-stop invariant on brand-new items.
//
// This is the keyboard half of the WAI-ARIA menu pattern — pair it with
// popover (`role="menu"` panel, `role="menuitem"` items) so the announced
// role keeps its interaction promise:
//
//   const pop = createPopover(button, panel, { haspopup: "menu" });
//   const nav = rovingFocus(panel, "[role=menuitem]");
//   // on open: nav.focusFirst();

export interface RovingFocusOptions {
  /** Which arrow pair moves focus: `"vertical"` (Up/Down, default) or
   *  `"horizontal"` (Left/Right). */
  orientation?: "vertical" | "horizontal";
  /** Wrap from the last item to the first and vice versa. Default `true`. */
  wrap?: boolean;
  /** Home/End jump to the first/last item. Default `true`. */
  homeEnd?: boolean;
  /** Enter and Space activate (click) the focused item. Default `true`.
   *  Disable when items are inputs or handle their own keys. */
  activate?: boolean;
}

export interface RovingFocusController {
  /** Focus the first item (e.g. when a menu opens). */
  focusFirst(): void;
  /** Re-apply the roving tabindex after a bulk re-render: the current item
   *  (focused, or the previous Tab stop if still present) keeps `tabindex=0`,
   *  everything else gets `-1`. */
  refresh(): void;
  /** Remove the listeners. Tabindex attributes are left as-is. */
  dispose(): void;
}

/** Wire roving-tabindex arrow-key navigation over `container`'s descendants
 *  matching `selector`. Returns a controller with `focusFirst` / `refresh` /
 *  `dispose`. */
export function rovingFocus(
  container: HTMLElement,
  selector: string,
  opts?: RovingFocusOptions,
): RovingFocusController {
  const isVertical = (opts?.orientation ?? "vertical") !== "horizontal";
  const wrap = opts?.wrap ?? true;
  const homeEnd = opts?.homeEnd ?? true;
  const activate = opts?.activate ?? true;
  const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
  const nextKey = isVertical ? "ArrowDown" : "ArrowRight";

  const items = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(selector)];

  const applyTabindex = (list: HTMLElement[], active: HTMLElement | null): void => {
    // Exactly one Tab stop: the active item, or the first when none is.
    const target = active !== null && list.includes(active) ? active : (list[0] ?? null);
    for (const item of list) {
      item.setAttribute("tabindex", item === target ? "0" : "-1");
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    // Query live so dynamically added/removed items are always current.
    const list = items();
    if (list.length === 0) {
      return;
    }
    const active = document.activeElement;
    const current = active instanceof HTMLElement ? list.indexOf(active) : -1;

    let next: number;
    switch (e.key) {
      case nextKey:
        next = current < list.length - 1 ? current + 1 : wrap ? 0 : list.length - 1;
        break;
      case prevKey:
        next = current > 0 ? current - 1 : wrap ? list.length - 1 : 0;
        break;
      case "Home":
        if (!homeEnd) {
          return;
        }
        next = 0;
        break;
      case "End":
        if (!homeEnd) {
          return;
        }
        next = list.length - 1;
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        if (activate && current !== -1) {
          // Suppress the native activation (a button's Enter/Space default is
          // already a click) and fire exactly one.
          e.preventDefault();
          list[current]?.click();
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    list[next]?.focus();
  };

  // Focus moving into any item (pointer, keyboard, or programmatic) rolls the
  // single Tab stop onto it.
  const onFocusIn = (e: FocusEvent): void => {
    const target = e.target;
    if (!(target instanceof HTMLElement) || !target.matches(selector)) {
      return;
    }
    applyTabindex(items(), target);
  };

  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("focusin", onFocusIn);
  applyTabindex(items(), null);

  return {
    focusFirst(): void {
      items()[0]?.focus();
    },
    refresh(): void {
      const list = items();
      const active = document.activeElement;
      const current =
        active instanceof HTMLElement && list.includes(active)
          ? active
          : (list.find((i) => i.getAttribute("tabindex") === "0") ?? null);
      applyTabindex(list, current);
    },
    dispose(): void {
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("focusin", onFocusIn);
    },
  };
}
