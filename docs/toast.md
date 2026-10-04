# toast

`@cplieger/ui-primitives/toast`

Stacked, queued, auto-dismissing notifications, with a shared default toaster.

## Usage

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

Two options suit a toaster embedded in a widget. `container` keeps the stack inside the widget's own root instead of `document.body`. A host with `transform` or `contain` becomes the containing block for the fixed-position stack, which scopes the stack to the widget. `mode: "replace"` keeps one toast at a time, latest wins. A new toast replaces the visible one at once and nothing queues, which suits short feedback such as "Copied", where a queue of stale messages would be wrong.

```ts
const widgetToast = createToaster({ container: widgetRoot, mode: "replace" });
widgetToast.info("Copied");
```

## API

- `toast: Toaster` is the default shared toaster. `info`, `success` and `error` are the same methods as free functions.
- `Toaster.show(message, opts?)` returns a `() => void` dismiss function.
- `Toaster.info(msg)`, `success(msg)`, `error(msg, retry?)`, `clear()` and `dispose()`.
- `createToaster(opts?: ToasterOptions)` builds an isolated instance. Call `dispose()` when the owning component unmounts. The shared `toast` lives for the app's lifetime and is never disposed.
- `ToasterOptions` = `{ maxVisible?; maxQueue?; defaultDuration?; container?: HTMLElement; mode?: "stack" | "replace" }`.
- `ToastOptions` = `{ level?: "info" | "success" | "error"; duration?: number; retry?: ToastRetry }`. A `duration` of `0` makes the toast sticky.
- `ToastRetry` = `{ label?: string; onClick: () => void | Promise<void> }`. A rejected promise or a thrown error from `onClick` is caught and logged.

## CSS

| Property / class                                           | Description                                                    | Default        |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| `--uip-z-toast`                                            | toast stack z-index                                            | `9999`         |
| `--uip-toast-offset`                                       | toast stack inset from the viewport edge                       | `1rem`         |
| `--uip-toast-gap`                                          | gap between stacked toasts                                     | `0.5rem`       |
| `--uip-toast-row-gap`                                      | gap between a toast's message and its action row               | `0.5rem`       |
| `--uip-toast-max-width`                                    | toast stack max inline size                                    | `24rem`        |
| `--uip-toast-enter-duration`                               | toast enter transition                                         | `250ms`        |
| `--uip-toast-enter-easing`                                 | toast enter easing (timing function)                           | `ease`         |
| `--uip-toast-leave-duration`                               | toast leave transition                                         | `150ms`        |
| `--uip-toast-leave-easing`                                 | toast leave easing                                             | `ease`         |
| `--uip-toast-duration`                                     | progress-bar duration, set inline on each toast by the library | `4000ms`       |
| `--uip-toast-easing`                                       | progress-bar easing (timing function)                          | `linear`       |
| `--uip-toast-progress-size`                                | progress-bar thickness                                         | `2px`          |
| `--uip-toast-progress-color`                               | progress-bar color                                             | `currentcolor` |
| `.uip-toast-stack`                                         | toast container (visual only, not a live region)               |                |
| `.uip-toast`, `.uip-toast--info` / `--success` / `--error` | a toast (level modifier)                                       |                |
| `.uip-toast-msg`                                           | toast message text                                             |                |
| `.uip-toast-retry`                                         | toast retry button                                             |                |
| `.uip-toast-progress`                                      | toast countdown bar (`aria-hidden`)                            |                |

The library moves each `.uip-toast` through three state classes at runtime: `is-entering`, then `is-shown`, then `is-leaving`.

A toast is a flex column. The message takes the first row, and the retry button takes a row of its own at the inline end, separated by `--uip-toast-row-gap`. Style the button freely, but do not give it a margin to separate it from the message, because the gap owns that spacing. Both rows sit above the countdown bar, so a skin needs no stacking rule of its own.

The progress bar animates from the `--uip-toast-duration` custom property, which the library writes inline on each timed toast. Do not set `transition-duration` or `animation-duration` inline on the bar. Change the timing by passing the toast's duration in code, and style the bar's color and size with the properties above.

## Notes

- Up to `maxVisible` toasts show at once, 3 by default. The rest queue up to `maxQueue`, 20 by default, and the oldest queued toast drops first.
- `info` and `success` auto-dismiss after 4s. `error` stays until dismissed.
- Hover or focus pauses the countdown. It resumes only once both the hover and the focus have ended, so a focused toast never auto-dismisses under the cursor.
- A click dismisses a toast, and Escape dismisses the newest first. Each toast is keyboard-focusable (`tabindex="0"`), and Enter or Space dismisses a focused toast.
- Each toast is announced through the shared `announce()` live region. `error` interrupts with assertive urgency, and `info` and `success` are polite. A visually hidden "Click to dismiss." hint keeps a focused toast self-describing.
- Importing the module has no DOM side effect. The stack is created on the first toast shown.
- Toasts mount on `document.body`, except while a modal `<dialog>` is open. `showModal()` makes everything outside the dialog inert, so the default stack moves into the topmost open modal dialog. Toasts raised while a modal is open show over it, stay clickable and are still announced. The stack returns to `document.body` when the modal closes. A toaster created with an explicit `container` stays in it and never moves.
