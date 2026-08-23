import { describe, it, expect, afterEach, vi } from "vitest";

import { createDisclosure } from "./disclosure.js";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(triggerTag = "button"): {
  trigger: HTMLElement;
  region: HTMLElement;
} {
  const trigger = document.createElement(triggerTag);
  const region = document.createElement("div");
  region.textContent = "panel body";
  document.body.append(trigger, region);
  return { trigger, region };
}

/** Force `prefers-reduced-motion: reduce` to match. */
function forceReducedMotion(): void {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList);
}

describe("createDisclosure wiring", () => {
  it("links trigger to region and reflects the collapsed state by default", () => {
    const { trigger, region } = mount();
    createDisclosure(trigger, region);
    expect(region.classList.contains("uip-disclosure-region")).toBe(true);
    expect(region.id).not.toBe("");
    expect(trigger.getAttribute("aria-controls")).toBe(region.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(region.getAttribute("aria-hidden")).toBe("true");
  });

  it("preserves an existing region id", () => {
    const { trigger, region } = mount();
    region.id = "my-region";
    createDisclosure(trigger, region);
    expect(trigger.getAttribute("aria-controls")).toBe("my-region");
    expect(region.id).toBe("my-region");
  });

  it("honors an initial open state", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { open: true });
    expect(d.isOpen).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(region.getAttribute("aria-hidden")).toBe("false");
    expect(region.style.height).toBe("");
  });

  it("gives a non-button trigger button semantics", () => {
    const { trigger, region } = mount("div");
    createDisclosure(trigger, region);
    expect(trigger.getAttribute("role")).toBe("button");
    expect(trigger.getAttribute("tabindex")).toBe("0");
  });

  it("leaves a native <button> without an added role/tabindex", () => {
    const { trigger, region } = mount("button");
    createDisclosure(trigger, region);
    expect(trigger.getAttribute("role")).toBeNull();
    expect(trigger.getAttribute("tabindex")).toBeNull();
  });
});

describe("open / close / toggle", () => {
  it("toggle() flips the state and fires onToggle", () => {
    const onToggle = vi.fn();
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { onToggle, animate: false });

    d.toggle();
    expect(d.isOpen).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(region.getAttribute("aria-hidden")).toBe("false");
    expect(onToggle).toHaveBeenLastCalledWith(true, "api");

    d.toggle();
    expect(d.isOpen).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(onToggle).toHaveBeenLastCalledWith(false, "api");
  });

  it("open()/close() are idempotent — no onToggle when the state is unchanged", () => {
    const onToggle = vi.fn();
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { onToggle, animate: false });
    d.close(); // already closed
    expect(onToggle).not.toHaveBeenCalled();
    d.open();
    d.open(); // already open
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles on trigger click", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { animate: false });
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(d.isOpen).toBe(true);
  });
});

describe("keyboard activation", () => {
  it("Enter and Space toggle a non-button trigger (Space is prevented)", () => {
    const { trigger, region } = mount("div");
    const d = createDisclosure(trigger, region, { animate: false });

    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    trigger.dispatchEvent(enter);
    expect(d.isOpen).toBe(true);

    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    trigger.dispatchEvent(space);
    expect(d.isOpen).toBe(false);
    expect(space.defaultPrevented).toBe(true);
  });

  it("does not bind keydown on a native button (relies on native click)", () => {
    const { trigger, region } = mount("button");
    const d = createDisclosure(trigger, region, { animate: false });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    trigger.dispatchEvent(enter);
    // No synthetic toggle. A dispatched event is untrusted, so it runs no
    // default action and the button never fires the click the disclosure
    // relies on; a real keypress would.
    expect(d.isOpen).toBe(false);
  });
});

describe("height animation", () => {
  it("animates open then settles inline height to auto on transitionend", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    d.open();
    expect(d.isOpen).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Mid-transition an explicit height is set (auto with interpolate-size, or a
    // measured px fallback) — either way not empty.
    expect(region.style.height).not.toBe("");
    region.dispatchEvent(new Event("transitionend"));
    // Settled back to auto (cleared) so the content can reflow.
    expect(region.style.height).toBe("");
  });

  it("collapses to height 0 on close", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { open: true });
    d.close();
    expect(region.style.height).toBe("0px");
    expect(region.getAttribute("aria-hidden")).toBe("true");
  });

  it("skips the tween under reduced motion (height set directly)", () => {
    forceReducedMotion();
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    d.open();
    // No px tween — expanded is cleared straight to auto.
    expect(region.style.height).toBe("");
    d.close();
    expect(region.style.height).toBe("0px");
  });
});

describe("animation edge paths", () => {
  it("settles to auto via the fallback timeout when transitionend never fires", () => {
    vi.useFakeTimers();
    try {
      const { trigger, region } = mount();
      const d = createDisclosure(trigger, region);
      d.open();
      expect(region.style.height).not.toBe("");
      vi.advanceTimersByTime(400);
      expect(region.style.height).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending open settle when a close interrupts it", () => {
    vi.useFakeTimers();
    try {
      const { trigger, region } = mount();
      const d = createDisclosure(trigger, region);
      d.open(); // registers a pending settle
      d.close(); // interrupts it before transitionend/fallback
      expect(region.style.height).toBe("0px");
      // The cancelled settle must not fire and reopen the height to auto.
      vi.advanceTimersByTime(400);
      expect(region.style.height).toBe("0px");
      expect(d.isOpen).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("dispose", () => {
  it("removes listeners so the trigger no longer toggles", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { animate: false });
    d.dispose();
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(d.isOpen).toBe(false);
  });

  it("removes the keydown listener from a non-button trigger on dispose", () => {
    const { trigger, region } = mount("div");
    const d = createDisclosure(trigger, region, { animate: false });
    d.dispose();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    trigger.dispatchEvent(enter);
    expect(d.isOpen).toBe(false);
  });

  it("settles the height on dispose so a mid-animation dispose does not freeze an inline px height", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    d.open(); // animated open sets an inline height mid-transition
    expect(region.style.height).not.toBe("");
    d.dispose(); // dispose while the open tween is still pending
    // Open state settles to auto (cleared inline height), not a frozen value.
    expect(region.style.height).toBe("");
  });

  it("settles the height to 0 on dispose while collapsed", () => {
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region, { open: true });
    d.close(); // collapsing
    d.dispose();
    expect(region.style.height).toBe("0px");
  });
});

describe("createDisclosure: region-only mode (trigger: null)", () => {
  it("drives the region via the controller with no trigger wiring", () => {
    const region = document.createElement("div");
    document.body.appendChild(region);
    const d = createDisclosure(null, region, { animate: false });

    expect(region.getAttribute("aria-hidden")).toBe("true");
    expect(region.inert).toBe(true);
    d.open();
    expect(d.isOpen).toBe(true);
    expect(region.getAttribute("aria-hidden")).toBe("false");
    expect(region.inert).toBe(false);
    d.close();
    expect(region.getAttribute("aria-hidden")).toBe("true");
    d.dispose();
  });
});

describe("createDisclosure: onToggle source", () => {
  it("reports 'user' for trigger toggles and 'api' for controller toggles", () => {
    const trigger = document.createElement("button");
    const region = document.createElement("div");
    document.body.append(trigger, region);
    const onToggle = vi.fn();
    const d = createDisclosure(trigger, region, { animate: false, onToggle });

    trigger.click();
    expect(onToggle).toHaveBeenLastCalledWith(true, "user");
    d.close();
    expect(onToggle).toHaveBeenLastCalledWith(false, "api");
    d.toggle();
    expect(onToggle).toHaveBeenLastCalledWith(true, "api");
    d.dispose();
  });
});

describe("createDisclosure: the two height-animation engines", () => {
  // 0 <-> auto is animated one of two ways, and which one runs is the whole
  // reason `supportsInterpolateSize` exists. Both paths are documented
  // behavior, so both are pinned with an explicit `CSS.supports` stub rather
  // than left to whatever the running browser answers: Chromium supports
  // `interpolate-size`, so without the stub the measured-px fallback — the
  // path every engine without it takes — would run in no test at all.
  it("interpolates the auto keyword when the engine supports it", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    d.open();
    expect(region.style.height).toBe("auto");
    d.dispose();
  });

  it("animates to a measured pixel height when it does not", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const { trigger, region } = mount();
    Object.defineProperty(region, "scrollHeight", { value: 120, configurable: true });
    const d = createDisclosure(trigger, region);
    d.open();
    expect(region.style.height).toBe("120px");
    d.dispose();
  });
});

describe("createDisclosure: ARIA the app already set", () => {
  it("keeps an app-set role on a non-button trigger", () => {
    // Overwriting a role the app chose would silently re-label the control.
    const { trigger, region } = mount("div");
    trigger.setAttribute("role", "tab");
    const d = createDisclosure(trigger, region);
    expect(trigger.getAttribute("role")).toBe("tab");
    d.dispose();
  });

  it("keeps an app-set tabindex on a non-button trigger", () => {
    const { trigger, region } = mount("div");
    trigger.setAttribute("tabindex", "-1");
    const d = createDisclosure(trigger, region);
    expect(trigger.getAttribute("tabindex")).toBe("-1");
    d.dispose();
  });
});

describe("createDisclosure: which keys activate a non-button trigger", () => {
  it("ignores a key that is neither Enter nor Space", () => {
    const { trigger, region } = mount("div");
    const d = createDisclosure(trigger, region, { animate: false });
    const other = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    trigger.dispatchEvent(other);
    expect(d.isOpen).toBe(false);
    expect(other.defaultPrevented).toBe(false);
    d.dispose();
  });

  it("activates on the legacy Spacebar key value", () => {
    // Older engines report Space as "Spacebar"; the trigger stays operable there.
    const { trigger, region } = mount("div");
    const d = createDisclosure(trigger, region, { animate: false });
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Spacebar", bubbles: true, cancelable: true }),
    );
    expect(d.isOpen).toBe(true);
    d.dispose();
  });
});

describe("createDisclosure: engine capability guards", () => {
  // `prefersReducedMotion` and `supportsInterpolateSize` are written as feature
  // probes — each `typeof` guard exists so an engine (or a non-browser render
  // pass) that lacks the API degrades instead of throwing. happy-dom provides
  // all of them, so the degraded arms only run when the API is taken away.

  it("treats an engine without matchMedia as expressing no motion preference", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.stubGlobal("matchMedia", undefined);
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    d.open();
    // Nothing to ask ⇒ no reduce claim ⇒ the tween runs (and asking anyway
    // would throw).
    expect(region.style.height).toBe("auto");
    d.dispose();
  });

  it("treats a windowless environment as expressing no motion preference", () => {
    const { trigger, region } = mount();
    vi.stubGlobal("CSS", { supports: () => true });
    vi.stubGlobal("window", undefined);
    const d = createDisclosure(trigger, region);
    d.open();
    expect(region.style.height).toBe("auto");
    d.dispose();
  });

  it("falls back to a measured pixel height when CSS is absent entirely", () => {
    vi.stubGlobal("CSS", undefined);
    const { trigger, region } = mount();
    Object.defineProperty(region, "scrollHeight", { value: 90, configurable: true });
    const d = createDisclosure(trigger, region);
    d.open();
    expect(region.style.height).toBe("90px");
    d.dispose();
  });

  it("falls back to a measured pixel height when CSS exists without supports()", () => {
    vi.stubGlobal("CSS", {});
    const { trigger, region } = mount();
    Object.defineProperty(region, "scrollHeight", { value: 90, configurable: true });
    const d = createDisclosure(trigger, region);
    d.open();
    expect(region.style.height).toBe("90px");
    d.dispose();
  });
});

describe("createDisclosure: the forced reflow between the two height writes", () => {
  // Setting the start height and the target height in one tick collapses into a
  // single frame and no transition starts; the layout read in between is what
  // flushes the first write. happy-dom has no layout engine, so the read itself
  // is the only trace of the flush — as in transition.test.ts's forceReflow
  // test. These pin that it happens, once, and at the right moment.
  function watchReflow(region: HTMLElement): string[] {
    const seen: string[] = [];
    const orig = region.getBoundingClientRect.bind(region);
    vi.spyOn(region, "getBoundingClientRect").mockImplementation(() => {
      seen.push(region.style.height);
      return orig();
    });
    return seen;
  }

  it("flushes the collapsed start height before setting the open target", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { trigger, region } = mount();
    const d = createDisclosure(trigger, region);
    const seen = watchReflow(region);
    d.open();
    // Exactly one flush, and taken while the height still reads 0.
    expect(seen).toEqual(["0px"]);
    expect(region.style.height).toBe("auto");
    d.dispose();
  });

  it("flushes the measured start height before collapsing to 0", () => {
    const { trigger, region } = mount();
    Object.defineProperty(region, "scrollHeight", { value: 90, configurable: true });
    const d = createDisclosure(trigger, region, { open: true });
    const seen = watchReflow(region);
    d.close();
    // auto is not an animatable start, so the collapse begins from a measured
    // px height — flushed before the 0.
    expect(seen).toEqual(["90px"]);
    expect(region.style.height).toBe("0px");
    d.dispose();
  });
});

describe("createDisclosure: generated region ids", () => {
  it("names id-less regions from a rising positive counter", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    document.body.append(a, b);
    const d1 = createDisclosure(null, a, { animate: false });
    const d2 = createDisclosure(null, b, { animate: false });
    // The documented shape is `uip-disclosure-<n>`; a negative or non-numeric
    // suffix is not it, and ids must not collide.
    expect(a.id).toMatch(/^uip-disclosure-\d+$/);
    expect(b.id).toMatch(/^uip-disclosure-\d+$/);
    const seq = (id: string): number => Number(id.slice("uip-disclosure-".length));
    expect(seq(b.id)).toBeGreaterThan(seq(a.id));
    d1.dispose();
    d2.dispose();
  });
});

describe("createDisclosure: a superseded settle must not fire late", () => {
  it("a settle armed by an earlier open does not clear a later open's height", () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("CSS", { supports: () => true });
      const { trigger, region } = mount();
      const d = createDisclosure(trigger, region);
      d.open(); // settle #1 armed, deadline t=400
      vi.advanceTimersByTime(100);
      d.close(); // supersedes #1
      vi.advanceTimersByTime(100);
      d.open(); // settle #2 armed, deadline t=600
      expect(region.style.height).toBe("auto");

      vi.advanceTimersByTime(200); // t=400 — #1's old deadline
      // #1 was cancelled by the close. If it still fired it would settle this
      // second open's height mid-tween, killing the animation.
      expect(region.style.height).toBe("auto");

      vi.advanceTimersByTime(200); // t=600 — #2's deadline
      expect(region.style.height).toBe("");
      d.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a close leaves no settle armed against the region", () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("CSS", { supports: () => true });
      const { trigger, region } = mount();
      const d = createDisclosure(trigger, region);
      d.open();
      expect(vi.getTimerCount()).toBe(1); // the open's settle fallback

      d.close();
      // A collapse ends at 0 and has nothing to settle afterwards. A fallback
      // left armed here fires into whatever state the region is in 400ms later,
      // which is not the state it was armed for.
      expect(vi.getTimerCount()).toBe(0);
      d.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose drops the pending settle so nothing touches the region afterwards", () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("CSS", { supports: () => true });
      const { trigger, region } = mount();
      const d = createDisclosure(trigger, region);
      d.open(); // settle armed
      d.dispose(); // settles the height itself, and must drop the pending work
      expect(region.style.height).toBe("");

      // The caller now owns the element again.
      region.style.height = "42px";
      vi.advanceTimersByTime(400);
      region.dispatchEvent(new Event("transitionend"));
      expect(region.style.height).toBe("42px");
    } finally {
      vi.useRealTimers();
    }
  });
});
