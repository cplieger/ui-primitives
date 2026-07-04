// @cplieger/ui-primitives — headless browser UI primitives. Public surface.
// Each primitive is also reachable via its own subpath export (see package.json
// / jsr.json). Ship `css/ui-primitives.css` for the structural/behavioral base;
// consuming apps supply the skin by defining the documented `--uip-*` props.

export { viewTransition } from "./view-transition.js";

export { trapFocus } from "./focus-trap.js";
export type { FocusTrapOptions } from "./focus-trap.js";

export { announce } from "./announce.js";

export { createTheme, themeInitSnippet } from "./theme.js";
export type { ThemeChoice, ThemeController, ThemeOptions } from "./theme.js";

export { createDialog, openModal, closeModal } from "./dialog.js";
export type { DialogController, DialogOptions } from "./dialog.js";

// modal is the overlay-<div> sibling to the native-<dialog> `dialog` member and
// deliberately shares its `openModal` / `closeModal` names. The flat barrel
// keeps dialog's pair (backward compatibility); reach modal's own `openModal` /
// `closeModal` via the `./modal` subpath. `createModal` / `closeTopModal` don't
// collide, so they are re-exported here.
export { createModal, closeTopModal } from "./modal.js";
export type { ModalController, ModalOptions } from "./modal.js";

export { createDisclosure } from "./disclosure.js";
export type { DisclosureController, DisclosureOptions } from "./disclosure.js";

export { confirm } from "./confirm.js";
export type { ConfirmOptions } from "./confirm.js";

export { initTooltips } from "./tooltip.js";
export type { TooltipOptions } from "./tooltip.js";

export { createToaster, toast, info, success, error } from "./toast/index.js";
export type { Toaster, ToastLevel, ToastOptions, ToastRetry } from "./toast/index.js";
