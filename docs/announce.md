# announce

`@cplieger/ui-primitives/announce`

Speaks a message to screen readers through visually hidden ARIA live regions that are mounted before anything is announced.

## Usage

```ts
import { announce, mountLiveRegions } from "@cplieger/ui-primitives/announce";

// Once at boot, before the first render:
mountLiveRegions(document.body);

announce("5 results found"); // polite
announce("Connection lost", "assertive");
```

## API

- `mountLiveRegions(host)` mounts the page's root pair of live regions, one polite and one assertive, as the last children of `host`, and makes `host` the root. Calling it again on the same host keeps the pair it has. It returns a `release()` function, which you may ignore for a page-long root. Calling `release()` ends that mount and hands the root back to the newest mount still held. The pair leaves `host` when its last owner releases it, and a dialog open on `host` is an owner too. Calling `release()` again does nothing.
- `announce(message, politeness?)` announces a message. `polite`, the default, and `assertive` use separate regions. The assertive region has `role="alert"` and interrupts.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `.uip-visually-hidden` | the live regions (sr-only) | |

## Notes

- `announce` never creates or moves a region. Screen readers can miss a region that is inserted or moved in the same change that fills it, so every region exists before its first message. With no region mounted, `announce` does nothing.
- `showModal()` makes everything outside the dialog inert, so a root region is silent while a modal is open. Each dialog that [dialog](dialog.md), [modal](modal.md) or [ask](ask.md) opens mounts its own pair before `showModal()`. An announcement goes to the pair of the dialog opened last that is still open, else to the root pair, whatever the dialogs' order in the document. When that dialog closes, the next announcement goes to the dialog opened before it, then to the root.
- A repeated identical message is announced again, because the region is cleared and the text is set again 100ms later. A second message at the same politeness within those 100ms replaces the first. If a dialog opens or closes during the 100ms, the message goes to the region that is live once it lands.
