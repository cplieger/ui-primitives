// popup.ts — Reveal + light-dismiss lifecycle for a caller-supplied panel,
// WITHOUT placement. The behavior half of popover: it reveals/conceals the
// panel through the shared enter/leave state-class lifecycle, dismisses on
// outside-click and Escape (isolated by default, like popover), wires
// aria-expanded / aria-haspopup on an optional trigger, coordinates
// single-open groups, and manages opt-in focus — but it never positions the
// panel. Reach for it when the panel is in-flow or self-positioned (an
// expandable pill/card, an inline tray, a bottom-sheet); reach for popover
// when the panel floats anchored to something.
//
// This is the public face of the shared lifecycle core (`popup-core.ts`,
// internal): popup exposes the core verbatim, popover layers placement on it
// through the core's internal hooks seam. One lifecycle implementation, two
// shapes — and one group registry, so popups and popovers can share a
// `group`.

import { createPopupCore } from "./popup-core.js";
import type { PopupController, PopupOptions } from "./popup-core.js";

export { closePopupGroup } from "./popup-core.js";
export type { PopupController, PopupOptions, PopupOptionsPatch } from "./popup-core.js";

/**
 * Wire a caller-supplied `panel` into a revealable, light-dismissing popup.
 * The controller reveals/conceals the panel and dismisses on outside-click /
 * Escape, but never positions it and never removes it from the DOM — the
 * caller owns the element, its placement, and its motion.
 */
export function createPopup(panel: HTMLElement, opts?: PopupOptions): PopupController {
  return createPopupCore(panel, opts);
}
