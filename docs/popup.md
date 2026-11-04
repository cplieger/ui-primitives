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

- `createPopup(panel, opts?)` returns `{ show(); hide(); toggle(); readonly isOpen; readonly el; setOptions(patch); dispose() }`. `dispose()` hides the panel at once, with no fade and no `onClose`, removes the listeners and leaves nothing scheduled. After it, `show()`, `toggle()` and `setOptions()` do nothing, also from inside your `onClose`. A `dispose()` from code the controller is calling, such as the `onClose` of a group peer that `show()` closes or a focus handler, ends the controller at once: every method refuses and `isOpen` reads `false`. Its teardown completes as soon as your code returns, and the `show()` stops there: no `onOpen`, no listeners.
- A controller made under a `@cplieger/reactive` owner, such as `createRoot`, a `bindList` row or an effect created under one, ends with that owner as `dispose()` would, and a later `dispose()` does nothing. Setup and every method run untracked, never under that owner. When the owner ends a controller, the handlers its teardown reaches run inside reactive's disposal, where creating an effect throws.
- `PopupOptions` = `{ trigger?: HTMLElement | null; closeOnOutside?; closeOnEscape?; isolateEscape?; group?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }`. `createPopup` reads each option once, at the call.
- `closePopupGroup(group)` closes every open popup in a group. When an `onClose` throws, it hides every open member first, then throws.
- Notifications report net changes. `onClose` fires only for a popup whose `onOpen` was delivered, and a change your callback undid before the controller finished applying it reports nothing.
- A method called from code the controller is calling records the new state at once, and `isOpen` reads it. The controller applies it, then notifies, as soon as your code returns.
- Errors thrown by your callbacks never interrupt the controller. It finishes the change and notifies, then throws them from the call that started the work, one as itself and several as an `AggregateError`. From an event or a timer, the browser reports them as uncaught.

The `trigger` gets `aria-expanded` and `aria-haspopup`. A click on the trigger does not count as an outside click, so its own click handler can toggle the panel. The controller does not wire activation on the trigger. That stays with the caller. With `group`, opening one popup closes any open popup with the same group name. `isolateEscape`, `true` by default, stops the Escape it consumed from propagating, as popover does. Turn it off when an app-level Escape handler must still see the key. `setOptions` merges a patch the same way as [popover](popover.md)'s. A `trigger` or `haspopup` change applies at once: the old trigger loses the ARIA and, while open, the new one gains it. A patch whose values equal the current ones changes nothing.

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
