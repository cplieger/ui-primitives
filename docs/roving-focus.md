# roving-focus

`@cplieger/ui-primitives/roving-focus`

WAI-ARIA roving-tabindex keyboard navigation for composite widgets such as menus, listboxes, pickers and toolbars. Use it for any container whose items should be one Tab stop, navigated with the arrow keys.

## Usage

```ts
import { rovingFocus } from "@cplieger/ui-primitives/roving-focus";

const nav = rovingFocus(menuEl, "[role=menuitem]");
nav.focusFirst(); // e.g. when the menu opens
nav.refresh(); // after a bulk re-render
nav.dispose();
```

This is the keyboard half of the WAI-ARIA menu pattern. Pair it with [popover](popover.md) so a `role="menu"` panel gets the keyboard behavior that role promises:

```ts
const pop = createPopover(button, panel, { haspopup: "menu" });
const nav = rovingFocus(panel, "[role=menuitem]");
button.addEventListener("click", () => {
  pop.toggle();
  if (pop.isOpen) nav.focusFirst();
});
```

## API

- `rovingFocus(container, selector, opts?)` returns `{ focusFirst(); refresh(); dispose() }`.
- `RovingFocusOptions` = `{ orientation?: "vertical" | "horizontal"; wrap?; homeEnd?; activate? }`. By default navigation is vertical and wraps, Home and End work, and Enter and Space activate an item.

## Notes

- It manages only `tabindex` and focus.
- The matching items are queried on every keystroke, so rows added or removed after wiring, such as a filtered list, navigate correctly. Call `refresh()` after a bulk re-render to give brand-new items a single Tab stop again.
- Call `rovingFocus` once per container. Calling it again on every render stacks keydown listeners, so one arrow press moves several steps.
- Focus moving into any item, by pointer or keyboard, moves the Tab stop onto it.
