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

- `createDialog(dialog, opts?)` returns `{ open(); close(); readonly el; dispose() }` and adds the `uip-dialog` class for the base stylesheet.
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; onClose? }`.
- `openDialog(dialog)` calls `showModal()`, with a fallback for engines that lack it.
- `closeDialog(dialog, onClosed?)` fades the dialog out with `is-leaving`, then closes it.

## CSS

| Property / class              | Description                            | Default |
| ----------------------------- | -------------------------------------- | ------- |
| `--uip-dialog-leave-duration` | dialog / ask / backdrop fade           | `150ms` |
| `--uip-dialog-leave-easing`   | dialog / ask / backdrop fade easing    | `ease`  |
| `.uip-dialog`                 | a `<dialog>` wrapped by `createDialog` |         |
| `.uip-dialog.is-leaving`      | fade-out state class                   |         |

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

- `openDialog` cancels a fade-out still in progress, so you can reopen a dialog during its close animation.
- Use dialog to add behavior to a `<dialog>` element already in your markup. Use [modal](modal.md) to build the `<dialog>` from a content element instead.
