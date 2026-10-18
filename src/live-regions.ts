import { el } from "@cplieger/reactive";

export type Politeness = "polite" | "assertive";

type RegionPair = Readonly<Record<Politeness, HTMLElement>>;

interface Mount {
  pair: RegionPair;
  readonly owners: Set<symbol>;
}

const mounts = new WeakMap<HTMLElement, Mount>();

function buildRegion(politeness: Politeness): HTMLElement {
  return el("div", {
    className: "uip-visually-hidden",
    role: politeness === "assertive" ? "alert" : "status",
    "aria-live": politeness,
    "aria-atomic": "true",
  });
}

function appendPair(host: HTMLElement): RegionPair {
  const pair: RegionPair = { polite: buildRegion("polite"), assertive: buildRegion("assertive") };
  host.append(pair.polite, pair.assertive);
  return pair;
}

function removePair(pair: RegionPair): void {
  pair.polite.remove();
  pair.assertive.remove();
}

function isInside(pair: RegionPair, host: HTMLElement): boolean {
  return pair.polite.parentElement === host && pair.assertive.parentElement === host;
}

/** The pair mounted in `host`, or `undefined` once its last owner released it
 *  or either region has left it (an app clearing the host's children takes the
 *  pair with them). */
export function regionsOf(host: HTMLElement): RegionPair | undefined {
  const mount = mounts.get(host);
  return mount !== undefined && isInside(mount.pair, host) ? mount.pair : undefined;
}

/** Hold `host`'s polite and assertive pair as a new owner, appending a pair
 *  as its last two children unless one is still inside it. Returns this
 *  owner's release: idempotent, it drops only this owner, and the pair leaves
 *  `host` when its last owner releases. */
export function acquireRegions(host: HTMLElement): () => void {
  let mount = mounts.get(host);
  if (mount === undefined) {
    mount = { pair: appendPair(host), owners: new Set() };
    mounts.set(host, mount);
  } else if (!isInside(mount.pair, host)) {
    removePair(mount.pair);
    mount.pair = appendPair(host);
  }
  const held = mount;
  const owner = Symbol("live-region owner");
  held.owners.add(owner);
  return () => {
    held.owners.delete(owner);
    if (held.owners.size === 0) {
      removePair(held.pair);
    }
  };
}
