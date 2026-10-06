# announce

`@cplieger/ui-primitives/announce`

Updates a shared, visually hidden ARIA live region so screen readers announce the message.

## Usage

```ts
import { announce } from "@cplieger/ui-primitives/announce";

announce("5 results found"); // polite
announce("Connection lost", "assertive");
```

## API

- `announce(message, urgency?)` announces a message. `polite`, the default, and `assertive` use separate regions.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `.uip-visually-hidden` | the announce live regions (sr-only) | |

## Notes

- A repeated identical message is announced again, because the region is cleared and the text is set again 100ms later.
- While a modal `<dialog>` is open, each announcement moves the region into it, because content outside the dialog is inert and silent to assistive technology. The next announcement after the dialog closes moves it back to `document.body`.
