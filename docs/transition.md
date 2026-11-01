# transition

`@cplieger/ui-primitives/transition`

Runs one CSS transition on an element and calls you back once it ends. Every primitive's fade-out uses it.

## Usage

```ts
import { runTransition, cancelTransition } from "@cplieger/ui-primitives/transition";

runTransition(panel, {
  change: () => panel.classList.add("is-leaving"),
  settled: () => panel.remove(),
});

// Reopened mid-fade: drop the pending settle without running it.
cancelTransition(panel);
```

## API

- `runTransition(el, spec)` flushes the element's current style, runs `spec.change`, then runs `spec.settled` once. Whatever you wrote before the call is the state it animates from.
- `TransitionSpec` = `{ change: () => void; settled?: () => void }`.
- `cancelTransition(el)` drops the settle pending on `el` without running it. It does nothing when none is pending.

## Notes

- `settled` runs on the first `transitionend` fired at the element itself, so a transition ending on a child does not count.
- When no transition starts, `settled` runs after 400ms. A transition you skin longer than 400ms is cut short at that point.
- A new `runTransition` on the same element drops the settle the previous one left pending.
