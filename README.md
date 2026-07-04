# ui-primitives

[![npm](https://img.shields.io/npm/v/@cplieger/ui-primitives)](https://www.npmjs.com/package/@cplieger/ui-primitives)
[![JSR](https://jsr.io/badges/@cplieger/ui-primitives)](https://jsr.io/@cplieger/ui-primitives)
[![Test coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/cplieger/ui-primitives/badges/coverage.json)](https://github.com/cplieger/ui-primitives/actions/workflows/coverage.yml)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13489/badge)](https://www.bestpractices.dev/projects/13489)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/cplieger/ui-primitives/badge)](https://scorecard.dev/viewer/?uri=github.com/cplieger/ui-primitives)

> Headless browser UI primitives — behavior, accessibility, DOM, and a documented CSS contract. You bring the skin.

`@cplieger/ui-primitives` is a small, dependency-light library of common browser
UI primitives. Each primitive ships the **behavior**, the **ARIA/accessibility
wiring**, the **DOM structure**, and a **documented CSS class / custom-property
contract** — but no visual skin. Colors, radii, fonts, shadows, and spacing are
yours: define the `--uip-*` custom properties (or target the `.uip-*` classes
directly) and the primitive looks like your app.

Built on [`@cplieger/reactive`](https://github.com/cplieger/reactive) (uses its
`el` DOM factory). ESM-only, published as TypeScript source to npm and JSR.

Primitives: **toast**, **tooltip**, **popover**, **dialog**, **modal**,
**confirm**, **disclosure**, **focus-trap**, **theme**, **view-transition**,
**announce**.

## Install

```sh
npm i @cplieger/ui-primitives
# or
npx jsr add @cplieger/ui-primitives
```

Requires TypeScript ≥ 5 and a bundler that resolves ESM + TS source. `@cplieger/reactive` is a runtime dependency and is installed automatically.

## The skin-vs-behavior split

This library is **headless**. It gives you:

- **Behavior** — timers, queues, focus management, delegated listeners, state machines.
- **Accessibility** — roles, `aria-*` wiring, live regions, focus order, keyboard handling.
- **DOM** — the elements, with stable, namespaced classes and state classes.
- **A base stylesheet** — `css/ui-primitives.css`: structural + motion rules only, keyed off `--uip-*` custom properties.

It does **not** give you a skin: no colors, borders, radii, fonts, or shadows.
You provide those in one of two ways:

1. **Define `--uip-*` custom properties** for anything the base stylesheet reads (durations, offsets, z-indices, the backdrop dim), and
2. **Write your own rules against the `.uip-*` classes** for the visual look (background, color, border, radius, padding, typography).

Everything the library owns is namespaced so it never collides with your app's
vocabulary:

- classes: `uip-*` (e.g. `.uip-toast`, `.uip-tooltip`)
- custom properties: `--uip-*` (e.g. `--uip-toast-duration`)
- trigger attributes: `data-uip-*` (e.g. `data-uip-tooltip`)
- state classes: `is-*` within the namespace (e.g. `.uip-toast.is-entering` / `.is-shown` / `.is-leaving`)

Load the base stylesheet once, then layer your skin:

```ts
import "@cplieger/ui-primitives/css";
```

```css
/* your skin */
:root {
  --uip-toast-duration: 5000ms;
}
.uip-toast {
  background: #1e1e1e;
  color: #fff;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.uip-toast-progress {
  --uip-toast-progress-color: #4ade80;
}
```

## Quick start

```ts
import { toast } from "@cplieger/ui-primitives/toast";
import { confirm } from "@cplieger/ui-primitives/confirm";
import { initTooltips } from "@cplieger/ui-primitives/tooltip";
import { createTheme } from "@cplieger/ui-primitives/theme";
import "@cplieger/ui-primitives/css";

initTooltips();
const theme = createTheme({ storageKey: "app-theme" });

toast.success("Saved");

if (await confirm("Delete this file?", { variant: "destructive" })) {
  // ...
}
```

Every primitive is also importable from the barrel `@cplieger/ui-primitives`.

## Primitives

### toast — `@cplieger/ui-primitives/toast`

Stacked, queued, auto-dismissing notifications. Split into a pure, DOM-free
engine (timers/queue/promotion) and a DOM view; a default singleton is provided
for convenience.

```ts
import { toast, info, success, error, createToaster } from "@cplieger/ui-primitives/toast";

info("Copied to clipboard"); // auto-dismiss after 4s
success("Profile updated");
const dismiss = error("Upload failed", { onClick: () => retryUpload() }); // sticky + Retry button
dismiss(); // dismiss programmatically

// An isolated toaster with its own container + limits:
const toaster = createToaster({ maxVisible: 5, maxQueue: 50, defaultDuration: 6000 });
toaster.show("Custom", { level: "info", duration: 2000 });
```

- `toast: Toaster` — default shared toaster. `info` / `success` / `error` are the same methods as free functions.
- `Toaster.show(message, opts?)` → returns a `() => void` dismiss function.
- `Toaster.info(msg)` / `success(msg)` / `error(msg, retry?)` / `clear()` / `dispose()`.
- `createToaster({ maxVisible?, maxQueue?, defaultDuration? })` — isolated instance. Call `dispose()` when the owning component unmounts to remove its document Escape listener and stack container. (The shared `toast` singleton lives for the app's lifetime and is never disposed.)
- `ToastOptions` = `{ level?: "info" | "success" | "error"; duration?: number; retry?: ToastRetry }` (`duration: 0` = sticky).
- `ToastRetry` = `{ label?: string; onClick: () => void | Promise<void> }` (async rejections + sync throws are caught and logged).

Behavior: up to `maxVisible` (default 3) show at once; the rest queue (cap
`maxQueue`, default 20, dropping the oldest). `info`/`success` auto-dismiss after
4s; `error` is sticky. Hover or focus pauses the countdown; it resumes only once
both the hover and the focus have ended (so a focused toast never auto-dismisses
under the cursor). Click or press **Escape** (newest first) to dismiss. Each
toast is `role="status"` inside the stack (`aria-live="polite"`), `role="alert"`
when it is an error, keyboard-focusable, and carries an affordance `aria-label`
(`"<level> notification. Click to dismiss."`) — the message text is announced by
the live region and is deliberately not duplicated in the label.

Toasts mount on `document.body`. A toast raised while a modal `<dialog>` is open
therefore renders behind the dialog's top layer; raise toasts before opening a
modal, or after it closes. (Tooltips, by contrast, re-parent into an open
ancestor `<dialog>` — see below.)

### view-transition — `@cplieger/ui-primitives/view-transition`

```ts
import { viewTransition } from "@cplieger/ui-primitives/view-transition";

await viewTransition(() => {
  swapTheDom();
});
```

A queued, feature-detected wrapper over `document.startViewTransition`.
Overlapping calls serialize so transitions never visually overlap; when the API
is unavailable the callback runs directly. The returned promise resolves when
the transition (or the direct run) finishes; a skipped/cancelled transition
resolves rather than rejects.

### focus-trap — `@cplieger/ui-primitives/focus-trap`

```ts
import { trapFocus } from "@cplieger/ui-primitives/focus-trap";

const release = trapFocus(dialogEl, { returnFocus: true });
// ... interaction ...
release(); // restores focus to the previously-focused element
```

- `trapFocus(container, opts?)` → a release function.
- `FocusTrapOptions` = `{ initialFocus?: HTMLElement | null; returnFocus?: boolean | HTMLElement }`.

Tab / Shift+Tab cycle within the container (wrapping at the edges). On entry,
`initialFocus` (or the first visible focusable element) is focused. `release()`
restores focus to the element focused before the trap, to an explicit
`returnFocus` element, or leaves focus alone when `returnFocus` is `false`.

### theme — `@cplieger/ui-primitives/theme`

Persisted tri-state theme (`light` / `dark` / `system`). While in `system` it
follows the OS preference live via `matchMedia`.

```ts
import { createTheme, themeInitSnippet } from "@cplieger/ui-primitives/theme";

const theme = createTheme({ storageKey: "app-theme" });
theme.set("dark");
theme.cycle(); // light -> dark -> system -> light
theme.resolved(); // "light" | "dark" (system resolved to a concrete value)
theme.dispose();
```

- `createTheme(opts)` → `ThemeController` with `get()`, `set(choice)`, `resolved()`, `cycle()`, `getSystem()`, `dispose()`.
- `ThemeOptions` = `{ storageKey; storage?; attribute?; onChange? }`. `attribute` defaults to `data-theme` and is set on `<html>` with the resolved value.
- `themeInitSnippet(storageKey, attribute?)` → a self-contained IIFE **string** to inline in a blocking `<head>` script so the correct theme paints before stylesheets load (a real import can't run there):

```html
<script>
  /* server-render this: themeInitSnippet("app-theme") */
</script>
```

The snippet reads `window.localStorage` directly — it runs before any module
loads, so it **cannot** use a custom `storage` backend passed to `createTheme`.
Use it only when the preference lives in `localStorage`. When storage is
unavailable it falls back to the OS preference (`prefers-color-scheme`), matching
`createTheme`'s runtime default, so dark-mode users don't get a flash of light.
The `storageKey` and `attribute` are escaped for the inline-`<script>` context,
so a key containing `</script>` (or other HTML-breaking characters) is safe.

### confirm — `@cplieger/ui-primitives/confirm`

```ts
import { confirm } from "@cplieger/ui-primitives/confirm";

const ok = await confirm("Delete everything?", {
  title: "Danger",
  confirmLabel: "Delete",
  variant: "destructive",
});
```

- `confirm(message, opts?)` → `Promise<boolean>`.
- `ConfirmOptions` = `{ title?; confirmLabel?; cancelLabel?; variant?: "normal" | "destructive" }`.

Renders a lazily-created, reused native `<dialog>` — labelled by its title
(`aria-labelledby`), described by its message body (`aria-describedby`), or
labelled by the message when there is no title. `showModal()` provides the focus
trap and focus restoration; `destructive` upgrades it to `role="alertdialog"`
and focuses **Cancel** (so a keyboard user can't confirm by accident) and adds
`is-destructive` to the confirm button for skinning. Escape, a backdrop click,
or a newer `confirm()` call all resolve `false`.

### dialog — `@cplieger/ui-primitives/dialog`

Behavior helpers for native `<dialog>` elements — the platform gives focus
containment, the top layer, and Escape for free; these add backdrop dismissal
and a fade-out close lifecycle.

```ts
import { createDialog, openDialog, closeDialog } from "@cplieger/ui-primitives/dialog";

const controller = createDialog(myDialog, { closeOnBackdrop: true, onClose: () => {} });
controller.open();
controller.close();

// or manage a <dialog> yourself:
openDialog(myDialog);
closeDialog(myDialog, () => console.log("closed"));
```

- `createDialog(dialog, opts?)` → `{ open(); close(); readonly el; dispose() }`. Adds the `uip-dialog` class for the base skin.
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; onClose? }`.
- `openDialog(dialog)` — `showModal()` with a graceful fallback.
- `closeDialog(dialog, onClosed?)` — fade out via `is-leaving`, then close.

The backdrop-click guard only closes when a press **starts and ends** on the
dialog element itself, so a drag-select that escapes the dialog does not dismiss
it.

### modal — `@cplieger/ui-primitives/modal`

An overlay-`<div>` modal: the sibling to `dialog`. Where `dialog` is a thin
layer over the native `<dialog>` element, `modal` is for when your modal is an
overlay div and the library has to manage containment, stacking, scroll-lock,
and the enter/leave lifecycle by hand.

```ts
import { createModal, openModal, closeModal, closeTopModal } from "@cplieger/ui-primitives/modal";

const modal = createModal(panelContent, {
  role: "dialog",
  labelledBy: "settings-title",
  closeOnBackdrop: true,
});
modal.open();
modal.close();

// or manage an overlay div yourself (it should contain a .uip-modal-dialog panel):
openModal(myOverlay, { role: "alertdialog" });
closeModal(myOverlay, () => console.log("closed"));

closeTopModal(); // close whichever modal is on top
```

- `createModal(content, opts?)` → `{ open(); close(); readonly el; readonly isOpen; dispose() }`. Wraps `content` in a `.uip-modal-dialog` panel inside a `.uip-modal` overlay appended to `<body>` (hidden until opened).
- `openModal(overlay, opts?)` — reveal an overlay div as a modal (the `showModal()` equivalent): trap focus, inert the background, lock scroll, wire dismissal, transition in.
- `closeModal(overlay, onClosed?)` — fade out via `is-leaving`, then tear everything down and restore focus.
- `closeTopModal()` → `boolean` — close the topmost open modal; `true` if one closed.
- `ModalOptions` = `{ closeOnBackdrop?; closeOnEscape?; role?: "dialog" | "alertdialog"; labelledBy?; describedBy?; initialFocus?; returnFocus?; scrollLock?; inertBackground?; onClose? }`.

Behavior the native `<dialog>` gives for free, reimplemented here:

- **Stacked focus traps.** Built on `focus-trap`, but managed as a stack: the trap installs a document-capture keydown, so two live traps would fight over Tab. Only the topmost trap is active — opening a child modal pauses the parent's trap; closing the child re-traps it. `returnFocus` chains down the stack (each modal restores focus to the element that was focused when it opened).
- **Inert background + scroll-lock**, both ref-counted across the stack so they release only when the last modal closes. Background inerting marks the overlay's siblings `inert` (including a lower modal's overlay); an app-set `inert` is never clobbered.
- **Drag-safe backdrop dismiss** — closes only when a press starts and ends on the overlay itself, so a drag-select escaping the panel doesn't dismiss.
- **Escape** closes the topmost modal only.
- **Leave lifecycle** mirrors dialog/confirm/toast: `is-leaving`, wait for the panel's `transitionend` (or a fallback), then tear down.
- **ARIA**: the panel gets `role` (`dialog` or `alertdialog`), `aria-modal="true"`, and `aria-labelledby`/`aria-describedby` from the options. When `labelledBy` is omitted a descendant whose `id` ends in `-title` is auto-detected; likewise, when `describedBy` is omitted a descendant whose `id` ends in `-desc` or `-description` is auto-detected.

The overlay is grid-centered (`display: grid; place-items: center`) rather than
flex + `max-height`, which sidesteps the Safari `<dialog>` height bug.
`--uip-z-modal` (`1000`) sits deliberately below `--uip-z-toast` and
`--uip-z-tooltip` so toasts and tooltips overlay a modal.

Two limitations to keep in mind: background inerting is computed when a modal
opens or closes, so `<body>` children added _while_ a modal is open are not
retroactively inerted — add them before opening the modal (or close and re-open
to re-sync). And scroll-lock uses `overflow: hidden` on `<html>`/`<body>`, which
does not fully stop touch-scroll on iOS Safari.

#### modal vs dialog — which one?

- Use **dialog** for platform-simple prompts where the native `<dialog>` is enough. The browser gives you focus containment, the top layer, and Escape for free; `dialog` just adds drag-safe backdrop dismissal and a fade-out.
- Use **modal** when your modal is an overlay div (`.modal-overlay`-style), when you need custom stacking or transitions the top layer can't express, or when you want grid-centering to dodge the Safari `<dialog>` height bug. `modal` does the containment, stacking, scroll-lock, and lifecycle work by hand.

The two use distinct verbs, so there is no name collision: **dialog** exposes
`createDialog` / `openDialog` / `closeDialog`, and **modal** exposes
`createModal` / `openModal` / `closeModal` / `closeTopModal`. The barrel
`@cplieger/ui-primitives` re-exports both sets directly — import `openModal` /
`closeModal` for the overlay-div versions and `openDialog` / `closeDialog` for
the native-`<dialog>` versions (or reach for either primitive's own subpath).

### disclosure — `@cplieger/ui-primitives/disclosure`

An animated collapsible (show/hide) region wired to a trigger, per the WAI-ARIA
disclosure pattern. Headless — it wires two elements you supply; it creates no
DOM.

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

- `createDisclosure(trigger, region, opts?)` → `{ open(); close(); toggle(); readonly isOpen; dispose() }`.
- `DisclosureOptions` = `{ open?; animate?; onToggle?: (open: boolean) => void }` (defaults: closed, animated).

The trigger gets button semantics — `aria-expanded` reflecting the state, and
`role="button"` + `tabindex="0"` + Enter/Space handling when it isn't already a
native `<button>` — and is linked to the region via `aria-controls`. The region
gets a generated `id` (if it has none) and `aria-hidden` when collapsed.

Height animates `0 ↔ auto`. Modern engines interpolate the `auto` keyword
directly via `interpolate-size: allow-keywords` (set on the region in the base
stylesheet); engines without it fall back to a measured `scrollHeight` px
target. Both honor `prefers-reduced-motion` by skipping the tween.

### tooltip — `@cplieger/ui-primitives/tooltip`

```ts
import { initTooltips } from "@cplieger/ui-primitives/tooltip";

initTooltips(); // idempotent; installs one delegated controller
```

```html
<button data-uip-tooltip="Copy to clipboard">Copy</button>
<button data-uip-tooltip="Line one&#10;Line two">Multi</button>
```

- `initTooltips(opts?)` — install once. `TooltipOptions` = `{ attribute?; delayCold?; delayWarm?; cooldown? }` (defaults `data-uip-tooltip`, 1000ms, 0ms, 500ms).

One delegated controller handles every trigger. The first tooltip of a "cold"
group waits `delayCold`; peers show instantly while the group is warm. The
trigger text is appended to the anchor's `aria-describedby` (preserving any
token the app already set, and removing only its own on hide); `\n` in the value
splits into `<br>`-separated lines. Escape, scroll, and window blur hide it.
Positioned `fixed` above the anchor (flips below when there is no room), clamped
to the viewport. When the anchor sits inside an open modal `<dialog>`, the
tooltip is appended into that dialog so it shares the dialog's top layer instead
of rendering behind it.

### popover — `@cplieger/ui-primitives/popover`

An anchored floating panel with a real placement engine. It's the interactive
superset of tooltip and the substrate a menu / listbox / picker sits on — reach
for it for dropdowns, filter panels, and pickers.

```ts
import { createPopover, placeAnchored } from "@cplieger/ui-primitives/popover";

// (a) The controller — for an interactive popover you open and dismiss:
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

// (b) The pure positioner — position any position:fixed panel yourself:
placeAnchored(panelEl, anchorEl, { placement: "top", align: "center", flip: true });
```

Two exports, split by responsibility:

- `placeAnchored(panel, anchor, opts?)` — the **pure positioner**. It reads
  `anchor.getBoundingClientRect()` and the panel's measured size, then writes
  `panel.style.left` / `top` (and `position: fixed`). Idempotent: safe to call on
  every scroll / resize or after the panel's content changes size. `anchor` is a
  `PopoverAnchor` — an element or a virtual rect source (see _Anchor against a
  coordinate_ below).
- `createPopover(anchor, panel, opts?)` → `PopoverController` — the **controller**
  that reveals + positions the caller's panel, tracks the anchor, and dismisses
  on outside-click / Escape. `{ show(); hide(); toggle(); reposition(); readonly isOpen; readonly el; dispose() }`.
  `anchor` is a `PopoverAnchor` (element or virtual).

`PlacementOptions` (shared by both):

- `placement?: "top" | "bottom" | "left" | "right"` — side of the anchor. Default `"bottom"`.
- `align?: "start" | "center" | "end"` — cross-axis edge alignment. Default `"start"`.
- `offset?: number` — main-axis gap in px. Default `4`.
- `flip?: boolean` — flip to the opposite side when the chosen side would overflow and the opposite has more room. Default `true`.
- `clamp?: boolean` — clamp the cross-axis coordinate into the viewport. Default `true`.
- `matchAnchorWidth?: boolean | number` — set the panel's `min-width` to the anchor width (`true`) or to `max(anchorWidth, n)` (a number). Default `false`.
- `margin?: number` — viewport edge margin used by flip + clamp, in px. Default `8`.

`PopoverOptions extends PlacementOptions` adds `{ closeOnOutside?; closeOnEscape?; initialFocus?; returnFocus?; onOpen?; onClose? }` (dismissal defaults `true`).

**Anchor against a coordinate, not just an element.** Both `placeAnchored` and
`createPopover` take a `PopoverAnchor` — a real `HTMLElement` or a
`VirtualAnchor`, any object exposing `getBoundingClientRect()`. `pointAnchor(x, y)`
builds a zero-size virtual anchor at a viewport coordinate, which is what makes a
right-click context menu expressible — the popover opens from the pointer point:

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

With a virtual / point anchor there is no trigger element, so **no ARIA is set on
any element** (an `HTMLElement` anchor still gets `aria-expanded` /
`aria-haspopup`), and outside-click dismissal closes on **any** click outside the
panel — including where the right-click happened, which is exactly right for a
context menu. The rect is read fresh on every placement, so `pointAnchor` takes a
fixed point; for a moving point, build a new `pointAnchor` and call `reposition()`
/ `placeAnchored()` again.

The placement engine reads the viewport from `window.visualViewport` when
present, so flipping and clamping stay correct above the mobile on-screen
keyboard (it falls back to `window.innerWidth` / `innerHeight`). `reposition()`
is the seam for async content: load the panel's contents, then call it to
re-measure and re-clamp. An open popover also repositions on scroll (capture),
window resize, and `visualViewport` resize / scroll; those tracking events are
throttled with `requestAnimationFrame`, so a burst coalesces to at most one
reposition per frame. The public `reposition()` stays **synchronous** — it
re-measures immediately, which is what you want right after a content change.

**Focus is opt-in — by default the caller owns it.** Pass `initialFocus` (a
connected element) to focus it right after the popover opens, and `returnFocus`
to restore focus on close: `true` remembers whatever was focused when the
popover opened and refocuses it, or pass an element to focus that element
instead. Omit both and the controller never touches focus. This mirrors the
common branch-popover pattern — focus the filter input on open, return focus to
the anchor on close:

```ts
const filter = panelEl.querySelector("input")!;
const pop = createPopover(anchorButton, panelEl, {
  initialFocus: filter, // focus the filter when the panel opens
  returnFocus: true, // restore focus to the anchor (whatever was focused) on close
});
```

Escape is **isolated**: when an open popover handles Escape it calls
`stopPropagation()`, so a popover opened inside a modal consumes that keystroke
rather than letting the same Escape also close the modal underneath. Deeper
Escape coordination (e.g. nested document-level handlers) remains the caller's
concern.

The controller does **not** build the panel — you pass it in, so `dispose()`
hides + unlistens but leaves your element in the DOM. It manages only
`aria-expanded` / `aria-haspopup` on the anchor (`dispose()` removes both, since
the anchor no longer owns a popover) and forces no `role` on the panel — set
`role="menu"` / `"listbox"` / `"dialog"` yourself to fit. Dismissal is instant
(no leave animation); the optional `.uip-popover.is-open` enter fade is
skinnable.

`--uip-z-popover` (`1100`) sits deliberately above `--uip-z-modal` (`1000`) so a
popover opened from within a modal shows over it, and below toast (`9999`) /
tooltip (`10000`).

Like tooltip, popover positions with JS (`getBoundingClientRect` + `position: fixed`)
rather than the native [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)
or CSS anchor positioning — for testability and consistency with tooltip.
Adopting the native Popover API (top-layer, no z-index juggling) is a possible
future enhancement.

### announce — `@cplieger/ui-primitives/announce`

```ts
import { announce } from "@cplieger/ui-primitives/announce";

announce("5 results found"); // polite
announce("Connection lost", "assertive");
```

Updates a shared visually-hidden ARIA live region so screen readers announce
the message. `polite` (default) and `assertive` use separate regions. The text
is cleared then re-set on a microtask so repeated identical messages still
announce.

## CSS contract

Import the base once: `import "@cplieger/ui-primitives/css";`. It sets only
structure + motion. Define these `--uip-*` properties (globally in `:root` or
scoped) to tune behavior, and style the classes for your skin.

### Custom properties

| Property                       | Default                  | Used by                                                         |
| ------------------------------ | ------------------------ | --------------------------------------------------------------- |
| `--uip-z-toast`                | `9999`                   | toast stack z-index                                             |
| `--uip-z-tooltip`              | `10000`                  | tooltip z-index                                                 |
| `--uip-toast-offset`           | `1rem`                   | toast stack inset from the viewport edge                        |
| `--uip-toast-gap`              | `0.5rem`                 | gap between stacked toasts                                      |
| `--uip-toast-max-width`        | `24rem`                  | toast stack max inline size                                     |
| `--uip-toast-enter-duration`   | `250ms`                  | toast enter transition                                          |
| `--uip-toast-leave-duration`   | `150ms`                  | toast leave transition                                          |
| `--uip-toast-duration`         | `4000ms`                 | progress-bar duration — **set inline per toast by the library** |
| `--uip-toast-progress-size`    | `2px`                    | progress-bar thickness                                          |
| `--uip-toast-progress-color`   | `currentcolor`           | progress-bar color                                              |
| `--uip-tooltip-fade-duration`  | `100ms`                  | tooltip fade                                                    |
| `--uip-dialog-leave-duration`  | `150ms`                  | dialog / confirm / backdrop fade                                |
| `--uip-backdrop`               | `oklch(0% 0 0deg / 50%)` | dialog / confirm backdrop dim                                   |
| `--uip-z-modal`                | `1000`                   | modal overlay z-index (below toast / tooltip on purpose)        |
| `--uip-modal-backdrop`         | `var(--uip-backdrop)`    | modal backdrop dim                                              |
| `--uip-modal-enter-duration`   | `200ms`                  | modal enter transition                                          |
| `--uip-modal-leave-duration`   | `150ms`                  | modal leave transition                                          |
| `--uip-disclosure-duration`    | `200ms`                  | disclosure height transition                                    |
| `--uip-z-popover`              | `1100`                   | popover z-index (above modal, below toast / tooltip)            |
| `--uip-popover-enter-duration` | `100ms`                  | popover enter-fade animation                                    |

**Countdown contract:** the toast progress bar animates from the
`--uip-toast-duration` custom property, which the library writes inline on each
timed toast element. Do not set `transition-duration`/`animation-duration`
inline for the progress bar — override the timing by supplying the toast's
duration in code, and style the bar's color/size via the properties above.

### Classes and state classes

| Class                                                          | Element                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `.uip-toast-stack`                                             | toast container (`role="status"`, `aria-live="polite"`)    |
| `.uip-toast`, `.uip-toast--info` / `--success` / `--error`     | a toast (level modifier)                                   |
| `.uip-toast-msg`                                               | toast message text                                         |
| `.uip-toast-retry`                                             | toast retry button                                         |
| `.uip-toast-progress`                                          | toast countdown bar (`aria-hidden`)                        |
| `.uip-tooltip`                                                 | a tooltip (`role="tooltip"`)                               |
| `.uip-confirm`                                                 | the confirm `<dialog>`                                     |
| `.uip-confirm-title` / `-msg` / `-actions` / `-ok` / `-cancel` | confirm parts                                              |
| `.uip-dialog`                                                  | a `<dialog>` wrapped by `createDialog`                     |
| `.uip-modal`, `.uip-modal--alert`                              | modal overlay (backdrop + grid centering; alert modifier)  |
| `.uip-modal-dialog`                                            | modal panel                                                |
| `.uip-disclosure-region`                                       | disclosure collapsible region (`aria-hidden` when closed)  |
| `.uip-popover`                                                 | anchored floating panel (`position: fixed`, JS-positioned) |
| `.uip-visually-hidden`                                         | the announce live regions (sr-only)                        |

State classes toggled at runtime (style these for motion/emphasis):

- `.uip-toast` lifecycle: `is-entering` → `is-shown` → `is-leaving`
- `.uip-modal` lifecycle: `is-entering` → `is-open` → `is-leaving` (drives both the backdrop and the panel)
- `.uip-tooltip.is-leaving`, `.uip-confirm.is-leaving`, `.uip-dialog.is-leaving` (fade-out)
- `.uip-popover.is-open` (optional enter fade; dismissal is instant, so there is no leave state)
- `.uip-confirm-ok.is-destructive` (destructive emphasis)

A `@media (prefers-reduced-motion: reduce)` block neutralizes the animations to
near-zero (not zero, so `transitionend`/`animationend` still fire and the leave
lifecycles complete).

## Subpath exports

| Import                                    | Contents                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `@cplieger/ui-primitives`                 | barrel — everything below (dialog's `openDialog`/`closeDialog` and modal's `openModal`/`closeModal`, no longer colliding) |
| `@cplieger/ui-primitives/toast`           | `toast`, `createToaster`, `info`, `success`, `error`, types                                                               |
| `@cplieger/ui-primitives/tooltip`         | `initTooltips`                                                                                                            |
| `@cplieger/ui-primitives/popover`         | `createPopover`, `placeAnchored`, `pointAnchor`, types                                                                    |
| `@cplieger/ui-primitives/dialog`          | `createDialog`, `openDialog`, `closeDialog`                                                                               |
| `@cplieger/ui-primitives/modal`           | `createModal`, `openModal`, `closeModal`, `closeTopModal`                                                                 |
| `@cplieger/ui-primitives/confirm`         | `confirm`                                                                                                                 |
| `@cplieger/ui-primitives/disclosure`      | `createDisclosure`                                                                                                        |
| `@cplieger/ui-primitives/focus-trap`      | `trapFocus`                                                                                                               |
| `@cplieger/ui-primitives/theme`           | `createTheme`, `themeInitSnippet`                                                                                         |
| `@cplieger/ui-primitives/view-transition` | `viewTransition`                                                                                                          |
| `@cplieger/ui-primitives/announce`        | `announce`                                                                                                                |
| `@cplieger/ui-primitives/css`             | the base stylesheet                                                                                                       |

## Disclaimer

This project is built with care and follows good practices, but it is intended
for personal / self-hosted use. No guarantees of fitness for production
environments. Use at your own risk.

This project was built with AI-assisted tooling. The human maintainer defines
architecture, supervises implementation, and makes all final decisions.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
