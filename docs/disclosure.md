# disclosure

`@cplieger/ui-primitives/disclosure`

An animated show-and-hide region wired to a trigger, per the WAI-ARIA disclosure pattern. It wires two elements you supply and creates no DOM.

## Usage

```ts
import { createDisclosure } from "@cplieger/ui-primitives/disclosure";

const d = createDisclosure(triggerEl, regionEl, { open: false });
d.toggle();
d.open();
d.close();
d.isOpen; // boolean
```

```html
<button id="more">Details</button>
<div id="more-panel">…collapsible content…</div>
```

## API

- `createDisclosure(trigger, region, opts?)` returns `{ open(); close(); toggle(); readonly isOpen; dispose() }`. `trigger` is an `HTMLElement` or `null`, which selects region-only mode below.
- `DisclosureOptions` = `{ open?; animate?; onToggle?: (open: boolean, source: "user" | "api") => void }`. By default the region starts closed and animates. `source` is `"user"` for a trigger toggle and `"api"` for a controller call, which lets an auto-collapse state machine record that the user took over.

### Region-only mode (`trigger: null`)

No trigger is wired, so there is no `aria-expanded` and no click or keyboard handling, and only the controller changes the open state. Use it when a disclosure trigger would mis-describe the visible control. One case is a checkbox enable-toggle whose `checked` already conveys the state. Another is an app state machine that owns its own header. The region still gets the height animation and `aria-hidden` plus `inert`:

```ts
const body = createDisclosure(null, sectionBody, { open: checkbox.checked });
checkbox.addEventListener("change", () => {
  if (checkbox.checked) body.open();
  else body.close();
});
```

## CSS

| Property / class            | Description                                               | Default |
| --------------------------- | --------------------------------------------------------- | ------- |
| `--uip-disclosure-duration` | disclosure height transition                              | `200ms` |
| `--uip-disclosure-easing`   | disclosure height easing                                  | `ease`  |
| `.uip-disclosure-region`    | disclosure collapsible region (`aria-hidden` when closed) |         |

Padding, borders or margins that would still paint at height 0 belong in a rule keyed on `[aria-hidden="true"]`, or on an inner wrapper.

## Notes

- The trigger gets `aria-expanded`, which reflects the state, and `aria-controls`, which links it to the region. A trigger that is not a native `<button>` also gets `role="button"`, `tabindex="0"` and Enter and Space handling.
- A collapsed region is marked `aria-hidden` and `inert`, so its content leaves the tab order and the accessibility tree.
- The height animates between `0` and `auto`. On engines that cannot interpolate `auto`, it animates to the measured height instead. Both honor `prefers-reduced-motion`.
- A region the page is not rendering takes its target height at once, because no transition can run there. That covers `content-visibility: hidden`, a `display: none` ancestor, a closed `<details>` and a region outside the document. A skipped `content-visibility: auto` region still animates, because the next scroll can bring it back into view.
