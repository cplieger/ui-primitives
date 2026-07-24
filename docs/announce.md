# announce

`@cplieger/ui-primitives/announce`

Updates a shared visually-hidden ARIA live region so screen readers announce
the message.

## Usage

```ts
import { announce } from "@cplieger/ui-primitives/announce";

announce("5 results found"); // polite
announce("Connection lost", "assertive");
```

## API

- `announce(message, urgency?)`: `polite` (default) and `assertive` use separate regions.

## CSS

| Property / class       | Description                         | Default |
| ---------------------- | ----------------------------------- | ------- |
| `.uip-visually-hidden` | the announce live regions (sr-only) |         |

## Notes

- Repeated identical messages still announce.
- While a modal `<dialog>` is open, the region is re-homed into it at announce time (content outside the dialog subtree is inert and silent to assistive technology), then back to `document.body` on the next announce after it closes.
