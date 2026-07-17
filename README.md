# ui-primitives

[![npm](https://img.shields.io/npm/v/@cplieger/ui-primitives)](https://www.npmjs.com/package/@cplieger/ui-primitives)
[![JSR](https://jsr.io/badges/@cplieger/ui-primitives)](https://jsr.io/@cplieger/ui-primitives)
[![Test coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/cplieger/ui-primitives/badges/coverage.json)](https://github.com/cplieger/ui-primitives/actions/workflows/coverage.yml)
[![Mutation (TS)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/cplieger/ui-primitives/badges/mutation-ts.json)](https://github.com/cplieger/ui-primitives/issues?q=label%3Astryker-tracker)
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

Primitives: **toast**, **tooltip**, **popover**, **popup**, **dialog**,
**modal**, **confirm**, **prompt**, **disclosure**, **focus-trap**,
**roving-focus**, **theme**, **view-transition**, **announce**, **skeleton**.

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
- `createToaster(opts?: ToasterOptions)` — isolated instance. Call `dispose()` when the owning component unmounts to remove its document Escape listener and stack container. (The shared `toast` singleton lives for the app's lifetime and is never disposed.)
- `ToasterOptions` = `{ maxVisible?; maxQueue?; defaultDuration?; container?: HTMLElement; mode?: "stack" | "replace" }`.
- `ToastOptions` = `{ level?: "info" | "success" | "error"; duration?: number; retry?: ToastRetry }` (`duration: 0` = sticky).
- `ToastRetry` = `{ label?: string; onClick: () => void | Promise<void> }` (async rejections + sync throws are caught and logged).

**Embedding (`container`) and latest-wins (`mode: "replace"`).** By default the
stack mounts on `document.body` and stacks up to `maxVisible` toasts. An
embeddable widget can confine the stack to its own root with `container` (its
stacking then composes with the host page — a host `transform`/`contain`
becomes the fixed-position containing block, scoping the stack to the widget),
and switch to `mode: "replace"` for single-slot latest-wins semantics: a new
toast instantly replaces the visible one, nothing queues — the right shape for
transient widget feedback ("Copied", "Swipe to switch") where a queue of stale
messages would be wrong.

```ts
const widgetToast = createToaster({ container: widgetRoot, mode: "replace" });
widgetToast.info("Copied");
```

Behavior: up to `maxVisible` (default 3) show at once; the rest queue (cap
`maxQueue`, default 20, dropping the oldest). `info`/`success` auto-dismiss after
4s; `error` is sticky. Hover or focus pauses the countdown; it resumes only once
both the hover and the focus have ended (so a focused toast never auto-dismisses
under the cursor). Click or press **Escape** (newest first) to dismiss; each
toast is keyboard-focusable (`tabindex="0"`), and a focused toast can also be
dismissed with **Enter** or **Space**.

Accessibility: announcement is decoupled from the visual stack. When a toast
appears, its message is announced through the shared `announce()` live region
(`error` interrupts with **assertive** urgency; `info`/`success` are
**polite**), so the `.uip-toast-stack` and the toast nodes carry no
`role`/`aria-live` and no live region is ever nested inside another (which is
implementation-specific across screen readers). The toast node has no
`aria-label`; the affordance hint (`"Click to dismiss."`) rides along as a
visually-hidden child span so the focused node stays self-describing for
keyboard and screen-reader users. Nothing is appended to the DOM at import
time: the stack is created lazily on the first toast shown.

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

### roving-focus — `@cplieger/ui-primitives/roving-focus`

WAI-ARIA roving-tabindex keyboard navigation for composite widgets: menus,
listboxes, pickers, toolbars — any container whose items should be **one** Tab
stop navigated with the arrow keys.

```ts
import { rovingFocus } from "@cplieger/ui-primitives/roving-focus";

const nav = rovingFocus(menuEl, "[role=menuitem]");
nav.focusFirst(); // e.g. when the menu opens
nav.refresh(); // after a bulk re-render
nav.dispose();
```

- `rovingFocus(container, selector, opts?)` → `{ focusFirst(); refresh(); dispose() }`.
- `RovingFocusOptions` = `{ orientation?: "vertical" | "horizontal"; wrap?; homeEnd?; activate? }` (defaults: vertical, wrap, Home/End on, Enter/Space activate).

Headless: it manages only `tabindex` and focus. The matching items are queried
**live** on every keystroke, so rows added or removed after wiring (a filtered
list, a reconciled menu) navigate correctly; call `refresh()` after a bulk
re-render to restore the single-Tab-stop invariant on brand-new items. Focus
moving into any item (pointer or keyboard) rolls the Tab stop onto it.

This is the keyboard half of the WAI-ARIA **menu** pattern — pair it with
popover so a `role="menu"` panel keeps its interaction promise:

```ts
const pop = createPopover(button, panel, { haspopup: "menu" });
const nav = rovingFocus(panel, "[role=menuitem]");
button.addEventListener("click", () => {
  pop.toggle();
  if (pop.isOpen) nav.focusFirst();
});
```

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

**Custom `storage` adapter.** By default the preference is a bare
`localStorage[storageKey]` string. Pass a `storage` adapter to persist it
anywhere else — most usefully inside a larger structure you already own, e.g. a
`theme` field of a JSON blob:

```ts
const KEY = "app.ui-state";
const theme = createTheme({
  storageKey: KEY, // unused by a custom adapter, but still required
  storage: {
    get: () => JSON.parse(localStorage.getItem(KEY) ?? "{}").theme ?? null,
    set: (value) => {
      const blob = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      blob.theme = value; // read-modify-write; siblings untouched
      localStorage.setItem(KEY, JSON.stringify(blob));
    },
  },
});
```

`ThemeStorage` is `{ get(): string | null; set(value: string): void }`. Only
persistence goes through it; tri-state resolution, following the OS while
`system`, and the applied attribute are unchanged. A **2-state** app (light/dark,
no "system") simply never calls `set("system")` — nothing forces tri-state. A
throwing adapter (blocked storage, bad JSON) degrades to in-memory.

- `themeInitSnippetFromJSON(storageKey, field, attribute?)` → the anti-FOUC
  companion for the JSON-blob case: the inline IIFE reads
  `localStorage[storageKey]`, `JSON.parse`s it, extracts `field`, and applies the
  resolved theme before paint.

```html
<script>
  /* server-render this: themeInitSnippetFromJSON("app.ui-state", "theme") */
</script>
```

Both snippets read `window.localStorage` directly — they run before any module
loads, so they **cannot** use a custom `storage` adapter (use the plain
`themeInitSnippet` for a bare key, `themeInitSnippetFromJSON` for a JSON field).
When storage is unavailable, the blob is missing/malformed, or the field is
absent / `"system"`, they fall back to the OS preference
(`prefers-color-scheme`), matching `createTheme`'s runtime default, so dark-mode
users don't get a flash of light — including a 2-state app on first paint. The
`storageKey`, `field`, and `attribute` are escaped for the inline-`<script>`
context, so a value containing `</script>` (or other HTML-breaking characters)
is safe.

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

### prompt — `@cplieger/ui-primitives/prompt`

Confirm's input-collecting sibling: a Promise-based single-input dialog, the
styled, non-blocking replacement for `window.prompt`.

```ts
import { prompt } from "@cplieger/ui-primitives/prompt";

const name = await prompt("Rename passkey:", { initialValue: current, maxLength: 64 });
if (name !== null) rename(name);

const pw = await prompt("Enter your password to continue:", {
  title: "Verify",
  type: "password",
  autocomplete: "current-password",
});
```

- `prompt(message, opts?)` → `Promise<string | null>`.
- `PromptOptions` = `{ title?; confirmLabel?; cancelLabel?; type?: "text" | "password"; initialValue?; placeholder?; maxLength?; autocomplete? }`.

Renders a lazily-created, reused native `<dialog class="uip-prompt">` sharing
confirm's dialog-family motion. The message is the input's real `<label>`
(native form semantics); the dialog is labelled by the title and described by
the message, or labelled by the message when there is no title. **OK** or
**Enter** (the input sits in a form; OK is its submit button) resolve the
input's value **as-is** — an empty submission resolves `""`, distinct from the
`null` of a cancellation (trim/empty-to-null mapping is the caller's policy).
Cancel, Escape, a backdrop click, or a newer `prompt()` call resolve `null`.
The input is focused on open with any `initialValue` selected, like
`window.prompt`.

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
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; onClose? }`.
- `openDialog(dialog)` — `showModal()` with a graceful fallback.
- `closeDialog(dialog, onClosed?)` — fade out via `is-leaving`, then close.

The backdrop-click guard only closes when a press **starts and ends** on the
dialog element itself, so a drag-select that escapes the dialog does not dismiss
it.

**Conditional dismissal (`canDismiss`).** The guard is consulted on every USER
dismissal attempt — backdrop click or Escape — and returning `false` refuses it
while keeping the wiring armed, so later attempts re-consult it. Programmatic
`close()` always closes. Put any "why not" feedback inside the guard:

```ts
const settings = createDialog(dlg, {
  canDismiss: () => {
    if (isUnconfigured()) {
      toast.error("Save a valid configuration first");
      return false;
    }
    return true;
  },
});
```

### modal — `@cplieger/ui-primitives/modal`

A modal built from your content on a native `<dialog>` — the sibling to
`dialog`. Where `dialog` wraps a `<dialog>` element you already have, `modal`
builds one for you from arbitrary content. The platform gives focus containment,
the top layer, background inerting, Escape, nested stacking, and
focus-return-to-opener for free; `modal` adds the wrapping + ARIA, drag-safe
backdrop dismissal, the shared fade-out lifecycle, and an iOS-safe background
scroll-lock.

```ts
import { createModal } from "@cplieger/ui-primitives/modal";

const modal = createModal(panelContent, {
  role: "dialog",
  labelledBy: "settings-title",
  closeOnBackdrop: true,
});
modal.open();
modal.close();
modal.dispose(); // close + remove the <dialog> from the DOM
```

- `createModal(content, opts?)` → `{ open(); close(); readonly el; readonly isOpen; dispose() }`. Wraps `content` (which gets the `.uip-modal-dialog` skin hook) in a native `<dialog class="uip-modal">` appended to `<body>`; `el` is that `HTMLDialogElement`. `dispose()` closes and removes it.
- `ModalOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; role?: "dialog" | "alertdialog"; labelledBy?; describedBy?; initialFocus?; scrollLock?; onClose? }`. `canDismiss` guards USER dismissals (backdrop, Escape) exactly like dialog's — see the dialog section.

What `modal` adds on top of the platform `<dialog>`:

- **Drag-safe backdrop dismiss** — closes only when a press starts and ends on the `<dialog>` itself, so a drag-select escaping the panel doesn't dismiss (default `closeOnBackdrop: true`).
- **Escape** — intercepts the platform `cancel` event so the fade-out lifecycle runs, or so Escape is ignored when `closeOnEscape: false` (the browser already closes the topmost dialog on Escape).
- **Leave lifecycle** mirrors dialog/confirm: add `is-leaving`, wait for the dialog's `transitionend` (or a fallback), then `close()`.
- **iOS-safe scroll-lock** (default `scrollLock: true`, ref-counted across nested modals) — a native `<dialog>` does not lock background scroll and `overflow:hidden` on the root is ignored by iOS Safari for touch-scroll, so the body is pinned with `position:fixed` at the negated scroll offset and restored + scrolled back on release.
- **ARIA** — `role` defaults to the `<dialog>` implicit `dialog` (`aria-modal` is implicit under `showModal()`); `"alertdialog"` sets the role + the `.uip-modal--alert` modifier. `aria-labelledby`/`aria-describedby` come from the options, or, when omitted, from a descendant whose `id` ends in `-title` / `-desc` / `-description`.

Everything else — focus containment, the top layer, background inerting (dynamic:
elements added while the modal is open are inerted too), nested-modal stacking,
and returning focus to the opener on close — is provided by the browser's
`showModal()`, so it is not reimplemented here.

The `<dialog>` is auto-margined to center in the viewport, which sidesteps the
Safari `<dialog>` height bug. Because the modal lives in the browser's top layer
it renders above every base-layer `z-index` (no `--uip-z-modal` needed), so
toasts on `document.body` render _behind_ it (raise toasts before opening a
modal). A popover or tooltip opened from a control inside the modal is rendered
INTO the `<dialog>` so it stacks over the modal correctly (see popover/tooltip).

Both caveats of the old overlay-`<div>` modal are gone: background inerting is
now the platform's (dynamic — elements added while the modal is open are inerted
too), and the scroll-lock is the iOS-safe `position:fixed` technique rather than
`overflow:hidden`.

#### modal vs dialog — which one?

Both are native `<dialog>` now; the split is about what you hand the library:

- Use **dialog** (`createDialog` / `openDialog` / `closeDialog`) to add behavior to a `<dialog>` element already in your markup.
- Use **modal** (`createModal`) to build the `<dialog>` from a content element, with the ARIA wiring and the iOS-safe scroll-lock done for you.

`dialog` exposes `createDialog` / `openDialog` / `closeDialog`; `modal` exposes
`createModal`. The barrel `@cplieger/ui-primitives` re-exports both.

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

- `createDisclosure(trigger, region, opts?)` → `{ open(); close(); toggle(); readonly isOpen; dispose() }`. `trigger` is an `HTMLElement` **or `null`** (region-only mode, below).
- `DisclosureOptions` = `{ open?; animate?; onToggle?: (open: boolean, source: "user" | "api") => void }` (defaults: closed, animated). `source` distinguishes a trigger toggle (`"user"`) from a controller call (`"api"`) — the seam an auto-collapse state machine needs to latch "the user took over".

The trigger gets button semantics — `aria-expanded` reflecting the state, and
`role="button"` + `tabindex="0"` + Enter/Space handling when it isn't already a
native `<button>` — and is linked to the region via `aria-controls`. The region
gets a generated `id` (if it has none), and is marked `aria-hidden` **and** `inert` when collapsed (so collapsed content leaves the tab order and the accessibility tree entirely; `height:0`/`overflow:hidden` alone would keep descendants keyboard-focusable).

**Region-only mode (`trigger: null`).** No trigger is wired — no
`aria-expanded`, no click/keyboard handling — and the open state is driven
entirely through the controller. Use it when the visible control is something a
disclosure trigger would mis-describe: a checkbox enable-toggle whose `checked`
already conveys the state, or an app state machine that owns its own header UI.
The region still gets the height animation and `aria-hidden` + `inert`:

```ts
const body = createDisclosure(null, sectionBody, { open: checkbox.checked });
checkbox.addEventListener("change", () => {
  if (checkbox.checked) body.open();
  else body.close();
});
```

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
  on outside-click / Escape. `{ show(); hide(); toggle(); reposition(); readonly isOpen; readonly el; setOptions(patch); dispose() }`.
  `anchor` is a `PopoverAnchor` (element or virtual). The controller is built on
  the **popup** primitive (which owns the reveal/dismiss lifecycle), so it also
  accepts popup's `group` and `isolateEscape` options.

`PlacementOptions` (shared by both):

- `placement?: "top" | "bottom" | "left" | "right"` — side of the anchor. Default `"bottom"`.
- `align?: "start" | "center" | "end"` — cross-axis edge alignment. Default `"start"`.
- `offset?: number` — main-axis gap in px. Default `4`.
- `flip?: boolean` — flip to the opposite side when the chosen side would overflow and the opposite has more room. Default `true`.
- `clamp?: boolean` — clamp the cross-axis coordinate into the viewport. Default `true`.
- `matchAnchorWidth?: boolean | number` — set the panel's `min-width` to the anchor width (`true`) or to `max(anchorWidth, n)` (a number). Default `false`. Ignored when `stretch: "viewport"` is set.
- `margin?: number` — viewport edge margin used by flip + clamp — and, in `stretch: "viewport"` mode, the inline inset from each viewport edge — in px. Default `8`.
- `stretch?: "viewport"` — **full-bleed / edge-pinned mode.** The panel spans the viewport's inline axis (pinned to both inline edges, respecting `margin`) instead of being content-sized and cross-aligned to the anchor. The main axis stays anchored to the trigger (below for `placement: "bottom"`, above for `"top"`) and still flips when there is no room — the mobile full-width dropdown / action-sheet pattern. Top/bottom placement only (ignored for left/right); `align`, cross-axis `clamp`, and `matchAnchorWidth` don't apply. See _Full-bleed_ below. Default unset (content-sized).

`PopoverOptions extends PlacementOptions` adds `{ closeOnOutside?; closeOnEscape?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }` (dismissal defaults `true`; `haspopup` sets the anchor's `aria-haspopup` value: `true` (default), `"menu"`, `"listbox"`, `"tree"`, `"grid"`, or `"dialog"`; ignored for a virtual/point anchor).

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
`role="menu"` / `"listbox"` / `"dialog"` yourself to fit.

**Enter and leave animations.** Opening plays the optional, skinnable
`.uip-popover.is-open` enter fade. Closing runs a leave lifecycle mirroring
dialog / modal / toast: `hide()` (and `dispose()`) swap `is-open` → `is-leaving`
and keep the panel in the DOM until its transition ends — or a fallback timeout
fires (no transition, reduced motion, or an interruption) — then set `[hidden]`.
So the panel animates out instead of vanishing. `hide()` stays idempotent, and
`isOpen` flips to `false` the instant you call it (the fade is purely visual); a
`show()` (or `toggle()`) during the fade cancels the leave and re-reveals. Tune
the fade with `--uip-popover-leave-duration` / `--uip-popover-leave-easing`;
`prefers-reduced-motion` neutralizes it to near-zero so the lifecycle still
completes at once.

**Full-bleed (`stretch: "viewport"`).** For a mobile full-width dropdown or
action sheet, pass `stretch: "viewport"` (top/bottom placement). The panel spans
the viewport's inline axis pinned to both edges (with `margin`), while the main
axis stays anchored to the trigger and still flips. The inset is written as an
**inline style**, so your skin never needs `!important` to express it (nor a
media-query duplicate of the positioning). The controller also adds an
`is-stretched` marker class you can target to skin the full-width variant (e.g.
square the top corners, drop the side borders):

```ts
// Responsive: content-sized on desktop, full-bleed under 600px — flipped on
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

`setOptions(patch)` is a **merge-patch** over the live options: keys present in
the patch override the current value — an explicit `undefined` clears the
option back to its default (that is how `stretch` is turned off above) — and
absent keys are unchanged. Placement patches re-place an open panel
immediately; dismissal-flag patches re-arm the listeners; the anchor is
constructor-bound and cannot be patched.

```css
/* skin the full-bleed variant */
.uip-popover.is-stretched {
  border-radius: 0 0 8px 8px;
  border-block-start: none;
}
```

`--uip-z-popover` (`1100`) orders the popover below toast (`9999`) / tooltip
(`10000`) in the base layer. A modal is a native `<dialog>` in the top layer
(above every base-layer z-index), so a popover opened from within one is
rendered INTO that `<dialog>` (not stacked by z-index) to show over it.

Like tooltip, popover positions with JS (`getBoundingClientRect` + `position: fixed`)
rather than the native [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API)
or CSS anchor positioning — for testability and consistency with tooltip.
Adopting the native Popover API (top-layer, no z-index juggling) is a possible
future enhancement.

### popup — `@cplieger/ui-primitives/popup`

The reveal + light-dismiss lifecycle **without placement** — the behavior half
of popover, exposed on its own. Reach for it when the panel is in-flow or
self-positioned (an expandable pill/card, an inline tray, a bottom sheet) and
you want the standardized dismiss behavior: outside-click, isolated Escape,
single-open groups, trigger ARIA, opt-in focus, and the enter/leave state-class
lifecycle.

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

- `createPopup(panel, opts?)` → `{ show(); hide(); toggle(); readonly isOpen; readonly el; setOptions(patch); dispose() }`.
- `PopupOptions` = `{ trigger?: HTMLElement | null; closeOnOutside?; closeOnEscape?; isolateEscape?; group?; initialFocus?; returnFocus?; haspopup?; onOpen?; onClose? }`.
- `closePopupGroup(group)` — close every open popup in a group.

The `trigger` gets `aria-expanded` / `aria-haspopup` and is exempt from
outside-click dismissal (so its own click handler can toggle); the controller
does **not** wire activation on it — the caller owns that. `group` gives
single-open coordination: opening one popup closes any open peer with the same
group name. `isolateEscape` (default `true`) stops the consumed Escape's
propagation, popover-style; disable it when an app-level Escape coordinator
must still observe the key. `setOptions` is the same merge-patch as popover's.

**Motion is entirely yours.** The library adds `uip-popup` + `is-open` on
reveal (after a forced reflow, so a CSS _transition_ from the resting state
plays — an _animation_ on `is-open` works too) and swaps `is-open` →
`is-leaving` on conceal, setting `[hidden]` once the panel's first
`transitionend` fires (or a 400ms fallback). The base stylesheet ships only the
`[hidden]` display rule — no default motion, no custom properties:

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

A disconnected panel is hosted on `show()` — into the trigger's nearest open
`<dialog>` ancestor (top-layer correctness) or `<body>`; a caller-connected
panel (the usual in-flow case) stays exactly where you put it.

### announce — `@cplieger/ui-primitives/announce`

```ts
import { announce } from "@cplieger/ui-primitives/announce";

announce("5 results found"); // polite
announce("Connection lost", "assertive");
```

Updates a shared visually-hidden ARIA live region so screen readers announce
the message. `polite` (default) and `assertive` use separate regions. The text
is cleared then re-set after a short (~100ms) delay so repeated identical
messages still announce.

### skeleton — `@cplieger/ui-primitives/skeleton`

Anti-flicker timing for a "show a skeleton, then replace it with content" load.
Pure timing, no DOM — you paint the skeleton and the content; it owns **when**.
Two flickers are avoided: a fast load never paints the skeleton at all
(show-delay), and a painted skeleton never instantly vanishes (opt-in
min-visible).

```ts
import { skeletonTiming } from "@cplieger/ui-primitives/skeleton";

// commit-style: the content render replaces the skeleton in place.
const t = skeletonTiming(() => paint(out, skeletonRows()), {
  minVisibleMs: 300,
  signal, // suppresses a not-yet-painted skeleton if the load is aborted
});
const data = await load(signal);
t.commit(() => paint(out, rows(data)));

// teardown-style: the skeleton is its own element, removed on settle.
const s = skeletonTiming(() => {
  const node = makeSkeleton();
  list.append(node);
  return () => node.remove(); // the show callback may return a teardown
});
await load();
s.cancel(); // clears a pending skeleton, or tears down a painted one
```

- `skeletonTiming(show, opts?)` → `{ commit(render); cancel() }`.
- `SkeletonTimingOptions` = `{ showDelayMs? (150); minVisibleMs? (0); signal? }`.

`commit(render)` paints the content: immediately when the skeleton never
painted, else after min-visible has elapsed, running the `show` teardown (if
any) right before the render. `cancel()` abandons the load: it clears a pending
skeleton, tears down a painted one, and drops a commit render still deferred by
min-visible. Both are idempotent; the first settle wins. The `signal` only
suppresses a skeleton that has not painted yet — it never retracts one, and a
`commit` render always runs (guard your own render closure for
stale-sensitive results). Keep `minVisibleMs` at 0 when the skeleton shares its
container with the real content and must clear the instant the load completes.

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
| `--uip-toast-enter-easing`     | `ease`                   | toast enter easing (timing function)                            |
| `--uip-toast-leave-duration`   | `150ms`                  | toast leave transition                                          |
| `--uip-toast-leave-easing`     | `ease`                   | toast leave easing                                              |
| `--uip-toast-duration`         | `4000ms`                 | progress-bar duration — **set inline per toast by the library** |
| `--uip-toast-easing`           | `linear`                 | progress-bar easing (timing function)                           |
| `--uip-toast-progress-size`    | `2px`                    | progress-bar thickness                                          |
| `--uip-toast-progress-color`   | `currentcolor`           | progress-bar color                                              |
| `--uip-tooltip-fade-duration`  | `100ms`                  | tooltip fade                                                    |
| `--uip-tooltip-fade-easing`    | `ease`                   | tooltip fade easing                                             |
| `--uip-dialog-leave-duration`  | `150ms`                  | dialog / confirm / backdrop fade                                |
| `--uip-dialog-leave-easing`    | `ease`                   | dialog / confirm / backdrop fade easing                         |
| `--uip-backdrop`               | `oklch(0% 0 0deg / 50%)` | dialog / confirm backdrop dim                                   |
| `--uip-modal-backdrop`         | `var(--uip-backdrop)`    | modal `::backdrop` dim                                          |
| `--uip-modal-leave-duration`   | `150ms`                  | modal + `::backdrop` leave fade                                 |
| `--uip-modal-leave-easing`     | `ease`                   | modal + `::backdrop` leave-fade easing                          |
| `--uip-disclosure-duration`    | `200ms`                  | disclosure height transition                                    |
| `--uip-disclosure-easing`      | `ease`                   | disclosure height easing                                        |
| `--uip-z-popover`              | `1100`                   | popover z-index (base layer: below toast / tooltip)             |
| `--uip-popover-enter-duration` | `100ms`                  | popover enter-fade animation                                    |
| `--uip-popover-enter-easing`   | `ease`                   | popover enter-fade easing                                       |
| `--uip-popover-leave-duration` | `100ms`                  | popover leave-fade transition                                   |
| `--uip-popover-leave-easing`   | `ease`                   | popover leave-fade easing                                       |

Every motion property is a **duration + easing** pair: the `--uip-*-easing`
timing functions default to `ease` (the toast progress bar to `linear`) and
are overridable exactly like the durations above.

**Countdown contract:** the toast progress bar animates from the
`--uip-toast-duration` custom property, which the library writes inline on each
timed toast element. Do not set `transition-duration`/`animation-duration`
inline for the progress bar — override the timing by supplying the toast's
duration in code, and style the bar's color/size via the properties above.

### Classes and state classes

| Class                                                                              | Element                                                                |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.uip-toast-stack`                                                                 | toast container (visual only, not a live region)                       |
| `.uip-toast`, `.uip-toast--info` / `--success` / `--error`                         | a toast (level modifier)                                               |
| `.uip-toast-msg`                                                                   | toast message text                                                     |
| `.uip-toast-retry`                                                                 | toast retry button                                                     |
| `.uip-toast-progress`                                                              | toast countdown bar (`aria-hidden`)                                    |
| `.uip-tooltip`                                                                     | a tooltip (`role="tooltip"`)                                           |
| `.uip-confirm`                                                                     | the confirm `<dialog>`                                                 |
| `.uip-confirm-title` / `-msg` / `-actions` / `-ok` / `-cancel`                     | confirm parts                                                          |
| `.uip-prompt`                                                                      | the prompt `<dialog>` (shares the dialog-family motion)                |
| `.uip-prompt-title` / `-msg` / `-form` / `-input` / `-actions` / `-ok` / `-cancel` | prompt parts (`-msg` is the input's `<label>`)                         |
| `.uip-dialog`                                                                      | a `<dialog>` wrapped by `createDialog`                                 |
| `.uip-modal`, `.uip-modal--alert`                                                  | the modal `<dialog>` (top layer + `::backdrop`; alert modifier)        |
| `.uip-modal-dialog`                                                                | modal content (skin hook inside the `<dialog>`)                        |
| `.uip-disclosure-region`                                                           | disclosure collapsible region (`aria-hidden` when closed)              |
| `.uip-popover`                                                                     | anchored floating panel (`position: fixed`, JS-positioned)             |
| `.uip-popup`                                                                       | panel wired by `createPopup` (no placement; only `[hidden]` is styled) |
| `.uip-visually-hidden`                                                             | the announce live regions (sr-only)                                    |

State classes toggled at runtime (style these for motion/emphasis):

- `.uip-toast` lifecycle: `is-entering` → `is-shown` → `is-leaving`
- `.uip-tooltip.is-leaving`, `.uip-confirm.is-leaving`, `.uip-prompt.is-leaving`, `.uip-dialog.is-leaving`, `.uip-modal.is-leaving` (fade-out; the modal also fades its `::backdrop`)
- `.uip-popover.is-open` (optional enter fade), `.uip-popover.is-leaving` (leave fade before `[hidden]`), `.uip-popover.is-stretched` (full-bleed skin hook — square edges / drop side borders on the full-width variant)
- `.uip-popup.is-open` / `.uip-popup.is-leaving` (all motion is the app's; the base ships none for popup)
- `.uip-confirm-ok.is-destructive` (destructive emphasis)

A `@media (prefers-reduced-motion: reduce)` block neutralizes the animations to
near-zero (not zero, so `transitionend`/`animationend` still fire and the leave
lifecycles complete).

## Subpath exports

| Import                                    | Contents                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@cplieger/ui-primitives`                 | barrel — everything below (dialog's `createDialog`/`openDialog`/`closeDialog`; modal's `createModal`) |
| `@cplieger/ui-primitives/toast`           | `toast`, `createToaster`, `info`, `success`, `error`, types                                           |
| `@cplieger/ui-primitives/tooltip`         | `initTooltips`                                                                                        |
| `@cplieger/ui-primitives/popover`         | `createPopover`, `placeAnchored`, `pointAnchor`, types                                                |
| `@cplieger/ui-primitives/popup`           | `createPopup`, `closePopupGroup`, types                                                               |
| `@cplieger/ui-primitives/dialog`          | `createDialog`, `openDialog`, `closeDialog`                                                           |
| `@cplieger/ui-primitives/modal`           | `createModal`                                                                                         |
| `@cplieger/ui-primitives/confirm`         | `confirm`                                                                                             |
| `@cplieger/ui-primitives/prompt`          | `prompt`                                                                                              |
| `@cplieger/ui-primitives/disclosure`      | `createDisclosure`                                                                                    |
| `@cplieger/ui-primitives/focus-trap`      | `trapFocus`                                                                                           |
| `@cplieger/ui-primitives/roving-focus`    | `rovingFocus`                                                                                         |
| `@cplieger/ui-primitives/skeleton`        | `skeletonTiming`                                                                                      |
| `@cplieger/ui-primitives/theme`           | `createTheme`, `themeInitSnippet`, `themeInitSnippetFromJSON`                                         |
| `@cplieger/ui-primitives/view-transition` | `viewTransition`                                                                                      |
| `@cplieger/ui-primitives/announce`        | `announce`                                                                                            |
| `@cplieger/ui-primitives/css`             | the base stylesheet                                                                                   |

## Disclaimer

This project is built with care and follows good practices, but it is intended
for personal / self-hosted use. No guarantees of fitness for production
environments. Use at your own risk.

This project was built with AI-assisted tooling. The human maintainer defines
architecture, supervises implementation, and makes all final decisions.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
