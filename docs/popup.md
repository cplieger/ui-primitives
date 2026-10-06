# popup

`@cplieger/ui-primitives/popup`

The open and light-dismiss behavior of [popover](popover.md), without placement. Use it for a panel that sits in the page flow or that you position yourself. Examples are an expandable card, an inline tray or a bottom sheet. It gives you outside-click dismissal, isolated Escape and single-open groups. It also sets ARIA on the trigger, offers opt-in focus, and adds open and close state classes.

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

- `createPopup(panel, opts?)` returns `{ show(); hide(); toggle(); readonly isOpen; readonly el; setOptions(patch); dispose() }`.
- `PopupOptions` = `{ trigger?: HTMLElement | null; closeOnOutside?; closeOnEscape?; isolateEscape?; group?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }`.
- `closePopupGroup(group)` closes every open popup in a group.

The `trigger` gets `aria-expanded` and `aria-haspopup`. A click on the trigger does not count as an outside click, so its own click handler can toggle the panel. The controller does not wire activation on the trigger. That stays with the caller. With `group`, opening one popup closes any open popup with the same group name. `isolateEscape`, `true` by default, stops the Escape it consumed from propagating, as popover does. Turn it off when an app-level Escape handler must still see the key. `setOptions` merges a patch the same way as [popover](popover.md)'s.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `.uip-popup` | panel wired by `createPopup`, with no placement and only `[hidden]` styled | |
| `.uip-popup.is-open` / `.uip-popup.is-leaving` | lifecycle state classes, with all motion left to the app | |

All motion is yours. On open, the library adds `uip-popup` and `is-open` after the resting state is committed. A CSS transition from that state then plays, and an animation on `is-open` works too. On close, it swaps `is-open` for `is-leaving`, then sets `[hidden]` when the panel's first `transitionend` fires. When no transition runs, a 400ms ceiling sets it instead, so a close transition skinned longer than 400ms is cut short. The base stylesheet ships only the `[hidden]` display rule, with no default motion and no custom properties.

A `hide()` in the same task as `show()` cannot animate. The open transition starts at zero progress. Reversing it targets the value it is already at, so CSS starts nothing and `[hidden]` waits for the ceiling. Hide from a later task, such as a click handler or a timer, and both directions animate.

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

- On `show()`, a disconnected panel is placed into the trigger's nearest open `<dialog>` ancestor, else the topmost open dialog, else `<body>`. A panel you connected yourself, the usual in-flow case, stays where you put it.
