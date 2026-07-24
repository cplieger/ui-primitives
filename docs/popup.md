# popup

`@cplieger/ui-primitives/popup`

The reveal + light-dismiss lifecycle **without placement**: the behavior half
of [popover](popover.md), exposed on its own. Reach for it when the panel is
in-flow or self-positioned (an expandable pill/card, an inline tray, a bottom
sheet) and you want the standardized dismiss behavior: outside-click, isolated
Escape, single-open groups, trigger ARIA, opt-in focus, and the enter/leave
state-class lifecycle.

## Usage

```ts
import { createPopup, closePopupGroup } from "@cplieger/ui-primitives/popup";

const popup = createPopup(cardEl, { trigger: pillEl, group: "pills" });
pillEl.addEventListener("click", () => {
  popup.toggle();
});
// Collapse every open pill when focus moves to the main input:
input.addEventListener("focus", () => {
  closePopupGroup("pills");
});
```

## API

- `createPopup(panel, opts?)` → `{ show(); hide(); toggle(); readonly isOpen; readonly el; setOptions(patch); dispose() }`.
- `PopupOptions` = `{ trigger?: HTMLElement | null; closeOnOutside?; closeOnEscape?; isolateEscape?; group?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }`.
- `closePopupGroup(group)`: close every open popup in a group.

The `trigger` gets `aria-expanded` / `aria-haspopup` and is exempt from
outside-click dismissal (so its own click handler can toggle); the controller
does **not** wire activation on it, the caller owns that. `group` gives
single-open coordination: opening one popup closes any open peer with the same
group name. `isolateEscape` (default `true`) stops the consumed Escape's
propagation, popover-style; disable it when an app-level Escape coordinator
must still observe the key. `setOptions` is the same merge-patch as
[popover](popover.md)'s.

## CSS

| Property / class                               | Description                                                                      | Default |
| ---------------------------------------------- | -------------------------------------------------------------------------------- | ------- |
| `.uip-popup`                                   | panel wired by `createPopup` (no placement; only `[hidden]` is styled)           |         |
| `.uip-popup.is-open` / `.uip-popup.is-leaving` | lifecycle state classes (all motion is the app's; the base ships none for popup) |         |

**Motion is entirely yours.** The library adds `uip-popup` + `is-open` on
reveal (after a forced reflow, so a CSS _transition_ from the resting state
plays; an _animation_ on `is-open` works too) and swaps `is-open` →
`is-leaving` on conceal, setting `[hidden]` once the panel's first
`transitionend` fires (or a 400ms fallback). The base stylesheet ships only the
`[hidden]` display rule: no default motion, no custom properties.

```css
.my-card {
  scale: 0.4;
  opacity: 0;
  transition:
    scale 200ms ease,
    opacity 200ms ease;
}
.my-card.is-open {
  scale: 1;
  opacity: 1;
}
```

## Notes

- A disconnected panel is hosted on `show()`: into the trigger's nearest open `<dialog>` ancestor, else the topmost open dialog, else `<body>`. A caller-connected panel (the usual in-flow case) stays exactly where you put it.
