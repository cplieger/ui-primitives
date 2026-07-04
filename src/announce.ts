// announce.ts — Screen-reader announcements via shared visually-hidden ARIA
// live regions. One region per politeness level is created lazily and reused.
// The message is cleared synchronously then set after a short delay so the
// empty -> text mutation is a distinct change the assistive technology will
// re-announce even when the text is identical to the previous message. A
// microtask is too fast for AT to register two separate mutations, so a real
// timer gap is used; a pending set is cancelled if a newer announce arrives.

import { el } from "@cplieger/reactive";

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
  const existing = regions.get(politeness);
  if (existing !== undefined) {
    return existing;
  }
  const node = el("div", {
    className: "uip-visually-hidden",
    role: politeness === "assertive" ? "alert" : "status",
    "aria-live": politeness,
    "aria-atomic": "true",
  });
  document.body.appendChild(node);
  const region: Region = { el: node, timer: null };
  regions.set(politeness, region);
  return region;
}

/** Announce `message` to screen readers. `politeness` defaults to `"polite"`;
 *  `"assertive"` interrupts (uses a separate region + `role="alert"`). */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const region = ensureRegion(politeness);
  // Cancel a still-pending set so a rapid second announce wins (and its text is
  // the one that lands), rather than both firing in sequence.
  if (region.timer !== null) {
    clearTimeout(region.timer);
    region.timer = null;
  }
  // Clear synchronously, set after a short delay: the empty → text change is
  // what forces AT to re-announce even when the text is unchanged, and the gap
  // is what lets it register the two mutations as distinct.
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
