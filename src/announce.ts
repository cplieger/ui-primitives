// announce.ts — Screen-reader announcements via shared visually-hidden ARIA
// live regions, one per politeness level, created lazily and reused. The
// message clears then sets after a delay: the empty->text mutation is what
// forces AT to re-announce identical text, and a microtask gap is too fast
// for AT to register as two distinct mutations.

import { el } from "@cplieger/reactive";

import { topmostOpenDialog } from "./modal-host.js";

type Politeness = "polite" | "assertive";

/** Gap (ms) between clearing the region and setting the new text. Long enough
 *  for assistive tech to observe two distinct mutations; short enough to feel
 *  immediate. */
const ANNOUNCE_DELAY_MS = 100;

interface Region {
  readonly el: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

const regions = new Map<Politeness, Region>();

function ensureRegion(politeness: Politeness): Region {
  let region = regions.get(politeness);
  if (region === undefined) {
    const node = el("div", {
      className: "uip-visually-hidden",
      role: politeness === "assertive" ? "alert" : "status",
      "aria-live": politeness,
      "aria-atomic": "true",
    });
    region = { el: node, timer: null };
    regions.set(politeness, region);
  }
  // showModal() inerts everything outside the dialog subtree, so a body-hosted
  // region is silent to AT while a modal is open; re-home into the topmost
  // open modal (or back to body) on every announce.
  const host: HTMLElement = topmostOpenDialog() ?? document.body;
  if (region.el.parentElement !== host) {
    host.appendChild(region.el);
  }
  return region;
}

/** Announce `message` to screen readers. `politeness` defaults to `"polite"`;
 *  `"assertive"` interrupts (uses a separate region + `role="alert"`). */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const region = ensureRegion(politeness);
  // Cancel a pending set so a rapid second announce wins outright.
  if (region.timer !== null) {
    clearTimeout(region.timer);
    region.timer = null;
  }
  region.el.textContent = "";
  region.timer = setTimeout(() => {
    region.el.textContent = message;
    region.timer = null;
  }, ANNOUNCE_DELAY_MS);
}

/** Test-only: remove the live regions and reset internal state. */
export function _resetForTest(): void {
  for (const region of regions.values()) {
    if (region.timer !== null) {
      clearTimeout(region.timer);
    }
    region.el.remove();
  }
  regions.clear();
}
