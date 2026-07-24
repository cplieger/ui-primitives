# focus-trap

`@cplieger/ui-primitives/focus-trap`

Tab/Shift+Tab focus containment for a container, with focus restoration on
release, per the WAI-ARIA dialog pattern.

## Usage

```ts
import { trapFocus } from "@cplieger/ui-primitives/focus-trap";

const release = trapFocus(dialogEl, { returnFocus: true });
// ... interaction ...
release(); // restores focus to the previously-focused element
```

## API

- `trapFocus(container, opts?)` → a release function.
- `FocusTrapOptions` = `{ initialFocus?: HTMLElement | null; returnFocus?: boolean | HTMLElement }`.

## Notes

- Tab / Shift+Tab cycle within the container (wrapping at the edges).
- On entry, `initialFocus` (or the first visible focusable element) is focused.
- `release()` restores focus to the element focused before the trap, to an explicit `returnFocus` element, or leaves focus alone when `returnFocus` is `false`.
