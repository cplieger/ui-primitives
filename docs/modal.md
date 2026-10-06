# modal

`@cplieger/ui-primitives/modal`

A modal built from your content on a native `<dialog>`. Its sibling [dialog](dialog.md) wraps a `<dialog>` element you already have, and `modal` builds one for you from any content. The platform gives focus containment, the top layer, background inerting, Escape, nested stacking and focus return to the opener. `modal` adds the wrapping and ARIA, drag-safe backdrop dismissal, the shared fade-out, and a background scroll-lock that works on iOS.

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

- `createModal(content, opts?)` returns `{ open(); close(); readonly el; readonly isOpen; dispose() }`. It wraps `content`, which gets the `.uip-modal-dialog` class, in a native `<dialog class="uip-modal">` appended to `<body>`. `el` is that `HTMLDialogElement`, and `dispose()` closes and removes it.
- `ModalOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; role?: "dialog" | "alertdialog"; labelledBy?; describedBy?; initialFocus?; scrollLock?; onClose? }`. `canDismiss` guards user dismissals, a backdrop click or Escape, exactly like dialog's. See [dialog](dialog.md).

What `modal` adds on top of the platform `<dialog>`:

- Backdrop dismissal closes only when a press starts and ends on the `<dialog>` itself, so a drag-select that leaves the panel does not dismiss it. `closeOnBackdrop` defaults to `true`.
- Escape runs the fade-out, or does nothing with `closeOnEscape: false`.
- Closing works like dialog and ask. The modal gets `is-leaving`, then `close()` runs once the transition ends.
- The scroll-lock is on by default (`scrollLock: true`) and counts nested modals. A native `<dialog>` does not lock background scroll, and iOS Safari ignores `overflow: hidden` for touch scrolling. So the body is pinned with `position: fixed` at the negative scroll offset, then restored and scrolled back on release.
- `role` defaults to the implicit `dialog` role of `<dialog>`, and `showModal()` implies `aria-modal`. `"alertdialog"` sets the role and the `.uip-modal--alert` modifier. `aria-labelledby` and `aria-describedby` come from the options. When those are omitted, they come from a descendant whose `id` ends in `-title`, `-desc` or `-description`.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `--uip-modal-backdrop` | modal `::backdrop` dim | `var(--uip-backdrop)` |
| `--uip-modal-leave-duration` | modal + `::backdrop` leave fade | `150ms` |
| `--uip-modal-leave-easing` | modal + `::backdrop` leave-fade easing | `ease` |
| `.uip-modal`, `.uip-modal--alert` | the modal `<dialog>` in the top layer with its `::backdrop`, and the alert modifier | |
| `.uip-modal-dialog` | modal content (skin hook inside the `<dialog>`) | |
| `.uip-modal.is-leaving` | fade-out state class (the modal also fades its `::backdrop`) | |

## Notes

- The modal lives in the browser's top layer, so it renders above every `z-index` in the page and needs no z-index property of its own.
- The default toast stack and the announce regions move into the open modal. See [toast](toast.md) and [announce](announce.md). A popover or tooltip opened from a control inside the modal is rendered into the `<dialog>`, so it stacks over the modal. See [popover](popover.md) and [tooltip](tooltip.md).

### Choosing between modal and dialog

Both use a native `<dialog>`. The difference is what you hand the library:

- Use dialog, with `createDialog`, `openDialog` and `closeDialog`, to add behavior to a `<dialog>` element already in your markup.
- Use modal (`createModal`) to build the `<dialog>` from a content element, with the ARIA wiring and the scroll-lock done for you.
