# modal

`@cplieger/ui-primitives/modal`

A modal built from your content on a native `<dialog>`, the sibling to
[dialog](dialog.md): where `dialog` wraps a `<dialog>` element you already
have, `modal` builds one for you from arbitrary content. The platform gives
focus containment, the top layer, background inerting, Escape, nested
stacking, and focus-return-to-opener for free; `modal` adds the wrapping +
ARIA, drag-safe backdrop dismissal, the shared fade-out lifecycle, and an
iOS-safe background scroll-lock.

## Usage

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

## API

- `createModal(content, opts?)` → `{ open(); close(); readonly el; readonly isOpen; dispose() }`. Wraps `content` (which gets the `.uip-modal-dialog` skin hook) in a native `<dialog class="uip-modal">` appended to `<body>`; `el` is that `HTMLDialogElement`. `dispose()` closes and removes it.
- `ModalOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; role?: "dialog" | "alertdialog"; labelledBy?; describedBy?; initialFocus?; scrollLock?; onClose? }`. `canDismiss` guards USER dismissals (backdrop, Escape) exactly like dialog's; see [dialog](dialog.md).

What `modal` adds on top of the platform `<dialog>`:

- **Drag-safe backdrop dismiss**: closes only when a press starts and ends on the `<dialog>` itself, so a drag-select escaping the panel doesn't dismiss (default `closeOnBackdrop: true`).
- **Escape**: runs the fade-out lifecycle, or is ignored when `closeOnEscape: false`.
- **Leave lifecycle**: mirrors dialog/ask (`is-leaving`, then `close()` once the transition ends).
- **iOS-safe scroll-lock** (default `scrollLock: true`, ref-counted across nested modals): a native `<dialog>` does not lock background scroll and iOS Safari ignores `overflow:hidden` for touch-scroll, so the body is pinned with `position:fixed` at the negated scroll offset and restored + scrolled back on release.
- **ARIA**: `role` defaults to the `<dialog>` implicit `dialog` (`aria-modal` is implicit under `showModal()`); `"alertdialog"` sets the role + the `.uip-modal--alert` modifier. `aria-labelledby`/`aria-describedby` come from the options, or, when omitted, from a descendant whose `id` ends in `-title` / `-desc` / `-description`.

## CSS

| Property / class                  | Description                                                     | Default               |
| --------------------------------- | --------------------------------------------------------------- | --------------------- |
| `--uip-modal-backdrop`            | modal `::backdrop` dim                                          | `var(--uip-backdrop)` |
| `--uip-modal-leave-duration`      | modal + `::backdrop` leave fade                                 | `150ms`               |
| `--uip-modal-leave-easing`        | modal + `::backdrop` leave-fade easing                          | `ease`                |
| `.uip-modal`, `.uip-modal--alert` | the modal `<dialog>` (top layer + `::backdrop`; alert modifier) |                       |
| `.uip-modal-dialog`               | modal content (skin hook inside the `<dialog>`)                 |                       |
| `.uip-modal.is-leaving`           | fade-out state class (the modal also fades its `::backdrop`)    |                       |

## Notes

- Because the modal lives in the browser's top layer it renders above every base-layer `z-index` (no `--uip-z-modal` needed).
- The default toast stack and the announce regions auto-host into the open modal (see [toast](toast.md) / [announce](announce.md)), and a popover or tooltip opened from a control inside the modal is rendered INTO the `<dialog>` so it stacks over the modal correctly (see [popover](popover.md) / [tooltip](tooltip.md)).

### modal vs dialog: which one?

Both are native `<dialog>`; the split is about what you hand the library:

- Use **dialog** (`createDialog` / `openDialog` / `closeDialog`) to add behavior to a `<dialog>` element already in your markup.
- Use **modal** (`createModal`) to build the `<dialog>` from a content element, with the ARIA wiring and the iOS-safe scroll-lock done for you.
