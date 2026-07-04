# ui-primitives

> Headless browser UI primitives — behavior, accessibility, DOM, and a documented CSS contract. You bring the skin.

`@cplieger/ui-primitives` ships the structure, behavior, ARIA wiring, and DOM for a set of common UI primitives (toast, tooltip, dialog, confirm, focus-trap, theme, view-transition, announce), plus a small base stylesheet you theme with `--uip-*` custom properties. Built on [`@cplieger/reactive`](https://github.com/cplieger/reactive). ESM-only, published as TypeScript source.

## Install

```sh
npm i @cplieger/ui-primitives
# or
npx jsr add @cplieger/ui-primitives
```

## Usage

```ts
import { toast } from "@cplieger/ui-primitives/toast";
import "@cplieger/ui-primitives/css";

toast.success("Saved");
```

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
