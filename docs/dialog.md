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

- `createDialog(dialog, opts?)` returns `{ open(); close(); readonly el; dispose() }` and adds the `uip-dialog` class for the base stylesheet. A dialog has one controller at a time: `createDialog` on a dialog that already has a live controller, or on a modal's `el`, throws an `InvalidStateError` and acquires nothing. After `dispose()` the dialog takes a new controller.
- `dispose()` closes an open dialog at once, with no fade and no `onClose`, and removes the wiring and the class. It drops the pending `closeDialog` callbacks of the fade it cuts short, as a reopen does. Callbacks for a close that already finished still run, including when your `onClose` disposes the controller. Once `dispose()` has begun, `open()` throws an `InvalidStateError` and `close()` does nothing, also from a handler that `dispose()` reaches. A `dispose()` from code the controller is calling, such as your `canDismiss` or a focus handler, ends the controller at once, and its teardown completes as soon as your code returns.
- A controller made under a `@cplieger/reactive` owner, such as `createRoot`, a `bindList` row or an effect created under one, ends with that owner as `dispose()` would, and a later `dispose()` does nothing. Setup and every method run untracked, never under that owner. When the owner ends a controller, the handlers its teardown reaches run inside reactive's disposal, where creating an effect throws.
- `DialogOptions` = `{ closeOnBackdrop?; closeOnEscape?; canDismiss?: () => boolean; onClose? }`. The options are read once, at creation. `onClose` fires once per change from open to closed, whoever closed the dialog: the fade, `closeDialog` on the same element, or the browser. `close()` on a closed dialog does not call it.
- A method called from code the controller is calling records the new state at once, and `isOpen` reads it. The controller applies it, then notifies, as soon as your code returns. If the browser then refuses an `open()`, the error goes to the call that started the work, not to the nested `open()`.
- Errors thrown by your callbacks never interrupt the controller. It finishes the change and notifies, then throws them from the call that started the work, one as itself and several as an `AggregateError`. From an event, a timer, or the microtask after a change the browser made on its own, the browser reports them as uncaught. `canDismiss` still throws before anything changes.
- `openDialog(dialog)` calls `showModal()`. Of the open modal dialogs, the one the browser opened last ranks on top, whether these helpers or your own `showModal()` opened it, so toasts and popups go to it. The order comes from watching the `open` attribute from the moment ui-primitives loads. Every opening of a dialog these helpers or a controller drive is seen, wherever you move the dialog. Openings of other dialogs are seen in the document, and in a shadow root once the helpers drove, opened or saw the opening of a dialog there. An opening that was not seen, made before ui-primitives loaded or in a shadow root the helpers had not reached, ranks below every seen one until the dialog opens again. A dialog the helpers do not drive, in a shadow root they never reached, is not counted. A dialog that is not in the document or is showing as a popover makes `showModal()` throw an `InvalidStateError`. `openDialog` and `controller.open()` rethrow it and keep nothing from the failed open but the regions described below. A `beforetoggle` listener that cancels the open leaves the dialog closed: the call returns, and only the regions described below stay. On a disposed modal's `el`, `openDialog` throws an `InvalidStateError`, as `modal.open()` does.
- The first of these helpers or a controller to reach a dialog appends its two [announce](announce.md) regions as its last children, and they stay for the dialog's life, through closes and `dispose()`. Render your content into a child element of the dialog. Replacing the dialog's children removes the regions: the next open puts them back before `showModal()`, and announcements made in between do not reach the dialog.
- `closeDialog(dialog, onClosed?)` fades the dialog out with `is-leaving`, then closes it. Each dialog keeps its own state across these helpers and its controller. A reopen from anywhere during the fade cancels it, including one from code the fade's class change or its final `close()` reaches. Several `closeDialog` calls during one fade each get their callback when it closes, and a reopen before the close drops them. A callback runs even when an earlier callback or `onClose` reopened the dialog after the close. On a closed dialog, `onClosed` runs at once, or, when called from code a change of that dialog is running, as soon as that change finishes. Once a callback has run, nothing keeps a reference to it.
- The dialog follows the browser closing it: an Escape the browser does not let the page cancel, a `<form method="dialog">`, `requestClose()` or a direct `close()`. From that moment an `open()` opens it again, including from your own focus handler inside that close. `onClose` fires as soon as the close is applied: when the controller's current step returns, if the close happened inside one, otherwise at the next microtask after the browser's change. Removing the `open` attribute is followed the same way, though for a modal dialog the browser keeps the page inert and its place on top, so use `close()` instead. An `open()` before then reopens the dialog with no `onClose`, and a `dispose()` before then ends the controller with no `onClose`. A `close()` followed by `showModal()` reopens it the same way, also during a fade: the fade and its `closeDialog` callbacks are dropped. A `showModal()` on a dialog that is still open, fading or not, changes nothing, and neither does setting `open` to the value it already has.
- A dialog opened outside these helpers, by a direct `show()` or `showModal()` or an invoker command, is adopted at once: the controller follows it at the next microtask, also when your code opens it from the dialog's own `toggle` event, and it ranks by that opening from the moment it is made. A later `close()` fades it. When your code opens or closes the dialog from a `beforetoggle` listener of an open or close the helpers make, your change is the newer one and stands. A close or Escape made while your own `show()` or `showModal()` is still opening the dialog meets it closed and does nothing, and the dialog then opens.
- `wireBackdropDismiss(dialog, onDismiss)` calls `onDismiss` when a press both starts and ends on the dialog element itself, which is where a backdrop press lands. A drag-select that ends on the backdrop does not dismiss. It returns a cleanup function that removes its two listeners. A cleanup made under a `@cplieger/reactive` owner runs with that owner, and a later call does nothing.

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
- `canDismiss` is asked on every user dismissal, a backdrop click or Escape. When it returns `false`, the dialog stays open and the wiring stays armed, so the next attempt asks again. When the dialog changes while the guard runs, including a close or reopen your code or the browser makes, its answer is ignored. A programmatic `close()` always closes. Put any "why not" feedback inside the guard:

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
