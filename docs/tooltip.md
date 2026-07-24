# tooltip

`@cplieger/ui-primitives/tooltip`

Delegated, attribute-driven tooltips: one controller handles every trigger on
the page through a `data-uip-tooltip` attribute.

## Usage

```ts
import { initTooltips } from "@cplieger/ui-primitives/tooltip";

initTooltips(); // idempotent; installs one delegated controller
```

```html
<button data-uip-tooltip="Copy to clipboard">Copy</button>
<button data-uip-tooltip="Line one&#10;Line two">Multi</button>
```

## API

- `initTooltips(opts?)`: install once. `TooltipOptions` = `{ attribute?; delayCold?; delayWarm?; cooldown? }` (defaults `data-uip-tooltip`, 1000ms, 0ms, 500ms).

## CSS

| Property / class              | Description                  | Default |
| ----------------------------- | ---------------------------- | ------- |
| `--uip-z-tooltip`             | tooltip z-index              | `10000` |
| `--uip-tooltip-fade-duration` | tooltip fade                 | `100ms` |
| `--uip-tooltip-fade-easing`   | tooltip fade easing          | `ease`  |
| `.uip-tooltip`                | a tooltip (`role="tooltip"`) |         |
| `.uip-tooltip.is-leaving`     | fade-out state class         |         |

## Notes

- One delegated controller handles every trigger. The first tooltip of a "cold" group waits `delayCold`; peers show instantly while the group is warm.
- The trigger text is appended to the anchor's `aria-describedby` (any token the app already set is preserved); `\n` in the value splits into `<br>`-separated lines.
- Escape, scroll, and window blur hide it; on scroll a tooltip vanishes like a native `title`, where [popover](popover.md), an opened surface, tracks and repositions instead.
- Positioned `fixed` above the anchor (flips below when there is no room), clamped to the viewport.
- When the anchor sits inside an open modal `<dialog>`, the tooltip is appended into that dialog so it stacks over the modal.
