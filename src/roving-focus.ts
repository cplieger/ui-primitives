// roving-focus.ts — WAI-ARIA roving-tabindex keyboard navigation for
// composite widgets (menus, listboxes, pickers, toolbars): one Tab stop,
// arrow keys move focus. Items are queried live each keystroke; call
// `refresh()` after a bulk re-render to restore the single-Tab-stop invariant.
//
// Pairs with popover for the WAI-ARIA menu pattern:
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
    const target = active !== null && list.includes(active) ? active : (list[0] ?? null);
    for (const item of list) {
      item.setAttribute("tabindex", item === target ? "0" : "-1");
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
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
          // Suppress the native Enter/Space activation and fire exactly one click.
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
