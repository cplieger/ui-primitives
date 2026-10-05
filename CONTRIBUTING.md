# Contributing to ui-primitives

The [shared rules](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md) for commits, releases, synced files and checks apply here.

## Rules

Adding, renaming or removing a primitive touches four places:

- Its named re-exports in the barrel, `src/index.ts`.
- Its subpath in the `exports` of both `package.json` and `jsr.json`. A subpath in only one of them is missing on the other registry.
- Its reference page, `docs/<subpath>.md`, shaped like the other pages.
- Its line in the README's `## API` list.

When the change adds, renames or removes a shared `--uip-*` token, also update the README's `## CSS contract`. The barrel re-exports by name, so a new or renamed export of an existing primitive also needs its line there.

Build every DOM node with `el` from `@cplieger/reactive`, never with `innerHTML` or another HTML string. Caller text such as a toast message then stays text, and a page that enforces Trusted Types does not throw.

Animate a state change with `runTransition` from `src/transition.ts`, never with a hand-written style flush. A missing or misplaced flush lets the browser merge the start and end states into one frame, so nothing animates.

While a modal `<dialog>` is open, chrome that must stay usable lives inside it. `showModal()` makes everything outside the dialog's subtree inert, whatever its `z-index`.

The toast stack, announce regions and tooltips already move into an open modal. A popup panel moves in only when it is not yet in the page, and a panel the caller connected stays where the caller put it.

Relative imports end in `.js`, as in `./focus-trap.js`, although the files are `.ts`. Consumers compile this source with their own settings, and under `node16` or `nodenext` resolution an extensionless relative import does not resolve.
