/**
 * announce.ts — Screen-reader announcements through pre-mounted live regions:
 * a polite and an assertive one per surface, the root's from `mountLiveRegions`
 * and each modal `<dialog>`'s from the dialog primitives. A region inserted or
 * moved in the mutation that fills it is not reliably announced, so `announce`
 * never creates or moves one.
 * @module
 */

import { acquireRegions, regionsOf } from "./live-regions.js";
import type { Politeness } from "./live-regions.js";
import { topmostOpenDialog } from "./modal-host.js";

/** Gap (ms) between clearing the region and setting the new text: the
 *  empty-then-text change is what makes assistive tech re-announce identical
 *  text, and a microtask gap is too short for it to see two mutations. */
const ANNOUNCE_DELAY_MS = 100;

interface RootMount {
  readonly host: HTMLElement;
  readonly release: () => void;
}

/** Root mounts still held, oldest first; the newest one's host is the root. */
const roots: RootMount[] = [];

const pending = new Map<Politeness, ReturnType<typeof setTimeout>>();

/** Mount the page's root polite and assertive live regions as `host`'s last
 *  children and make `host` the root. Call it once at boot, before the first
 *  render, so the regions exist before anything is announced. A pair still
 *  inside `host` is kept rather than replaced. Returns this mount's release,
 *  which is idempotent: the root falls back to the newest mount still held,
 *  and the pair leaves `host` when its last owner releases (a dialog open on
 *  `host` is an owner too). */
export function mountLiveRegions(host: HTMLElement): () => void {
  const mount: RootMount = { host, release: acquireRegions(host) };
  roots.push(mount);
  return () => {
    const at = roots.indexOf(mount);
    if (at === -1) {
      return;
    }
    roots.splice(at, 1);
    mount.release();
  };
}

/** The region an announcement reaches now: `showModal()` inerts everything
 *  outside the topmost modal, so its pair wins over the root's. */
function currentRegion(politeness: Politeness): HTMLElement | null {
  const dialog = topmostOpenDialog();
  const root = roots.at(-1);
  const pair =
    (dialog === null ? undefined : regionsOf(dialog)) ??
    (root === undefined ? undefined : regionsOf(root.host));
  return pair?.[politeness] ?? null;
}

function deliver(message: string, politeness: Politeness): void {
  const region = currentRegion(politeness);
  if (region === null) {
    return;
  }
  region.textContent = "";
  pending.set(
    politeness,
    setTimeout(() => {
      // A dialog opened or closed during the gap: the cleared region is no
      // longer the one assistive tech hears, so start over on the live one.
      if (currentRegion(politeness) !== region) {
        deliver(message, politeness);
        return;
      }
      region.textContent = message;
    }, ANNOUNCE_DELAY_MS),
  );
}

/** Announce `message` to screen readers through the topmost open modal
 *  dialog's live region, else the root's from {@link mountLiveRegions}.
 *  Writes nothing when neither is mounted. `"assertive"` interrupts, through
 *  its own `role="alert"` region; a second announcement at the same
 *  politeness before the first lands replaces it. */
export function announce(message: string, politeness: Politeness = "polite"): void {
  clearTimeout(pending.get(politeness));
  deliver(message, politeness);
}

/** Test-only: cancel pending announcements and release every root mount. */
export function _resetForTest(): void {
  for (const timer of pending.values()) {
    clearTimeout(timer);
  }
  for (const mount of roots.splice(0)) {
    mount.release();
  }
}
