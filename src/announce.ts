// announce.ts — Screen-reader announcements via shared visually-hidden ARIA
// live regions. One region per politeness level is created lazily and reused.
// The message is cleared then set on the next microtask so repeated identical
// messages still produce a change the assistive technology will announce.

import { el } from "@cplieger/reactive";

type Politeness = "polite" | "assertive";

interface Region {
  readonly el: HTMLElement;
  pending: string | null;
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
  const region: Region = { el: node, pending: null };
  regions.set(politeness, region);
  return region;
}

/** Announce `message` to screen readers. `politeness` defaults to `"polite"`;
 *  `"assertive"` interrupts (uses a separate region + `role="alert"`). */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const region = ensureRegion(politeness);
  // Clear synchronously, set on the next microtask: the empty → text change is
  // what forces AT to re-announce even when the text is unchanged.
  region.el.textContent = "";
  region.pending = message;
  queueMicrotask(() => {
    if (region.pending !== null) {
      region.el.textContent = region.pending;
      region.pending = null;
    }
  });
}

/** Test-only: remove the live regions and reset internal state. */
export function _resetForTest(): void {
  for (const region of regions.values()) {
    region.el.remove();
  }
  regions.clear();
}
