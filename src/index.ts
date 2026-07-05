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

export { createDialog, openDialog, closeDialog } from "./dialog.js";
export type { DialogController, DialogOptions } from "./dialog.js";

// modal builds a native-<dialog> modal from caller content — the sibling to the
// `dialog` member (which wraps an existing <dialog>). The platform provides
// focus containment, the top layer, background inerting, Escape, nested
// stacking, and focus-return-to-opener; modal adds ARIA wiring, drag-safe
// backdrop dismissal, the shared fade-out lifecycle, and an iOS-safe background
// scroll-lock. The overlay-<div> incarnation (openModal / closeModal /
// closeTopModal on a raw div) was removed with the native rewrite.
export { createModal } from "./modal.js";
export type { ModalController, ModalOptions } from "./modal.js";

export { createDisclosure } from "./disclosure.js";
export type { DisclosureController, DisclosureOptions } from "./disclosure.js";

export { confirm } from "./confirm.js";
export type { ConfirmOptions } from "./confirm.js";

export { initTooltips } from "./tooltip.js";
export type { TooltipOptions } from "./tooltip.js";

// popover is the interactive superset of tooltip: an anchored floating panel
// (placeAnchored positioner + createPopover controller) and the substrate a
// menu/listbox/picker sits on.
export { createPopover, placeAnchored, pointAnchor } from "./popover.js";
export type {
  PopoverController,
  PopoverOptions,
  PlacementOptions,
  PopoverPlacement,
  PopoverAlign,
  VirtualAnchor,
  PopoverAnchor,
} from "./popover.js";

export { createToaster, toast, info, success, error } from "./toast/index.js";
export type { Toaster, ToastLevel, ToastOptions, ToastRetry } from "./toast/index.js";
