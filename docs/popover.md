# popover

`@cplieger/ui-primitives/popover`

An anchored floating panel with a placement engine. It is the interactive counterpart of [tooltip](tooltip.md) and the base a menu, listbox or picker sits on. Use it for dropdowns, filter panels and pickers.

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

- `placeAnchored(panel, anchor, opts?)` is the pure positioner. It measures the anchor and the panel, then writes `panel.style.left` and `top`, and `position: fixed`. It is idempotent, so you can call it on every scroll or resize, or after the panel's content changes size. `anchor` is a `PopoverAnchor`, an element or a virtual rect source, described under "Anchor against a coordinate" below.
- `createPopover(anchor, panel, opts?)` returns a `PopoverController`, which reveals and positions the caller's panel, tracks the anchor, and dismisses on an outside click or Escape. Its shape is `{ show(); hide(); toggle(); reposition(); readonly isOpen; readonly el; setOptions(patch); dispose() }`. `anchor` is a `PopoverAnchor`. The controller is built on the [popup](popup.md) primitive, so it also accepts popup's `group` and `isolateEscape` options.

`PlacementOptions`, shared by both:

| Option | Description | Default |
| --- | --- | --- |
| `placement?: "top" \| "bottom" \| "left" \| "right"` | side of the anchor | `"bottom"` |
| `align?: "start" \| "center" \| "end"` | cross-axis edge alignment | `"start"` |
| `offset?: number` | main-axis gap in px | `4` |
| `flip?: boolean` | flip to the opposite side when the chosen side would overflow and the opposite has more room | `true` |
| `clamp?: boolean` | clamp the cross-axis coordinate into the viewport | `true` |
| `matchAnchorWidth?: boolean \| number` | set `min-width` to the anchor width (`true`) or to `max(anchorWidth, n)`, ignored with `stretch: "viewport"` | `false` |
| `margin?: number` | viewport edge margin in px for flip and clamp, and the inline inset from each edge with `stretch: "viewport"` | `8` |
| `stretch?: "viewport"` | full-bleed mode: the panel spans the viewport's inline axis, top and bottom placement only, see "Full-bleed" below | unset (content-sized) |

`PopoverOptions extends PlacementOptions` and adds `{ closeOnOutside?; closeOnEscape?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }`. Both dismissal options default to `true`. `haspopup` sets the anchor's `aria-haspopup` value to `true`, the default, or to `"menu"`, `"listbox"`, `"tree"`, `"grid"` or `"dialog"`. A virtual or point anchor ignores it.

`setOptions(patch)` merges a patch into the live options. A key present in the patch overrides the current value, an explicit `undefined` resets the option to its default, and an absent key is unchanged. A placement patch re-places an open panel at once, and a dismissal patch re-arms the listeners. The anchor is fixed at construction and cannot be patched.

### Anchor against a coordinate, not just an element

Both `placeAnchored` and `createPopover` take a `PopoverAnchor`. That is a real `HTMLElement` or a `VirtualAnchor`, any object with `getBoundingClientRect()`. `pointAnchor(x, y)` builds a zero-size virtual anchor at a viewport coordinate, which is how you build a right-click context menu:

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

A virtual or point anchor has no trigger element, so no ARIA is set on any element. An `HTMLElement` anchor still gets `aria-expanded` and `aria-haspopup`. An outside click then closes the panel on any click outside it, including where the right-click happened. `pointAnchor` takes a fixed point. For a moving point, build a new `pointAnchor` and call `reposition()` or `placeAnchored()` again.

### Focus is opt-in, and by default the caller owns it

Pass `initialFocus`, a connected element, to focus it right after the popover opens. Pass `returnFocus` to restore focus on close: `true` refocuses whatever was focused when the popover opened, and an element focuses that element instead. Omit both and the controller never touches focus:

```ts
const filter = panelEl.querySelector("input")!;
const pop = createPopover(anchorButton, panelEl, {
  initialFocus: filter, // focus the filter when the panel opens
  returnFocus: true, // restore focus to the anchor (whatever was focused) on close
});
```

### Full-bleed (`stretch: "viewport"`)

For a full-width mobile dropdown or action sheet, pass `stretch: "viewport"` with top or bottom placement. The panel spans the viewport's inline axis, pinned to both edges with `margin`. The main axis stays anchored to the trigger and still flips. `align`, cross-axis `clamp` and `matchAnchorWidth` do not apply in this mode. The inset is written as an inline style, so your skin never needs `!important` to express it. The controller also adds an `is-stretched` class, so you can skin the full-width variant, for example with square top corners and no side borders:

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

| Property / class | Description | Default |
| --- | --- | --- |
| `--uip-z-popover` | popover z-index (base layer: below toast / tooltip) | `1100` |
| `--uip-popover-enter-duration` | popover enter-fade animation | `100ms` |
| `--uip-popover-enter-easing` | popover enter-fade easing | `ease` |
| `--uip-popover-leave-duration` | popover leave-fade transition | `100ms` |
| `--uip-popover-leave-easing` | popover leave-fade easing | `ease` |
| `.uip-popover` | anchored floating panel (`position: fixed`, JS-positioned) | |
| `.uip-popover.is-open` | optional enter fade | |
| `.uip-popover.is-leaving` | leave fade before `[hidden]` | |
| `.uip-popover.is-stretched` | full-bleed skin hook: square edges / drop side borders on the full-width variant | |

Opening plays the optional `.uip-popover.is-open` enter fade, which you can skin. Closing swaps `is-open` for `is-leaving` and keeps the panel in the DOM until its transition ends or a fallback timeout fires. Then it sets `[hidden]`, so the panel animates out instead of vanishing. `isOpen` turns `false` the moment you call `hide()`. A `show()` or `toggle()` during the fade cancels the leave and reveals the panel again. Tune the fade with `--uip-popover-leave-duration` and `--uip-popover-leave-easing`. Under `prefers-reduced-motion` the fade drops to near zero, so closing still completes at once.

## Notes

- Flipping and clamping stay correct above the on-screen keyboard on mobile, because the engine reads the viewport from `window.visualViewport` when it exists. An open popover repositions on scroll, on window resize, and on `visualViewport` resize and scroll.
- `reposition()` is the call for async content. Load the panel's contents, then call it to re-measure and re-clamp at once.
- An open popover consumes Escape with `stopPropagation()`, so a popover opened inside a modal does not also close the modal underneath. Deeper coordination with other document-level Escape handlers is the caller's job.
- The controller does not build the panel. You pass it in, so `dispose()` hides it and removes the listeners but leaves your element in the DOM. The controller manages only `aria-expanded` and `aria-haspopup` on the anchor, removing both on `dispose()`. It sets no `role` on the panel, so set `role="menu"`, `"listbox"` or `"dialog"` yourself.
- `--uip-z-popover` (`1100`) orders the popover below toast (`9999`) and tooltip (`10000`) in the page. A modal sits in the top layer, above any `z-index`, so DOM position decides whether a popover shows over it. A disconnected panel opened from inside a modal is placed into that `<dialog>` automatically. A panel you connected yourself stays where you put it. So when a popover opens from inside a modal, connect its panel inside that dialog. A panel connected outside it would paint behind the modal and ignore input.
- Like tooltip, popover positions with JavaScript, through `getBoundingClientRect` and `position: fixed`, rather than the native Popover API or CSS anchor positioning.
- Pair it with [roving-focus](roving-focus.md) so a `role="menu"` panel gets the arrow-key navigation the WAI-ARIA menu pattern expects.
