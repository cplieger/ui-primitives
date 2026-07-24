# ask

`@cplieger/ui-primitives/ask`

The Promise-shaped question dialog: the styled, non-blocking replacement for
**both** `window.confirm` and `window.prompt`.

## Usage

```ts
import { ask } from "@cplieger/ui-primitives/ask";

// Boolean ask (confirm): resolves true / false.
const ok = await ask("Delete everything?", {
  title: "Danger",
  confirmLabel: "Delete",
  variant: "destructive",
});

// Input ask (prompt): resolves the value, or null on cancellation.
const name = await ask("Rename passkey:", {
  input: { initialValue: current, maxLength: 64 },
});
if (name !== null) rename(name);

const pw = await ask("Enter your password to continue:", {
  title: "Verify",
  input: { type: "password", autocomplete: "current-password" },
});
```

## API

- `ask(message, opts?)` → `Promise<boolean>`; with `input` set →
  `Promise<string | null>` (the overloads narrow the return type from the
  options shape).
- `AskOptions` = `{ title?; confirmLabel?; cancelLabel?; variant?: "normal" | "destructive"; input?: AskInput | true }`.
- `AskInput` = `{ type?: "text" | "password"; initialValue?; placeholder?; maxLength?; autocomplete? }` (`input: true` = a default text input).

## CSS

| Property / class                                           | Description                                                    | Default |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| `.uip-ask`, `.uip-ask--input`                              | the ask `<dialog>` (input-shape modifier)                      |         |
| `.uip-ask-title` / `-msg` / `-actions` / `-ok` / `-cancel` | ask parts (`-msg` is the input's `<label>` in the input shape) |         |
| `.uip-ask-form` / `-input`                                 | input-shape parts                                              |         |
| `.uip-ask.is-leaving`                                      | fade-out state class                                           |         |
| `.uip-ask-ok.is-destructive`                               | destructive emphasis on the OK button                          |         |

The fade and backdrop dim ride the shared `--uip-dialog-leave-duration` /
`--uip-dialog-leave-easing` / `--uip-backdrop` tokens (see the README's CSS
contract and [dialog](dialog.md)).

## Notes

- Renders a native `<dialog class="uip-ask">`, labelled by its title (`aria-labelledby`) and described by its message body (`aria-describedby`), or labelled by the message when there is no title. `showModal()` provides the focus trap and focus restoration.
- `variant: "destructive"` upgrades it to `role="alertdialog"` and adds `is-destructive` to the OK button for skinning; on a boolean ask it also focuses **Cancel** (so a keyboard user can't confirm by accident), while an input ask always focuses its input.
- With `input` set, the dialog gains the `.uip-ask--input` modifier, the message becomes the input's `<label>`, and **OK** or **Enter** resolve the input's value **as-is**: an empty submission resolves `""`, distinct from the `null` of a cancellation (trim/empty-to-null mapping is the caller's policy). The input is focused on open with any `initialValue` selected, like `window.prompt`.
- Cancellation is uniform: Cancel, Escape, a backdrop click, or preemption by a newer `ask()` resolve `false` (boolean) / `null` (input). Preemption spans both shapes: one question at a time, whatever its kind.
