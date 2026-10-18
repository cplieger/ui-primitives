# dialog

`@cplieger/ui-primitives/dialog`

Behavior helpers for native `<dialog>` elements. The platform gives focus containment, the top layer and Escape. These helpers add backdrop dismissal, a dismiss guard and a fade-out close.

## Usage

```ts
import { createDialog, openDialog, closeDialog } from "@cplieger/ui-primitives/dialog";

const controller = createDialog(myDialog, { closeOnBackdrop: true, onClose: () => {} });
controller.open();
controller.close();

// or manage a <dialog> yourself:
openDialog(myDialog);
closeDialog(myDialog, () => console.log("closed"));
```

## API

- `createDialog(dialog, opts?)` returns `{ open(); close(); readonly el; dispose() }` and adds the `uip-dialog` class for the base stylesheet. `dispose()` closes an open dialog at once, with no fade and no `onClose`, and removes the wiring and the class. It ends the open, releasing its hold on the dialog's announce regions, which leave when their last owner releases them.
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; onClose? }`.
- `openDialog(dialog)` mounts the dialog's two announce regions, then calls `showModal()`. The dialog it opened last ranks on top, so announcements, toasts and popups go to it. A dialog that is not in the document or is showing as a popover makes `showModal()` throw an `InvalidStateError`. `openDialog` and `controller.open()` rethrow it and keep nothing from the failed open.
- The two regions stay the dialog's last children while it is open. They leave when their last owner releases them: the dialog's `close` event, from `close()`, Escape or `closeDialog`, or `dispose()`. A dialog closed by clearing `open` fires no `close` event, so it keeps its regions until its next open or `dispose()`. Render your content into a child element of the dialog. Replacing the dialog's children removes the regions, and announcements made while it is open are lost.
- `closeDialog(dialog, onClosed?)` fades the dialog out with `is-leaving`, then closes it.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `--uip-dialog-leave-duration` | dialog / ask / backdrop fade | `150ms` |
| `--uip-dialog-leave-easing` | dialog / ask / backdrop fade easing | `ease` |
| `.uip-dialog` | a `<dialog>` wrapped by `createDialog` | |
| `.uip-dialog.is-leaving` | fade-out state class | |

The backdrop dim is the shared `--uip-backdrop` token, described in the README's CSS contract.

## Notes

- A backdrop click closes the dialog only when the press starts and ends on the dialog element itself, so a drag-select that leaves the dialog does not dismiss it.
- `canDismiss` is asked on every user dismissal, a backdrop click or Escape. When it returns `false`, the dialog stays open and the wiring stays armed, so the next attempt asks again. A programmatic `close()` always closes. Put any "why not" feedback inside the guard:

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

- Only a `cancel` event fired at the dialog itself counts as Escape. One that bubbles up from inside, such as a file input whose picker was dismissed, leaves the dialog open. The same holds for [modal](modal.md) and [ask](ask.md).
- `openDialog` cancels a fade-out still in progress, so you can reopen a dialog during its close animation.
- Use dialog to add behavior to a `<dialog>` element already in your markup. Use [modal](modal.md) to build the `<dialog>` from a content element instead.
