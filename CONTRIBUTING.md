# Contributing to ui-primitives

`@cplieger/ui-primitives` is a dependency-light, vanilla-TypeScript library of
headless browser UI primitives, published to both npm and JSR as TypeScript
source. This guide covers the bits that aren't obvious from reading the source.
For org-wide defaults not repeated here, see the
[fallback contributing guide](https://github.com/cplieger/.github/blob/main/CONTRIBUTING.md).

## Architecture

Each primitive is a focused module under `src/`, paired with a colocated
`*.test.ts`. The one runtime dependency is
[`@cplieger/reactive`](https://github.com/cplieger/reactive): its `el` factory
builds every DOM node (CSP-safe, no `innerHTML`).

- `view-transition.ts`: queued, feature-detected wrapper over `document.startViewTransition`.
- `focus-trap.ts`: Tab/Shift+Tab containment per the WAI-ARIA dialog pattern.
- `roving-focus.ts`: WAI-ARIA roving-tabindex keyboard navigation for composite widgets.
- `announce.ts`: shared visually-hidden ARIA live regions.
- `theme.ts`: persisted tri-state theme + a paint-time init-snippet string generator.
- `dialog.ts`: native `<dialog>` backdrop/Escape dismissal + fade-out lifecycle.
- `modal.ts`: native-`<dialog>` modal built from caller content (the sibling to `dialog`, which wraps an existing element).
- `ask.ts`: the Promise-shaped question dialog replacing `confirm` and `prompt` (native `<dialog>` + `showModal()`; composes `dialog`).
- `tooltip.ts`: one delegated tooltip controller.
- `popover.ts`: anchored floating panel + the placement engine under it; layers placement on `popup-core` through its hooks seam.
- `popup.ts`: reveal + light-dismiss lifecycle without placement; a hook-less facade over `popup-core`.
- `popup-core.ts`: INTERNAL lifecycle core shared by popup and popover (not a subpath export). One reveal + light-dismiss implementation, two public shapes.
- `modal-host.ts`: INTERNAL helper (not a subpath export) resolving the open `<dialog>` that page-level chrome (the toast stack, the announce regions) must host into to stay usable while a modal is open.
- `disclosure.ts`: animated collapsible region per the WAI-ARIA disclosure pattern.
- `skeleton.ts`: anti-flicker timing for skeleton loads. Pure timing, no DOM.
- `transition.ts`: shared "run after the CSS transition, or a fallback" helper behind the leave lifecycles.
- `toast/`: the flagship, split three ways:
  - `engine.ts`: a **pure, DOM-free** timer/queue/promotion state machine driven by an injected `ToastView` port. Testable headless.
  - `view.ts`: the DOM implementation of `ToastView` (built with `el`).
    Delegates screen-reader announcement to `announce()` and creates its visual
    `.uip-toast-stack` lazily, so the module has no import-time DOM side effect
    and no live region ever nests inside another.
  - `index.ts`: the public `Toaster` factory + a default singleton.
- `index.ts`: the barrel that re-exports every primitive's public surface.
- `css/ui-primitives.css`: the structural + behavioral base stylesheet.

**Headless boundary (protect this).** The library owns behavior, ARIA, DOM, and
a documented CSS class / custom-property contract, never a skin. Do not add
colors, radii, fonts, shadows, business logic, or app-specific icons. Anything
themeable is a `--uip-*` custom property with a sane default; anything an app
needs to target is a namespaced `.uip-*` class.

## Namespacing (non-negotiable)

Everything the library owns is prefixed so it can never collide with a consuming
app's vocabulary:

- classes → `uip-*`
- custom properties → `--uip-*`
- trigger attributes → `data-uip-*`
- state classes → `is-*` within the namespace (`.uip-toast.is-entering` etc.)

## Public API surface

`src/index.ts` is the whole barrel; each primitive also has its own subpath in
`package.json` `exports` and `jsr.json` `exports`. When you add, rename, or
remove an export:

- re-export it from `src/index.ts`,
- add/adjust its subpath in **both** `package.json` and `jsr.json`,
- update the primitive's reference page in `docs/` (or create one from the
  template below), its row in the README index, and, if it touches CSS, the
  README's global CSS contract.

## Primitive reference pages (docs/)

Each primitive has one reference page at `docs/<subpath>.md` (kebab-case,
matching its subpath: `docs/toast.md`, `docs/roving-focus.md`), linked from its
README index row. The README carries only the index, Quick start, the
skin-vs-behavior contract, and the global CSS tokens; everything
primitive-specific lives on the page. Pages follow this template exactly; omit
a section only when it would be empty:

```markdown
# <primitive>

`@cplieger/ui-primitives/<subpath>`

One paragraph: what it does and when to use it.

## Usage

Minimal working snippet (imports plus the common case). A second snippet only
for a second genuinely common pattern.

## API

The exported functions, options, and returned handles: one-line bullets or a
`| Option | Description | Default |` table (same cell conventions as the
README tables).

## CSS

The classes, state classes, and custom properties this primitive OWNS:
`| Property / class | Description | Default |`. Global `--uip-*` tokens stay
in the README's CSS contract.

## Notes

Behavior caveats a consumer acts on, one line each: focus handling, dismissal
semantics, stacking/hosting, reduced motion, accessibility.
```

Page rules: no Disclaimer/License blocks (the README carries them), relative
links only, prettier owns the formatting, and the delete-by-default bar
applies (behavior contracts yes, implementation mechanics no).

## The CSS contract

`css/ui-primitives.css` is structural/behavioral only and must stay
stylelint-clean under `stylelint-config-standard`. Rules:

- Every themeable value is a `--uip-*` custom property, defined in `:root` with
  a sane default and used with an inline fallback.
- Motion is fully parameterized: each transition/animation exposes both a
  `--uip-*-duration` and a paired `--uip-*-easing`, each with an inline
  fallback; never hard-code a bare `ease` / `linear` in a shorthand.
- No `!important`, no IDs, no named colors, no hex alpha (the config enforces
  all of these).
- The `prefers-reduced-motion` block uses `0.01ms` (not `0`) so `transitionend`
  / `animationend` still fire; this is below `time-min-milliseconds` on purpose,
  hence the single scoped, described `stylelint-disable-next-line`.
- The toast countdown reads `--uip-toast-duration`, which the view sets inline
  per toast; never hard-code the progress timing in CSS.

## Local development

```sh
npm install
npm run typecheck         # tsc -p tsconfig.json (source)
npm run typecheck:tests   # tsc -p tsconfig.test.json (incl. tests)
npm test                  # vitest --run
npm run test:coverage     # vitest --run --coverage
npm run lint:eslint       # strict typed lint
npm run lint:prettier     # prettier --check .
npm run lint:stylelint    # stylelint css/**/*.css
npm run lint:knip         # unused files/exports/deps
```

There is no build step: the package ships TypeScript source directly (npm and
JSR both reference `src/**/*.ts`), so consumers compile it through their own
bundler.

### Resolving `@cplieger/reactive` locally

`@cplieger/reactive` is a published dependency and resolves from the npm
registry via `npm install`. If you are developing against an unpublished
reactive change, overlay the local sibling for dev/test without touching the
publish contract:

```sh
npm install --no-save ../reactive
```

Keep the `^1.2.2` range in `package.json` `dependencies`: that is the publish
contract, independent of any local overlay.

## Conventions and gotchas

- **`.js` import extensions in TypeScript.** Relative imports use a `.js`
  suffix (e.g. `import { trapFocus } from "./focus-trap.js"`) even though the
  files are `.ts`. Required by the `"moduleResolution": "bundler"` ESM setup.
- **Import reactive as a bare specifier:** `import { el } from "@cplieger/reactive"`.
- **Strict compiler.** `tsconfig.json` enables `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, and friends.
  Handle `undefined` explicitly; conditionally spread optional properties rather
  than assigning `undefined`.
- **Strict typed ESLint.** No `any` (prefer `unknown`), inline `import type`,
  `eqeqeq`, `curly`, `prefer-const`. Prefix deliberately-unused names with `_`.
- **Tests are colocated** as `src/**/*.test.ts` (the only pattern vitest
  includes). Pure logic runs in the `node` environment; DOM tests opt in with
  `// @vitest-environment happy-dom` on the first line.
- **Reset module singletons between tests.** `announce`, `ask`, `tooltip`,
  and the default `toast` are module singletons; call their `_resetForTest()`
  (and clear `document.body`) in `afterEach`.
- **happy-dom limits.** happy-dom does no layout (`offsetParent` is `null`,
  `getBoundingClientRect` is zeros) and only partially implements `<dialog>`.
  Stub what you must (e.g. `offsetParent` for focus-trap tests) and keep the
  production guards that make those APIs degrade gracefully.
- **Property-based tests.** `fast-check` drives invariants (e.g. the toast queue
  never exceeds `maxVisible + maxQueue`); keep new invariant coverage in that
  idiom where it fits.
- **Don't edit `.github/workflows/*`** or the synced configs (eslint base,
  prettier/stylelint/htmlvalidate, `cliff.toml`, LICENSE); they arrive from
  `cplieger/ci`, so behavior changes belong upstream.

## Commits and PRs

Branch from `main`, keep changes focused with tests, and open a PR. Commits
follow [Conventional Commits](https://www.conventionalcommits.org/) parsed by
git-cliff: `feat:` → minor, `fix:`/`sec:` → patch/security, `feat!:` or
`BREAKING CHANGE:` → major; `chore`/`ci`/`docs`/`test`/`style`/`refactor` don't
trigger a release. Renovate devDependency bumps use `chore(devdeps)` and are
skipped.

## Conduct & security

By participating you agree to the
[Code of Conduct](https://github.com/cplieger/.github/blob/main/CODE_OF_CONDUCT.md).
Report vulnerabilities through the
[security policy](https://github.com/cplieger/.github/blob/main/SECURITY.md),
never in a public issue.
