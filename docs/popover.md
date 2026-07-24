# popover

`@cplieger/ui-primitives/popover`

An anchored floating panel with a real placement engine. It's the interactive
superset of [tooltip](tooltip.md) and the substrate a menu / listbox / picker
sits on; reach for it for dropdowns, filter panels, and pickers.

## Usage

```ts
import { createPopover, placeAnchored } from "@cplieger/ui-primitives/popover";

// (a) The controller: for an interactive popover you open and dismiss:
const pop = createPopover(anchorButton, panelEl, {
  placement: "bottom",
  align: "start",
  matchAnchorWidth: 220, // min-width = max(anchorWidth, 220)
});
anchorButton.addEventListener("click", () => pop.toggle());
// Load content async, then re-measure + re-clamp:
async function openFiltered() {
  pop.show();
  panelEl.replaceChildren(await loadRows());
  pop.reposition();
}

// (b) The pure positioner: position any position:fixed panel yourself:
placeAnchored(panelEl, anchorEl, { placement: "top", align: "center", flip: true });
```

## API

Two exports, split by responsibility:

- `placeAnchored(panel, anchor, opts?)`: the **pure positioner**. It measures
  the anchor and the panel, then writes `panel.style.left` / `top` (and
  `position: fixed`). Idempotent: safe to call on every scroll / resize or after
  the panel's content changes size. `anchor` is a `PopoverAnchor`, an element or
  a virtual rect source (see _Anchor against a coordinate_ below).
- `createPopover(anchor, panel, opts?)` → `PopoverController`: the **controller**
  that reveals + positions the caller's panel, tracks the anchor, and dismisses
  on outside-click / Escape. `{ show(); hide(); toggle(); reposition(); readonly isOpen; readonly el; setOptions(patch); dispose() }`.
  `anchor` is a `PopoverAnchor` (element or virtual). The controller is built on
  the [popup](popup.md) primitive, so it also accepts popup's `group` and
  `isolateEscape` options.

`PlacementOptions` (shared by both):

| Option                                               | Description                                                                                                                                                                                                                                                                                                                                       | Default               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `placement?: "top" \| "bottom" \| "left" \| "right"` | side of the anchor                                                                                                                                                                                                                                                                                                                                | `"bottom"`            |
| `align?: "start" \| "center" \| "end"`               | cross-axis edge alignment                                                                                                                                                                                                                                                                                                                         | `"start"`             |
| `offset?: number`                                    | main-axis gap in px                                                                                                                                                                                                                                                                                                                               | `4`                   |
| `flip?: boolean`                                     | flip to the opposite side when the chosen side would overflow and the opposite has more room                                                                                                                                                                                                                                                      | `true`                |
| `clamp?: boolean`                                    | clamp the cross-axis coordinate into the viewport                                                                                                                                                                                                                                                                                                 | `true`                |
| `matchAnchorWidth?: boolean \| number`               | set the panel's `min-width` to the anchor width (`true`) or to `max(anchorWidth, n)` (a number); ignored when `stretch: "viewport"` is set                                                                                                                                                                                                        | `false`               |
| `margin?: number`                                    | viewport edge margin used by flip + clamp (and, in `stretch: "viewport"` mode, the inline inset from each viewport edge) in px                                                                                                                                                                                                                    | `8`                   |
| `stretch?: "viewport"`                               | **full-bleed / edge-pinned mode**: the panel spans the viewport's inline axis (pinned to both inline edges, respecting `margin`) instead of being content-sized; the main axis stays anchored to the trigger and still flips; top/bottom placement only; `align`, cross-axis `clamp`, and `matchAnchorWidth` don't apply (see _Full-bleed_ below) | unset (content-sized) |

`PopoverOptions extends PlacementOptions` adds `{ closeOnOutside?; closeOnEscape?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }` (dismissal defaults `true`; `haspopup` sets the anchor's `aria-haspopup` value: `true` (default), `"menu"`, `"listbox"`, `"tree"`, `"grid"`, or `"dialog"`; ignored for a virtual/point anchor).

`setOptions(patch)` is a **merge-patch** over the live options: keys present in
the patch override the current value (an explicit `undefined` clears the option
back to its default) and absent keys are unchanged. Placement patches re-place
an open panel immediately; dismissal-flag patches re-arm the listeners; the
anchor is constructor-bound and cannot be patched.

### Anchor against a coordinate, not just an element

Both `placeAnchored` and `createPopover` take a `PopoverAnchor`: a real
`HTMLElement` or a `VirtualAnchor`, any object exposing
`getBoundingClientRect()`. `pointAnchor(x, y)` builds a zero-size virtual
anchor at a viewport coordinate, which is what makes a right-click context menu
expressible:

```ts
import { createPopover, pointAnchor } from "@cplieger/ui-primitives/popover";

el.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const pop = createPopover(pointAnchor(e.clientX, e.clientY), menuPanel, {
    placement: "bottom",
    align: "start",
  });
  pop.show();
});
```

With a virtual / point anchor there is no trigger element, so **no ARIA is set
on any element** (an `HTMLElement` anchor still gets `aria-expanded` /
`aria-haspopup`), and outside-click dismissal closes on **any** click outside
the panel, including where the right-click happened. `pointAnchor` takes a
fixed point; for a moving point, build a new `pointAnchor` and call
`reposition()` / `placeAnchored()` again.

### Focus is opt-in; by default the caller owns it

Pass `initialFocus` (a connected element) to focus it right after the popover
opens, and `returnFocus` to restore focus on close: `true` refocuses whatever
was focused when the popover opened, or pass an element to focus that element
instead. Omit both and the controller never touches focus:

```ts
const filter = panelEl.querySelector("input")!;
const pop = createPopover(anchorButton, panelEl, {
  initialFocus: filter, // focus the filter when the panel opens
  returnFocus: true, // restore focus to the anchor (whatever was focused) on close
});
```

### Full-bleed (`stretch: "viewport"`)

For a mobile full-width dropdown or action sheet, pass `stretch: "viewport"`
(top/bottom placement). The panel spans the viewport's inline axis pinned to
both edges (with `margin`), while the main axis stays anchored to the trigger
and still flips. The inset is written as an **inline style**, so your skin
never needs `!important` to express it. The controller also adds an
`is-stretched` marker class you can target to skin the full-width variant
(e.g. square the top corners, drop the side borders):

```ts
// Responsive: content-sized on desktop, full-bleed under 600px, flipped on
// the LIVE controller via setOptions (no dispose-and-rebuild). An open panel
// repositions immediately; is-stretched tracks the mode.
const narrow = matchMedia("(width < 600px)");
const stretchOpts = () =>
  narrow.matches ? { stretch: "viewport" as const, margin: 0 } : { stretch: undefined, margin: 8 };
const pop = createPopover(headerButton, menuPanel, { placement: "bottom", ...stretchOpts() });
narrow.addEventListener("change", () => {
  pop.setOptions(stretchOpts());
});
```

```css
/* skin the full-bleed variant */
.uip-popover.is-stretched {
  border-radius: 0 0 8px 8px;
  border-block-start: none;
}
```

## CSS

| Property / class               | Description                                                                      | Default |
| ------------------------------ | -------------------------------------------------------------------------------- | ------- |
| `--uip-z-popover`              | popover z-index (base layer: below toast / tooltip)                              | `1100`  |
| `--uip-popover-enter-duration` | popover enter-fade animation                                                     | `100ms` |
| `--uip-popover-enter-easing`   | popover enter-fade easing                                                        | `ease`  |
| `--uip-popover-leave-duration` | popover leave-fade transition                                                    | `100ms` |
| `--uip-popover-leave-easing`   | popover leave-fade easing                                                        | `ease`  |
| `.uip-popover`                 | anchored floating panel (`position: fixed`, JS-positioned)                       |         |
| `.uip-popover.is-open`         | optional enter fade                                                              |         |
| `.uip-popover.is-leaving`      | leave fade before `[hidden]`                                                     |         |
| `.uip-popover.is-stretched`    | full-bleed skin hook: square edges / drop side borders on the full-width variant |         |

**Enter and leave animations.** Opening plays the optional, skinnable
`.uip-popover.is-open` enter fade. Closing swaps `is-open` → `is-leaving` and
keeps the panel in the DOM until its transition ends (or a fallback timeout
fires), then sets `[hidden]`, so the panel animates out instead of vanishing.
`isOpen` flips to `false` the instant you call `hide()`; a `show()` (or
`toggle()`) during the fade cancels the leave and re-reveals. Tune the fade
with `--uip-popover-leave-duration` / `--uip-popover-leave-easing`;
`prefers-reduced-motion` neutralizes it to near-zero so the lifecycle still
completes at once.

## Notes

- Flipping and clamping stay correct above the mobile on-screen keyboard (the engine reads the viewport from `window.visualViewport` when present). An open popover repositions on scroll, window resize, and `visualViewport` resize / scroll. `reposition()` is the seam for async content: load the panel's contents, then call it to re-measure and re-clamp immediately.
- Escape is **isolated**: an open popover consumes the keystroke (`stopPropagation()`), so a popover opened inside a modal doesn't also close the modal underneath. Deeper Escape coordination (e.g. nested document-level handlers) remains the caller's concern.
- The controller does **not** build the panel: you pass it in, so `dispose()` hides + unlistens but leaves your element in the DOM. It manages only `aria-expanded` / `aria-haspopup` on the anchor (both removed on `dispose()`) and forces no `role` on the panel; set `role="menu"` / `"listbox"` / `"dialog"` yourself to fit.
- `--uip-z-popover` (`1100`) orders the popover below toast (`9999`) / tooltip (`10000`) in the base layer. A modal's top layer beats any base-layer `z-index`, so DOM position, not z-index, stacks a popover over it: a **disconnected** panel opened from within a modal is hosted INTO that `<dialog>` automatically, while a **caller-connected** panel stays exactly where you put it. So when a popover opens from inside a modal, connect its panel inside that dialog (a panel connected outside would paint behind the modal and be inert).
- Like tooltip, popover positions with JS (`getBoundingClientRect` + `position: fixed`), not the native Popover API or CSS anchor positioning.
- Pair it with [roving-focus](roving-focus.md) so a `role="menu"` panel keeps its interaction promise (the keyboard half of the WAI-ARIA menu pattern).
