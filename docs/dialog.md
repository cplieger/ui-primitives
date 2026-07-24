# dialog

`@cplieger/ui-primitives/dialog`

Behavior helpers for native `<dialog>` elements: the platform gives focus
containment, the top layer, and Escape for free; these add backdrop dismissal
and a fade-out close lifecycle.

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

- `createDialog(dialog, opts?)` → `{ open(); close(); readonly el; dispose() }`. Adds the `uip-dialog` class for the base skin.
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; onClose? }`.
- `openDialog(dialog)`: `showModal()` with a graceful fallback.
- `closeDialog(dialog, onClosed?)`: fade out via `is-leaving`, then close.

## CSS

| Property / class              | Description                            | Default |
| ----------------------------- | -------------------------------------- | ------- |
| `--uip-dialog-leave-duration` | dialog / ask / backdrop fade           | `150ms` |
| `--uip-dialog-leave-easing`   | dialog / ask / backdrop fade easing    | `ease`  |
| `.uip-dialog`                 | a `<dialog>` wrapped by `createDialog` |         |
| `.uip-dialog.is-leaving`      | fade-out state class                   |         |

The backdrop dim is the shared `--uip-backdrop` token (see the README's CSS
contract).

## Notes

- The backdrop-click guard only closes when a press **starts and ends** on the dialog element itself, so a drag-select that escapes the dialog does not dismiss it.
- **Conditional dismissal (`canDismiss`).** The guard is consulted on every USER dismissal attempt (backdrop click or Escape); returning `false` refuses it while keeping the wiring armed, so later attempts re-consult it. Programmatic `close()` always closes. Put any "why not" feedback inside the guard:

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

- Use dialog to add behavior to a `<dialog>` element already in your markup; use [modal](modal.md) to build the `<dialog>` from a content element instead.
