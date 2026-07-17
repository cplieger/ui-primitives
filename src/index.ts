// @cplieger/ui-primitives — headless browser UI primitives. Public surface.
// Each primitive is also reachable via its own subpath export (see package.json
// / jsr.json). Ship `css/ui-primitives.css` for the structural/behavioral base;
// consuming apps supply the skin by defining the documented `--uip-*` props.

export { viewTransition } from "./view-transition.js";

export { trapFocus } from "./focus-trap.js";
export type { FocusTrapOptions } from "./focus-trap.js";

// roving-focus is the keyboard half of composite widgets (menus, listboxes,
// toolbars): one Tab stop, arrow keys move focus. Pair with popover for the
// full WAI-ARIA menu pattern.
export { rovingFocus } from "./roving-focus.js";
export type { RovingFocusController, RovingFocusOptions } from "./roving-focus.js";

export { announce } from "./announce.js";

// skeleton is anti-flicker timing for loading skeletons: show-delay so fast
// loads never flash one, opt-in min-visible so a painted one never blinks.
export { skeletonTiming } from "./skeleton.js";
export type { SkeletonTimingController, SkeletonTimingOptions } from "./skeleton.js";

export { createTheme, themeInitSnippet, themeInitSnippetFromJSON } from "./theme.js";
export type { ThemeChoice, ThemeController, ThemeOptions, ThemeStorage } from "./theme.js";

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
export type {
  DisclosureController,
  DisclosureOptions,
  DisclosureToggleSource,
} from "./disclosure.js";

export { confirm } from "./confirm.js";
export type { ConfirmOptions } from "./confirm.js";

// prompt is confirm's input-collecting sibling: a Promise-based single-input
// dialog (the styled, non-blocking window.prompt replacement).
export { prompt } from "./prompt.js";
export type { PromptOptions } from "./prompt.js";

export { initTooltips } from "./tooltip.js";
export type { TooltipOptions } from "./tooltip.js";

// popup is the reveal + light-dismiss lifecycle WITHOUT placement — for
// in-flow or self-positioned panels (expandable cards, inline trays). popover
// is built on it.
export { createPopup, closePopupGroup } from "./popup.js";
export type { PopupController, PopupOptions, PopupOptionsPatch } from "./popup.js";

// popover is the interactive superset of tooltip: an anchored floating panel
// (placeAnchored positioner + createPopover controller) and the substrate a
// menu/listbox/picker sits on.
export { createPopover, placeAnchored, pointAnchor } from "./popover.js";
export type {
  PopoverController,
  PopoverOptions,
  PopoverOptionsPatch,
  PlacementOptions,
  PopoverPlacement,
  PopoverAlign,
  VirtualAnchor,
  PopoverAnchor,
} from "./popover.js";

export { createToaster, toast, info, success, error } from "./toast/index.js";
export type {
  Toaster,
  ToasterOptions,
  ToastLevel,
  ToastOptions,
  ToastRetry,
} from "./toast/index.js";
