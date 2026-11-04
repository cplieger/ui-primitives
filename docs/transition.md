# transition

`@cplieger/ui-primitives/transition`

Runs one CSS transition on an element and calls you back once it ends. The primitives' fades follow the same settle rule.

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

- `runTransition(el, spec)` reads `spec.change` and `spec.settled` once, before it does anything. It flushes the element's current style, runs `change`, then runs `settled` once. Whatever you wrote before the call is the state it animates from. A `cancelTransition` or `runTransition` on the same element from inside `change` takes the element, and this call then arms nothing. Without `settled`, nothing stays pending. A throw from `change` arms nothing and propagates.
- `TransitionSpec` = `{ change: () => void; settled?: () => void }`.
- `cancelTransition(el)` drops the settle pending on `el` without running it. It does nothing when none is pending. The primitives' fades do not go through `runTransition`, so `cancelTransition` on an element a controller drives does not touch that controller.

## Notes

- `settled` runs on the first `transitionend` fired at the element itself, so a transition ending on a child does not count.
- When no transition starts, `settled` runs after 400ms. A transition you skin longer than 400ms is cut short at that point.
- A new `runTransition` on the same element drops the settle the previous one left pending.
