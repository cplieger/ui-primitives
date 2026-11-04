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

- `mountLiveRegions(host)` mounts the page's root pair of live regions, one polite and one assertive, as the last children of `host`, and makes `host` the root. Calling it again on the same host keeps the pair it has. It returns a `release()` function, which you may ignore for a page-long root. Calling `release()` ends that mount and hands the root back to the newest mount still held. The pair leaves `host` when its last owner releases it. A dialog that [dialog](dialog.md), [modal](modal.md) or [ask](ask.md) drives keeps its pair, so on such a host the pair stays. Calling `release()` again does nothing.
- `announce(message, politeness?)` announces a message. `polite`, the default, and `assertive` use separate regions. The assertive region has `role="alert"` and interrupts.

## CSS

| Property / class | Description | Default |
| --- | --- | --- |
| `.uip-visually-hidden` | the live regions (sr-only) | |

## Notes

- `announce` never creates or moves a region. Screen readers can miss a region that is inserted or moved in the same change that fills it, so every region exists before its first message. With no region mounted, `announce` does nothing.
- `showModal()` makes everything outside the topmost modal dialog inert, and the browser leaves inert regions out of the accessibility tree, so a root region is silent while a modal is open. Each dialog that [dialog](dialog.md), [modal](modal.md) or [ask](ask.md) drives has its own pair from the first call that reaches it. While any of those dialogs is open as a modal, an announcement is written to the pair of each of them and to the root pair, and screen readers hear only the one in the topmost modal, whatever order the dialogs opened in or sit in the document. With no modal open, it is written to the root pair alone, because every open dialog is in the accessibility tree then and a second copy would be read twice.
- An announcement's text stays in its regions until a modal closes, opens again or leaves the document, wherever the page has moved it. Then every region `announce` wrote is emptied before the browser exposes any of them, so a region that comes into view is empty. The pair still exposed is emptied too, which a listener does not hear, because removing text from a live region is not announced. This holds for a modal that was open when the text landed and for one opened after. Browsers can read an alert region again when it is exposed, so an old message would otherwise be read again at each close.
- A modal your own code opened with `showModal()` on a dialog no helper or controller drives has no pair, so announcements made while it is on top are lost. Its close or removal empties the regions as any other modal's does, unless the dialog sits in a shadow root the helpers never reached. The helpers cannot see such a dialog, so its close can expose the last message again.
- A repeated identical message is announced again, because the region is cleared and the text is set again 100ms later. A second message at the same politeness within those 100ms replaces the first. If a modal closes during the 100ms, the message lands on time in the regions still written to. If a modal opens, the delay starts over, so the new modal's region is cleared before the text is set.
