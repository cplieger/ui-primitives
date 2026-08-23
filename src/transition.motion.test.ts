// transition.motion.test.ts — the transition primitive's contract measured
// against REAL CSS motion in a real browser, at the modules that use it.
//
// Separate from transition.test.ts for the same reason toast/view.test.ts is
// separate from toast.test.ts: these tests inject stylesheets and run on real
// timers so an actual CSS transition can start, progress and end, which a
// synthetic `dispatchEvent(new Event("transitionend"))` fixture cannot observe.
// `transitionend` is the assertion throughout — never elapsed time, which goes
// flaky on a loaded box.
//
// The property under test: whatever a caller writes before runTransition is
// COMMITTED as the start state, so the change animates. Both defects the
// primitive exists to prevent were a missing commit.
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";

import { createDialog } from "./dialog.js";
import { createDisclosure } from "./disclosure.js";
import { createPopup } from "./popup.js";
import { runTransition } from "./transition.js";

/** Load the shipped stylesheet the way a consumer does, and wait for it. */
async function loadShippedCss(): Promise<HTMLLinkElement> {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/ui-primitives.css";
  const loaded = new Promise<void>((resolve, reject) => {
    link.addEventListener("load", () => {
      resolve();
    });
    link.addEventListener("error", () => {
      reject(new Error("could not load /css/ui-primitives.css"));
    });
  });
  document.head.appendChild(link);
  await loaded;
  return link;
}

/** Let a whole event dispatch finish before asserting. A microtask checkpoint
 *  runs BETWEEN listeners on one event, so a promise resolved by the first
 *  listener can resume before the library's own listener has been invoked. */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Resolve the `propertyName` of the element's OWN first `transitionend` (not a
 *  descendant's, not a pseudo-element's), or `null` if none arrives in `ms`. */
function ownTransitionEndWithin(node: HTMLElement, ms: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const onEnd = (e: TransitionEvent): void => {
      // A <dialog>'s ::backdrop transitions opacity too, and its transitionend
      // targets the dialog; require the element's own transition so a test
      // cannot pass on the backdrop's behalf.
      if (e.target !== node || e.pseudoElement !== "") {
        return;
      }
      clearTimeout(timer);
      node.removeEventListener("transitionend", onEnd);
      resolve(e.propertyName);
    };
    const timer = setTimeout(() => {
      node.removeEventListener("transitionend", onEnd);
      resolve(null);
    }, ms);
    node.addEventListener("transitionend", onEnd);
  });
}

/** Yield until after the next frame, so a state written this task is resolved. */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

describe("the committed start state, against real CSS", () => {
  let link: HTMLLinkElement;

  beforeAll(async () => {
    link = await loadShippedCss();
  });

  afterAll(() => {
    link.remove();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("animates a disclosure open from the collapsed height, not straight to auto", async () => {
    // The shipped CSS only animates height when motion is allowed; without that
    // this test would pass vacuously, so state the precondition.
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const trigger = document.createElement("button");
    const region = document.createElement("div");
    region.appendChild(document.createElement("p")).textContent = "x".repeat(400);
    document.body.append(trigger, region);
    const ctl = createDisclosure(trigger, region);

    // The open path writes `height: 0px`, then `height: auto`. The 0 has to be
    // committed in between or the engine coalesces both writes and the region
    // snaps open with no transition. This is the site whose private, duplicated
    // forceReflow the design deleted.
    const ended = ownTransitionEndWithin(region, 2000);
    ctl.open();

    expect(await ended).toBe("height");
    await settle();
    // The settle clears the inline height so later content growth is not clipped.
    expect(region.style.height).toBe("");

    ctl.dispose();
  });

  it("animates a disclosure close from its measured height, not straight to 0", async () => {
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const trigger = document.createElement("button");
    const region = document.createElement("div");
    region.appendChild(document.createElement("p")).textContent = "x".repeat(400);
    document.body.append(trigger, region);
    const ctl = createDisclosure(trigger, region, { open: true });
    await nextFrame();

    const ended = ownTransitionEndWithin(region, 2000);
    ctl.close();

    expect(await ended).toBe("height");
    expect(region.style.height).toBe("0px");

    ctl.dispose();
  });

  it("fades a popup on hide, finishing on its own transitionend rather than the ceiling", async () => {
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    // App-owned motion, the shape vibekit's find box documents: the RESTING
    // state is also the leave target, so one declaration covers both directions
    // and `is-leaving` needs no rule of its own.
    const style = document.createElement("style");
    style.textContent = `
      .probe { opacity: 0; transition: opacity 60ms linear; }
      .probe.is-open { opacity: 1; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "probe";
    panel.textContent = "panel";
    document.body.appendChild(panel);
    const ctl = createPopup(panel);

    // Reveal, and let `is-open` resolve — the enter's own committed start state
    // is the resting `opacity: 0`.
    const entered = ownTransitionEndWithin(panel, 2000);
    ctl.show();
    expect(await entered).toBe("opacity");

    const left = ownTransitionEndWithin(panel, 2000);
    ctl.hide();
    expect(await left).toBe("opacity");
    await settle();
    // 60ms of transition, not the 400ms ceiling.
    expect(panel.hidden).toBe(true);

    ctl.dispose();
    style.remove();
  });

  it("settles once when one change ends two transitions", async () => {
    // The primitive has no "already ran" latch: detaching both sources before
    // invoking settled is what makes it run once. A single change really can end
    // several transitions — the shipped toast animates opacity AND transform —
    // so pin it against two, with a settled that leaves the element in place so
    // the second event is not swallowed by a removal cancelling it.
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const style = document.createElement("style");
    style.textContent = `
      .two { opacity: 1; translate: 0 0; transition: opacity 60ms linear, translate 60ms linear; }
      .two.off { opacity: 0; translate: 0 8px; }
    `;
    document.head.appendChild(style);

    const el = document.createElement("div");
    el.className = "two";
    el.textContent = "x";
    document.body.appendChild(el);

    const ended: string[] = [];
    el.addEventListener("transitionend", (e) => {
      ended.push(e.propertyName);
    });
    let settles = 0;
    runTransition(el, {
      change: () => {
        el.classList.add("off");
      },
      settled: () => {
        settles++;
      },
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(ended.length).toBeGreaterThan(1); // the premise: two events really arrive
    expect(settles).toBe(1);

    style.remove();
  });

  it("still fades a dialog closed in the same task it opened", async () => {
    // A regression guard, not evidence of a fix: this passed before the redesign
    // too. showModal() moves focus, which needs layout, which resolves the
    // opacity-1 state — so the dialog family never depended on the commit.
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const dialog = document.createElement("dialog");
    dialog.textContent = "hello";
    document.body.appendChild(dialog);
    let closed = false;
    const ctl = createDialog(dialog, {
      onClose: () => {
        closed = true;
      },
    });

    const ended = ownTransitionEndWithin(dialog, 2000);
    ctl.open();
    ctl.close();

    expect(await ended).toBe("opacity");
    await settle();
    expect(closed).toBe(true);
    expect(dialog.open).toBe(false);

    ctl.dispose();
  });

  it("documents the one case the commit cannot rescue: a popup hidden in the show's own task", async () => {
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const style = document.createElement("style");
    style.textContent = `
      .probe { opacity: 0; transition: opacity 60ms linear; }
      .probe.is-open { opacity: 1; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "probe";
    panel.textContent = "panel";
    document.body.appendChild(panel);
    const ctl = createPopup(panel);

    // Committing the start state is what LETS the enter transition begin — and
    // a hide in the same task then reverses a transition at zero progress,
    // whose target equals its current value, so CSS starts no transition at
    // all. No amount of flushing changes that; the panel snaps to its resting
    // state and `[hidden]` waits for the ceiling. Pinned so the limitation is a
    // stated behaviour rather than a surprise, and so a future fix has a test
    // to flip.
    const ended = ownTransitionEndWithin(panel, 250);
    ctl.show();
    ctl.hide();

    expect(await ended).toBe(null);
    expect(panel.hidden).toBe(false);

    ctl.dispose();
    style.remove();
  });
});
