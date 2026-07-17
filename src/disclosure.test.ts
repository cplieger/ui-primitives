// @vitest-environment happy-dom
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
    // No synthetic toggle — a real button would fire click, which happy-dom
    // does not synthesize from a dispatched keydown.
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
