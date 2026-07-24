# roving-focus

`@cplieger/ui-primitives/roving-focus`

WAI-ARIA roving-tabindex keyboard navigation for composite widgets: menus,
listboxes, pickers, toolbars; any container whose items should be **one** Tab
stop navigated with the arrow keys.

## Usage

```ts
import { rovingFocus } from "@cplieger/ui-primitives/roving-focus";

const nav = rovingFocus(menuEl, "[role=menuitem]");
nav.focusFirst(); // e.g. when the menu opens
nav.refresh(); // after a bulk re-render
nav.dispose();
```

This is the keyboard half of the WAI-ARIA **menu** pattern; pair it with
[popover](popover.md) so a `role="menu"` panel keeps its interaction promise:

```ts
const pop = createPopover(button, panel, { haspopup: "menu" });
const nav = rovingFocus(panel, "[role=menuitem]");
button.addEventListener("click", () => {
  pop.toggle();
  if (pop.isOpen) nav.focusFirst();
});
```

## API

- `rovingFocus(container, selector, opts?)` → `{ focusFirst(); refresh(); dispose() }`.
- `RovingFocusOptions` = `{ orientation?: "vertical" | "horizontal"; wrap?; homeEnd?; activate? }` (defaults: vertical, wrap, Home/End on, Enter/Space activate).

## Notes

- Headless: it manages only `tabindex` and focus.
- The matching items are queried **live** on every keystroke, so rows added or removed after wiring (a filtered list, a reconciled menu) navigate correctly; call `refresh()` after a bulk re-render to restore the single-Tab-stop invariant on brand-new items.
- Focus moving into any item (pointer or keyboard) rolls the Tab stop onto it.
