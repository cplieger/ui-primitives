// view.test.ts — the toast view's leave lifecycle measured against the SHIPPED
// stylesheet. Separate from toast.test.ts on purpose: these tests need the real
// css/ui-primitives.css in the document (a document-wide side effect the rest of
// the suite must not inherit) and real timers, so they can watch an actual CSS
// transition run, which is exactly what toast.test.ts's synthetic
// `dispatchEvent(new Event("transitionend"))` fixtures cannot observe.
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";

import { _resetForTest as resetAnnounce } from "../announce.js";

import type { ToastCallbacks, ToastRenderData } from "./engine.js";
import { createToastView } from "./view.js";

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

/** Resolve `true` on the node's own `transitionend`, `false` if none arrives. */
function transitionEndWithin(node: HTMLElement, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const onEnd = (e: TransitionEvent): void => {
      if (e.target !== node) {
        return;
      }
      clearTimeout(timer);
      node.removeEventListener("transitionend", onEnd);
      resolve(true);
    };
    const timer = setTimeout(() => {
      node.removeEventListener("transitionend", onEnd);
      resolve(false);
    }, ms);
    node.addEventListener("transitionend", onEnd);
  });
}

/** Let a whole event dispatch (every listener) finish before asserting. */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const noop = (): void => {
  /* no-op */
};

describe("toast view: a leave that starts before the enter frame has run", () => {
  let link: HTMLLinkElement;

  beforeAll(async () => {
    link = await loadShippedCss();
  });

  afterAll(() => {
    link.remove();
  });

  afterEach(() => {
    resetAnnounce();
    document.body.innerHTML = "";
  });

  it("settles into is-shown first, so the leave transition really runs", async () => {
    // The shipped CSS only animates when motion is allowed; if the runner ever
    // reports `reduce` there is no transition to observe and this test would be
    // vacuous, so state the precondition rather than silently passing.
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const view = createToastView(host);
    const data: ToastRenderData = { id: 1, message: "bye", level: "info", duration: 4000 };
    const ctx: ToastCallbacks = { dismiss: noop, pause: noop, resume: noop };
    const handle = view.mount(data, ctx);
    const node = handle.el;

    // A dismiss landing before the enter frame: the node is still `is-entering`,
    // which the stylesheet has no rule for, so its used style is the base
    // `.uip-toast { opacity: 0 }`. Leaving from there to `.is-leaving`
    // (also opacity 0) is a no-op the engine never animates, so `scheduleLeave`
    // has to settle the node into `is-shown` — for real, with a style flush —
    // before it swaps in `is-leaving`.
    expect(node.classList.contains("is-entering")).toBe(true);

    let doneCalls = 0;
    const ended = transitionEndWithin(node, 1000);
    view.scheduleLeave(handle, () => {
      doneCalls++;
    });
    // Read now, before the transition has had time to progress: the leave starts
    // from the settled state, so the first resolved value of the transitioning
    // property is the `is-shown` one, not the `is-leaving` one.
    const startOpacity = getComputedStyle(node).opacity;

    // `transitionend` is the assertion, not a stopwatch: without the settle no
    // transition starts at all, so the event never arrives and the node waits
    // out LEAVE_FALLBACK_MS (400 ms) instead of the 150 ms leave.
    expect(await ended).toBe(true);
    await settle();
    expect(doneCalls).toBe(1);
    expect(node.isConnected).toBe(false);
    expect(startOpacity).toBe("1");

    view.dispose();
  });
});
