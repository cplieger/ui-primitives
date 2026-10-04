# skeleton

`@cplieger/ui-primitives/skeleton`

Timing for a load that shows a skeleton placeholder and then replaces it with content, so neither flickers. It is pure timing with no DOM. You paint the skeleton and the content, and it decides when. A fast load never paints the skeleton, because of a show delay. An opt-in minimum keeps a painted skeleton from vanishing the instant it appears.

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

- `skeletonTiming(show, opts?)` returns `{ commit(render); cancel() }`.
- `SkeletonTimingOptions` = `{ showDelayMs?; minVisibleMs?; signal? }`, with defaults of 150 for `showDelayMs` and 0 for `minVisibleMs`.

## Notes

- `commit(render)` paints the content. It runs at once when the skeleton never painted, and otherwise after the minimum visible time has passed. Any teardown `show` returned runs right before the render.
- `cancel()` abandons the load. It clears a pending skeleton, tears down a painted one, and drops a commit render still waiting on the minimum visible time.
- Both are idempotent, and the first one called wins.
- The `signal` only stops a skeleton that has not painted yet. It never removes a painted one, and a `commit` render always runs, so guard your own render closure against stale results.
- Keep `minVisibleMs` at 0 when the skeleton shares its container with the real content and must clear the instant the load completes.
