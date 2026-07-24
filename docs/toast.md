# toast

`@cplieger/ui-primitives/toast`

Stacked, queued, auto-dismissing notifications, with a shared default
singleton.

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

**Embedding (`container`) and latest-wins (`mode: "replace"`).** `container`
confines the stack to a widget's own root instead of `document.body` (a host
`transform`/`contain` becomes the fixed-position containing block, scoping the
stack to the widget). `mode: "replace"` gives single-slot latest-wins
semantics: a new toast instantly replaces the visible one, nothing queues; the
right shape for transient widget feedback ("Copied") where a queue of stale
messages would be wrong.

```ts
const widgetToast = createToaster({ container: widgetRoot, mode: "replace" });
widgetToast.info("Copied");
```

## API

- `toast: Toaster`: the default shared toaster. `info` / `success` / `error` are the same methods as free functions.
- `Toaster.show(message, opts?)` → returns a `() => void` dismiss function.
- `Toaster.info(msg)` / `success(msg)` / `error(msg, retry?)` / `clear()` / `dispose()`.
- `createToaster(opts?: ToasterOptions)`: an isolated instance. Call `dispose()` when the owning component unmounts. (The shared `toast` singleton lives for the app's lifetime and is never disposed.)
- `ToasterOptions` = `{ maxVisible?; maxQueue?; defaultDuration?; container?: HTMLElement; mode?: "stack" | "replace" }`.
- `ToastOptions` = `{ level?: "info" | "success" | "error"; duration?: number; retry?: ToastRetry }` (`duration: 0` = sticky).
- `ToastRetry` = `{ label?: string; onClick: () => void | Promise<void> }` (async rejections + sync throws are caught and logged).

## CSS

| Property / class                                           | Description                                                    | Default        |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| `--uip-z-toast`                                            | toast stack z-index                                            | `9999`         |
| `--uip-toast-offset`                                       | toast stack inset from the viewport edge                       | `1rem`         |
| `--uip-toast-gap`                                          | gap between stacked toasts                                     | `0.5rem`       |
| `--uip-toast-max-width`                                    | toast stack max inline size                                    | `24rem`        |
| `--uip-toast-enter-duration`                               | toast enter transition                                         | `250ms`        |
| `--uip-toast-enter-easing`                                 | toast enter easing (timing function)                           | `ease`         |
| `--uip-toast-leave-duration`                               | toast leave transition                                         | `150ms`        |
| `--uip-toast-leave-easing`                                 | toast leave easing                                             | `ease`         |
| `--uip-toast-duration`                                     | progress-bar duration; **set inline per toast by the library** | `4000ms`       |
| `--uip-toast-easing`                                       | progress-bar easing (timing function)                          | `linear`       |
| `--uip-toast-progress-size`                                | progress-bar thickness                                         | `2px`          |
| `--uip-toast-progress-color`                               | progress-bar color                                             | `currentcolor` |
| `.uip-toast-stack`                                         | toast container (visual only, not a live region)               |                |
| `.uip-toast`, `.uip-toast--info` / `--success` / `--error` | a toast (level modifier)                                       |                |
| `.uip-toast-msg`                                           | toast message text                                             |                |
| `.uip-toast-retry`                                         | toast retry button                                             |                |
| `.uip-toast-progress`                                      | toast countdown bar (`aria-hidden`)                            |                |

State classes toggled at runtime: the `.uip-toast` lifecycle is `is-entering` →
`is-shown` → `is-leaving`.

**Countdown contract:** the toast progress bar animates from the
`--uip-toast-duration` custom property, which the library writes inline on each
timed toast element. Do not set `transition-duration`/`animation-duration`
inline for the progress bar; override the timing by supplying the toast's
duration in code, and style the bar's color/size via the properties above.

## Notes

- Up to `maxVisible` (default 3) show at once; the rest queue (cap `maxQueue`, default 20, dropping the oldest).
- `info`/`success` auto-dismiss after 4s; `error` is sticky.
- Hover or focus pauses the countdown; it resumes only once both the hover and the focus have ended (so a focused toast never auto-dismisses under the cursor).
- Click or press **Escape** (newest first) to dismiss; each toast is keyboard-focusable (`tabindex="0"`), and a focused toast can also be dismissed with **Enter** or **Space**.
- Each toast is announced through the shared `announce()` live region (`error` interrupts with **assertive** urgency; `info`/`success` are **polite**), and a visually-hidden "Click to dismiss." hint keeps a focused toast self-describing.
- Importing the module has no DOM side effect: the stack is created lazily on the first toast shown.
- Toasts mount on `document.body`, except while a modal `<dialog>` is open: `showModal()` inerts everything outside the dialog subtree, so the default stack auto-hosts into the topmost open modal dialog. Toasts raised while a modal is open show over it, stay clickable, and are still announced; the stack returns to `document.body` when the modal closes. A toaster created with an explicit `container` is pinned to it and never auto-hosts.
