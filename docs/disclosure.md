# disclosure

`@cplieger/ui-primitives/disclosure`

An animated collapsible (show/hide) region wired to a trigger, per the WAI-ARIA
disclosure pattern. Headless; it wires two elements you supply and creates no
DOM.

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

- `createDisclosure(trigger, region, opts?)` → `{ open(); close(); toggle(); readonly isOpen; dispose() }`. `trigger` is an `HTMLElement` **or `null`** (region-only mode, below).
- `DisclosureOptions` = `{ open?; animate?; onToggle?: (open: boolean, source: "user" | "api") => void }` (defaults: closed, animated). `source` distinguishes a trigger toggle (`"user"`) from a controller call (`"api"`); that is the seam an auto-collapse state machine needs to latch "the user took over".

### Region-only mode (`trigger: null`)

No trigger is wired (no `aria-expanded`, no click/keyboard handling) and the
open state is driven entirely through the controller. Use it when the visible
control is something a disclosure trigger would mis-describe: a checkbox
enable-toggle whose `checked` already conveys the state, or an app state
machine that owns its own header UI. The region still gets the height
animation and `aria-hidden` + `inert`:

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

## Notes

- The trigger gets button semantics (`aria-expanded` reflecting the state, plus `role="button"` + `tabindex="0"` + Enter/Space handling when it isn't already a native `<button>`) and is linked to the region via `aria-controls`.
- The region is marked `aria-hidden` **and** `inert` when collapsed, so collapsed content leaves the tab order and the accessibility tree entirely.
- Height animates `0 ↔ auto` (with a measured-height fallback on engines that can't interpolate the `auto` keyword), honoring `prefers-reduced-motion`.
