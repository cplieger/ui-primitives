// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

import { _resetForTest as resetAnnounce } from "../announce.js";

import { toast, info, error, createToaster, _resetForTest } from "./index.js";
import { createToastView } from "./view.js";

// The toast view delegates screen-reader announcement to the shared announce()
// live region (see view.ts); the visual stack and toast nodes are NOT live
// regions. announce() is used for real here (isolate:false makes vi.mock leak
// across files), so the announcement is asserted through its actual region,
// which is a stronger, end-to-end check.
afterEach(() => {
  _resetForTest(); // clear toasts + remove the visual stack
  resetAnnounce(); // clear announce timers + remove its live regions
  document.body.innerHTML = "";
});

function stack(): HTMLElement | null {
  return document.querySelector(".uip-toast-stack");
}

function toasts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".uip-toast")];
}

function liveRegion(politeness: "polite" | "assertive"): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.uip-visually-hidden[aria-live="${politeness}"]`);
}

function endTransition(node: HTMLElement): void {
  node.dispatchEvent(new Event("transitionend"));
}

describe("toast", () => {
  it("renders a non-live visual stack and node (no nested live regions, no aria-label)", () => {
    info("Saved");

    // The stack is a purely visual container — NOT a live region, so nothing
    // nests a live region inside another.
    const s = stack();
    expect(s).not.toBeNull();
    expect(s!.hasAttribute("role")).toBe(false);
    expect(s!.hasAttribute("aria-live")).toBe(false);

    const nodes = toasts();
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;

    // The visual node carries no live-region semantics and no aria-label.
    expect(node.hasAttribute("role")).toBe(false);
    expect(node.hasAttribute("aria-live")).toBe(false);
    expect(node.hasAttribute("aria-label")).toBe(false);

    // The message renders; the dismiss hint stays a visually-hidden (NOT
    // aria-hidden) child so the focusable node is self-describing.
    expect(node.querySelector(".uip-toast-msg")!.textContent).toBe("Saved");
    const hint = node.querySelector<HTMLElement>(".uip-visually-hidden");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe("Click to dismiss.");
    expect(hint!.hasAttribute("aria-hidden")).toBe(false);

    expect(node.getAttribute("tabindex")).toBe("0");
    expect(node.classList.contains("uip-toast--info")).toBe(true);
  });

  it("announces an info message through the polite live region (not via the node)", () => {
    vi.useFakeTimers();
    try {
      info("Saved");
      // announce() creates its polite region synchronously; the text lands
      // after its short delay (empty -> text is what re-announces reliably).
      const region = liveRegion("polite");
      expect(region).not.toBeNull();
      expect(region!.getAttribute("role")).toBe("status");
      vi.advanceTimersByTime(100);
      expect(region!.textContent).toBe("Saved");
      // A non-error toast does not touch the assertive region.
      expect(liveRegion("assertive")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces a success message politely", () => {
    vi.useFakeTimers();
    try {
      toast.success("Profile updated");
      vi.advanceTimersByTime(100);
      expect(liveRegion("polite")?.textContent).toBe("Profile updated");
      expect(liveRegion("assertive")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("announces an error assertively through a role=alert live region", () => {
    vi.useFakeTimers();
    try {
      error("boom");
      const region = liveRegion("assertive");
      expect(region).not.toBeNull();
      expect(region!.getAttribute("role")).toBe("alert");
      vi.advanceTimersByTime(100);
      expect(region!.textContent).toBe("boom");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not append the stack at import time — createToastView() is side-effect-free until mount", () => {
    // Constructing the view must not touch the DOM; the stack appears only on
    // the first mount. The ./index.js singleton builds a view at module-eval
    // time, so a side-effect-free factory means importing the module appends
    // nothing.
    const view = createToastView();
    expect(stack()).toBeNull();
    expect(document.body.childElementCount).toBe(0);

    view.mount(
      { id: 1, message: "hi", level: "info", duration: 0 },
      { dismiss: vi.fn(), pause: vi.fn(), resume: vi.fn() },
    );
    expect(stack()).not.toBeNull();
    view.dispose();
  });

  it("importing the toast module does not append anything to document.body", async () => {
    vi.resetModules();
    document.body.innerHTML = "";
    const fresh = await import("./index.js");
    // No import-time DOM mutation: the stack is lazy, created on the first show.
    expect(document.querySelector(".uip-toast-stack")).toBeNull();
    expect(document.body.childElementCount).toBe(0);
    // Clean up the fresh singleton's document Escape listener (no stack exists).
    fresh.toast.dispose();
  });

  it("sets --uip-toast-duration and renders a progress bar for timed toasts", () => {
    info("timed");
    const node = toasts()[0]!;
    expect(node.style.getPropertyValue("--uip-toast-duration")).toBe("4000ms");
    expect(node.querySelector(".uip-toast-progress")).not.toBeNull();
  });

  it("makes error toasts sticky (no progress bar) and gives them no role", () => {
    error("boom");
    const node = toasts()[0]!;
    expect(node.hasAttribute("role")).toBe(false);
    expect(node.style.getPropertyValue("--uip-toast-duration")).toBe("");
    expect(node.querySelector(".uip-toast-progress")).toBeNull();
  });

  it("dismisses via the returned function and removes the node after the leave transition", () => {
    const dismiss = info("bye");
    expect(toasts()).toHaveLength(1);
    const node = toasts()[0]!;
    dismiss();
    expect(node.classList.contains("is-leaving")).toBe(true);
    endTransition(node);
    expect(toasts()).toHaveLength(0);
  });

  it("dismisses on click", () => {
    info("clickme");
    const node = toasts()[0]!;
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(node.classList.contains("is-leaving")).toBe(true);
  });

  it("Escape dismisses the newest toast only", () => {
    error("first");
    error("second");
    const nodes = toasts();
    expect(nodes).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(nodes[1]!.classList.contains("is-leaving")).toBe(true);
    expect(nodes[0]!.classList.contains("is-leaving")).toBe(false);
  });

  it("renders a retry button that runs its handler and guards async rejection", async () => {
    const onClick = vi.fn().mockRejectedValue(new Error("nope"));
    error("failed", { label: "Try again", onClick });
    const btn = toasts()[0]!.querySelector<HTMLButtonElement>(".uip-toast-retry")!;
    expect(btn.textContent).toBe("Try again");
    expect(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).not.toThrow();
    expect(onClick).toHaveBeenCalledOnce();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("guards a retry handler that throws synchronously", () => {
    const onClick = vi.fn(() => {
      throw new Error("sync boom");
    });
    error("failed", { onClick });
    const btn = toasts()[0]!.querySelector<HTMLButtonElement>(".uip-toast-retry")!;
    expect(btn.textContent).toBe("Retry"); // default label
    expect(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }).not.toThrow();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("clear() removes all toasts immediately", () => {
    info("a");
    info("b");
    expect(toasts()).toHaveLength(2);
    toast.clear();
    expect(toasts()).toHaveLength(0);
  });

  it("pauses the progress animation on hover and resumes on leave", () => {
    info("hover me");
    const node = toasts()[0]!;
    const progress = node.querySelector<HTMLElement>(".uip-toast-progress")!;
    node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(progress.style.animationPlayState).toBe("paused");
    node.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(progress.style.animationPlayState).toBe("running");
  });

  it("ref-counts pause: un-hovering a still-focused toast does not restart its timer", () => {
    vi.useFakeTimers();
    try {
      info("hover+focus"); // timed (default 4000ms)
      const node = toasts()[0]!;
      node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true })); // pause (0->1)
      node.dispatchEvent(new Event("focusin", { bubbles: true })); // still paused (1->2)
      node.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true })); // still paused (2->1)
      vi.advanceTimersByTime(10000); // focused → paused → must NOT auto-dismiss
      expect(node.classList.contains("is-leaving")).toBe(false);
      expect(toasts()).toHaveLength(1);
      node.dispatchEvent(new Event("focusout", { bubbles: true })); // resume (1->0)
      vi.advanceTimersByTime(4000); // countdown resumes → dismisses
      expect(node.classList.contains("is-leaving")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the pending enter frame on dismiss and settles into a leaving state", () => {
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const dismiss = info("quick"); // dismissed before the enter rAF fires
    const node = toasts()[0]!;
    expect(node.classList.contains("is-entering")).toBe(true);
    dismiss();
    expect(cancelSpy).toHaveBeenCalled();
    expect(node.classList.contains("is-entering")).toBe(false);
    expect(node.classList.contains("is-leaving")).toBe(true);
    endTransition(node); // transitionend fires (no 400ms fallback wait)
    expect(toasts()).toHaveLength(0);
  });

  it("createToaster() is disposable: dispose stops the ESC listener without leaking it", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const toaster = createToaster();
    // The ESC handler is live: a sticky toast is dismissed by Escape.
    toaster.show("sticky", { level: "error" });
    const node = document.querySelector<HTMLElement>(".uip-toast")!;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(node.classList.contains("is-leaving")).toBe(true);

    toaster.dispose();
    // Container + toasts gone, and the document listener was removed.
    expect(document.querySelector(".uip-toast-stack")).toBeNull();
    const adds = addSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    const removes = removeSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    expect(adds).toBe(1);
    expect(removes).toBe(1);
  });

  it("repeated createToaster()/dispose() cycles do not accumulate document listeners", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    for (let i = 0; i < 5; i++) {
      createToaster().dispose();
    }
    const adds = addSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    const removes = removeSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    expect(adds).toBe(5);
    expect(removes).toBe(5);
  });

  it("dismisses a focused toast when Enter is pressed on the toast node", () => {
    info("enter me");
    const node = toasts()[0]!;
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(node.classList.contains("is-leaving")).toBe(true);
  });

  it("dismisses a focused toast when Space is pressed on the toast node", () => {
    info("space me");
    const node = toasts()[0]!;
    node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(node.classList.contains("is-leaving")).toBe(true);
  });

  it("ignores a keydown bubbling up from the retry button (does not dismiss the toast)", () => {
    error("with retry", { onClick: vi.fn() });
    const node = toasts()[0]!;
    const btn = node.querySelector<HTMLButtonElement>(".uip-toast-retry")!;
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(node.classList.contains("is-leaving")).toBe(false);
  });
});
