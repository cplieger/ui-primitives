// @cplieger/ui-primitives — headless browser UI primitives. Each primitive is
// also reachable via its own subpath export.

export { viewTransition } from "./view-transition.js";

export { trapFocus } from "./focus-trap.js";
export type { FocusTrapOptions } from "./focus-trap.js";

export { rovingFocus } from "./roving-focus.js";
export type { RovingFocusController, RovingFocusOptions } from "./roving-focus.js";

export { announce } from "./announce.js";

export { skeletonTiming } from "./skeleton.js";
export type { SkeletonTimingController, SkeletonTimingOptions } from "./skeleton.js";

export { createTheme, themeInitSnippet, themeInitSnippetFromJSON } from "./theme.js";
export type { ThemeChoice, ThemeController, ThemeOptions, ThemeStorage } from "./theme.js";

export { createDialog, openDialog, closeDialog } from "./dialog.js";
export type { DialogController, DialogOptions } from "./dialog.js";

export { createModal } from "./modal.js";
export type { ModalController, ModalOptions } from "./modal.js";

export { createDisclosure } from "./disclosure.js";
export type {
  DisclosureController,
  DisclosureOptions,
  DisclosureToggleSource,
} from "./disclosure.js";

export { ask } from "./ask.js";
export type { AskInput, AskOptions } from "./ask.js";

export { initTooltips } from "./tooltip.js";
export type { TooltipOptions } from "./tooltip.js";

export { createPopup, closePopupGroup } from "./popup.js";
export type { PopupController, PopupOptions, PopupOptionsPatch } from "./popup.js";

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
