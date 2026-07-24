# view-transition

`@cplieger/ui-primitives/view-transition`

A queued, feature-detected wrapper over `document.startViewTransition`.

## Usage

```ts
import { viewTransition } from "@cplieger/ui-primitives/view-transition";

await viewTransition(() => {
  swapTheDom();
});
```

## API

- `viewTransition(fn)` → a promise that resolves when the transition (or the direct run) finishes.

## Notes

- Overlapping calls serialize so transitions never visually overlap.
- When the API is unavailable the callback runs directly.
- A skipped/cancelled transition resolves rather than rejects.
