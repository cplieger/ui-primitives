# skeleton

`@cplieger/ui-primitives/skeleton`

Anti-flicker timing for a "show a skeleton, then replace it with content" load.
Pure timing, no DOM: you paint the skeleton and the content; it owns **when**.
Two flickers are avoided: a fast load never paints the skeleton at all
(show-delay), and a painted skeleton never instantly vanishes (opt-in
min-visible).

## Usage

```ts
import { skeletonTiming } from "@cplieger/ui-primitives/skeleton";

// commit-style: the content render replaces the skeleton in place.
const t = skeletonTiming(() => paint(out, skeletonRows()), {
  minVisibleMs: 300,
  signal, // suppresses a not-yet-painted skeleton if the load is aborted
});
const data = await load(signal);
t.commit(() => paint(out, rows(data)));

// teardown-style: the skeleton is its own element, removed on settle.
const s = skeletonTiming(() => {
  const node = makeSkeleton();
  list.append(node);
  return () => node.remove(); // the show callback may return a teardown
});
await load();
s.cancel(); // clears a pending skeleton, or tears down a painted one
```

## API

- `skeletonTiming(show, opts?)` → `{ commit(render); cancel() }`.
- `SkeletonTimingOptions` = `{ showDelayMs? (150); minVisibleMs? (0); signal? }`.

## Notes

- `commit(render)` paints the content: immediately when the skeleton never painted, else after min-visible has elapsed, running the `show` teardown (if any) right before the render.
- `cancel()` abandons the load: it clears a pending skeleton, tears down a painted one, and drops a commit render still deferred by min-visible.
- Both are idempotent; the first settle wins.
- The `signal` only suppresses a skeleton that has not painted yet; it never retracts one, and a `commit` render always runs (guard your own render closure for stale-sensitive results).
- Keep `minVisibleMs` at 0 when the skeleton shares its container with the real content and must clear the instant the load completes.
