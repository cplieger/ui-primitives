# ask

`@cplieger/ui-primitives/ask`

The Promise-shaped question dialog. It is the styled, non-blocking replacement for both `window.confirm` and `window.prompt`.

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

- `ask(message, opts?)` returns `Promise<boolean>`. With `input` set it returns `Promise<string | null>`, and the overloads narrow the return type from the options shape.
- `AskOptions` = `{ title?; confirmLabel?; cancelLabel?; variant?: "normal" | "destructive"; input?: AskInput | true }`.
- `AskInput` = `{ type?: "text" | "password"; initialValue?; placeholder?; maxLength?; autocomplete? }`. `input: true` gives a default text input.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `.uip-ask`, `.uip-ask--input` | the ask `<dialog>` (input-shape modifier) | |
| `.uip-ask-title` / `-msg` / `-actions` / `-ok` / `-cancel` | ask parts (`-msg` is the input's `<label>` in the input shape) | |
| `.uip-ask-form` / `-input` | input-shape parts | |
| `.uip-ask.is-leaving` | fade-out state class | |
| `.uip-ask-ok.is-destructive` | destructive emphasis on the OK button | |

The fade and the backdrop dim use the shared `--uip-dialog-leave-duration`, `--uip-dialog-leave-easing` and `--uip-backdrop` tokens. See the README's CSS contract and [dialog](dialog.md).

## Notes

- `ask()` renders a native `<dialog class="uip-ask">`. Its title labels it (`aria-labelledby`) and its message body describes it (`aria-describedby`). With no title, the message labels it. `showModal()` provides the focus trap and focus restoration.
- `variant: "destructive"` sets `role="alertdialog"` and adds `is-destructive` to the OK button for skinning. On a boolean ask it also focuses Cancel, so a keyboard user cannot confirm by accident. An input ask always focuses its input.
- With `input` set, the dialog gains the `.uip-ask--input` modifier and the message becomes the input's `<label>`. OK or Enter resolve the input's value as it is. An empty submission resolves `""`, which is distinct from the `null` of a cancellation, and trimming or mapping empty to `null` is the caller's choice. The input is focused on open with any `initialValue` selected, like `window.prompt`.
- Cancellation works the same way everywhere. Cancel, Escape, a backdrop click, or a newer `ask()` resolve `false` for a boolean ask and `null` for an input ask. A newer `ask()` replaces an open one of either shape, so one question shows at a time.
