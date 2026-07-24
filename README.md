# ui-primitives

[![npm](https://img.shields.io/npm/v/@cplieger/ui-primitives)](https://www.npmjs.com/package/@cplieger/ui-primitives)
[![JSR](https://jsr.io/badges/@cplieger/ui-primitives)](https://jsr.io/@cplieger/ui-primitives)
[![Test coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/cplieger/ui-primitives/badges/coverage.json)](https://github.com/cplieger/ui-primitives/actions/workflows/coverage.yml)
[![Mutation (TS)](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/cplieger/ui-primitives/badges/mutation-ts.json)](https://github.com/cplieger/ui-primitives/issues?q=label%3Astryker-tracker)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13489/badge)](https://www.bestpractices.dev/projects/13489)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/cplieger/ui-primitives/badge)](https://scorecard.dev/viewer/?uri=github.com/cplieger/ui-primitives)

> Headless browser UI primitives: behavior, accessibility, DOM, and a documented CSS contract. You bring the skin.

`@cplieger/ui-primitives` is a small, dependency-light library of common browser
UI primitives. Each primitive ships the **behavior**, the **ARIA/accessibility
wiring**, the **DOM structure**, and a **documented CSS class / custom-property
contract**, but no visual skin. Colors, radii, fonts, shadows, and spacing are
yours: define the `--uip-*` custom properties (or target the `.uip-*` classes
directly) and the primitive looks like your app.

Built on [`@cplieger/reactive`](https://github.com/cplieger/reactive) (uses its
`el` DOM factory). ESM-only, published as TypeScript source to npm and JSR.

## Install

```sh
npm i @cplieger/ui-primitives
# or
npx jsr add @cplieger/ui-primitives
```

Requires TypeScript ≥ 6 and a bundler that resolves ESM + TS source (the
package ships TS source, so your compiler typechecks it, and its
`@cplieger/reactive` dependency, under your own flags). `@cplieger/reactive`
is a runtime dependency and is installed automatically.

## The skin-vs-behavior split

This library is **headless**. It gives you:

- **Behavior**: timers, queues, focus management, delegated listeners, state machines.
- **Accessibility**: roles, `aria-*` wiring, live regions, focus order, keyboard handling.
- **DOM**: the elements, with stable, namespaced classes and state classes.
- **A base stylesheet**: `css/ui-primitives.css`, structural + motion rules only, keyed off `--uip-*` custom properties.

It does **not** give you a skin: no colors, borders, radii, fonts, or shadows.
You provide those in one of two ways:

1. **Define `--uip-*` custom properties** for anything the base stylesheet reads (durations, offsets, z-indices, the backdrop dim), and
2. **Write your own rules against the `.uip-*` classes** for the visual look (background, color, border, radius, padding, typography).

Everything the library owns is namespaced so it never collides with your app's
vocabulary:

- classes: `uip-*` (e.g. `.uip-toast`, `.uip-tooltip`)
- custom properties: `--uip-*` (e.g. `--uip-toast-duration`)
- trigger attributes: `data-uip-*` (e.g. `data-uip-tooltip`)
- state classes: `is-*` within the namespace (e.g. `.uip-toast.is-entering` / `.is-shown` / `.is-leaving`)

Load the base stylesheet once, then layer your skin:

```ts
import "@cplieger/ui-primitives/css";
```

```css
/* your skin */
:root {
  --uip-toast-duration: 5000ms;
}
.uip-toast {
  background: #1e1e1e;
  color: #fff;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.uip-toast-progress {
  --uip-toast-progress-color: #4ade80;
}
```

## Quick start

```ts
import { toast } from "@cplieger/ui-primitives/toast";
import { ask } from "@cplieger/ui-primitives/ask";
import { initTooltips } from "@cplieger/ui-primitives/tooltip";
import { createTheme } from "@cplieger/ui-primitives/theme";
import "@cplieger/ui-primitives/css";

initTooltips();
const theme = createTheme({ storageKey: "app-theme" });

toast.success("Saved");

if (await ask("Delete this file?", { variant: "destructive" })) {
  // ...
}
```

## Primitives

Each primitive is importable from its own subpath
(`@cplieger/ui-primitives/<name>`) or from the barrel
`@cplieger/ui-primitives`; the base stylesheet is
`@cplieger/ui-primitives/css`. Each reference page carries the primitive's
usage, full API, its own CSS classes and custom properties, and behavior
caveats.

| Primitive       | What it does                                                                             | Reference                                          |
| --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| toast           | Stacked, queued, auto-dismissing notifications with a shared default singleton           | [docs/toast.md](docs/toast.md)                     |
| tooltip         | Delegated, attribute-driven tooltips with cold/warm delay grouping                       | [docs/tooltip.md](docs/tooltip.md)                 |
| popover         | Anchored floating panel with a placement engine; the substrate for menus and pickers     | [docs/popover.md](docs/popover.md)                 |
| popup           | The reveal + light-dismiss lifecycle without placement, for in-flow panels               | [docs/popup.md](docs/popup.md)                     |
| dialog          | Behavior helpers for native `<dialog>` elements you already have                         | [docs/dialog.md](docs/dialog.md)                   |
| modal           | A modal built from your content on a native `<dialog>`, with ARIA wiring and scroll-lock | [docs/modal.md](docs/modal.md)                     |
| ask             | The Promise-shaped question dialog replacing `window.confirm` and `window.prompt`        | [docs/ask.md](docs/ask.md)                         |
| disclosure      | Animated collapsible region per the WAI-ARIA disclosure pattern                          | [docs/disclosure.md](docs/disclosure.md)           |
| focus-trap      | Tab/Shift+Tab focus containment with focus restoration                                   | [docs/focus-trap.md](docs/focus-trap.md)           |
| roving-focus    | Roving-tabindex arrow-key navigation for composite widgets                               | [docs/roving-focus.md](docs/roving-focus.md)       |
| theme           | Persisted tri-state theme (light/dark/system) with anti-FOUC init snippets               | [docs/theme.md](docs/theme.md)                     |
| view-transition | Queued, feature-detected wrapper over `document.startViewTransition`                     | [docs/view-transition.md](docs/view-transition.md) |
| announce        | Screen-reader announcements through shared ARIA live regions                             | [docs/announce.md](docs/announce.md)               |
| skeleton        | Anti-flicker timing for loading skeletons                                                | [docs/skeleton.md](docs/skeleton.md)               |

## CSS contract

Import the base once: `import "@cplieger/ui-primitives/css";`. It sets only
structure + motion. Define `--uip-*` properties (globally in `:root` or
scoped) to tune behavior, and style the `.uip-*` classes for your skin. Each
primitive's own classes, state classes, and custom properties are documented
on its reference page; the tokens below are shared across primitives.

| Property         | Default                  | Used by                                                                |
| ---------------- | ------------------------ | ---------------------------------------------------------------------- |
| `--uip-backdrop` | `oklch(0% 0 0deg / 50%)` | dialog / ask backdrop dim (and the default for `--uip-modal-backdrop`) |

Every motion property is a **duration + easing** pair: the `--uip-*-easing`
timing functions default to `ease` (the toast progress bar to `linear`) and
are overridable exactly like the durations.

Base-layer stacking is a fixed ladder: `--uip-z-popover` (`1100`) sits below
`--uip-z-toast` (`9999`) and `--uip-z-tooltip` (`10000`); a modal `<dialog>`
lives in the browser's top layer and renders above all of them.

A `@media (prefers-reduced-motion: reduce)` block neutralizes the animations to
near-zero (not zero, so `transitionend`/`animationend` still fire and the leave
lifecycles complete).

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
conventions and how to run the checks locally.

## Disclaimer

This project is built with care and follows security best practices, but it is intended for personal / self-hosted use. No guarantees of fitness for production environments. Use at your own risk.

This project was built with AI-assisted tooling using [Claude](https://claude.com), [GPT](https://openai.com), and [Kiro](https://kiro.dev). The human maintainer defines architecture, supervises implementation, and makes all final decisions.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
