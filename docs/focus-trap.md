# focus-trap

`@cplieger/ui-primitives/focus-trap`

Tab and Shift+Tab focus containment for a container, with focus restored on release, per the WAI-ARIA dialog pattern.

## Usage

```ts
import { trapFocus } from "@cplieger/ui-primitives/focus-trap";

const release = trapFocus(dialogEl, { returnFocus: true });
// ... interaction ...
release(); // restores focus to the previously-focused element
```

## API

- `trapFocus(container, opts?)` returns a release function.
- A trap made under a `@cplieger/reactive` owner, such as `createRoot`, a `bindList` row or an effect created under one, ends with that owner as `release()` would, and a later `release()` does nothing. Setup and `release()` run untracked, never under that owner. When the owner ends a trap, the handlers its teardown reaches run inside reactive's disposal, where creating an effect throws.
- A `release()` from code the trap is calling, such as a focus handler its initial focus reaches, ends the trap at once, and its teardown completes as soon as your code returns.
- `FocusTrapOptions` = `{ initialFocus?: HTMLElement | null; returnFocus?: boolean | HTMLElement }`.

## Notes

- Tab and Shift+Tab cycle within the container and wrap at the edges.
- On entry, `initialFocus` is focused, or the first visible focusable element when it is unset.
- `release()` restores focus to the element focused before the trap, to an explicit `returnFocus` element, or leaves focus alone when `returnFocus` is `false`.
