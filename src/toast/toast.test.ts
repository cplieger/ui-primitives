// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

import { toast, info, error, _resetForTest } from "./index.js";

afterEach(() => {
  _resetForTest();
  document.body.innerHTML = "";
});

function stack(): HTMLElement | null {
  return document.querySelector(".uip-toast-stack");
}

function toasts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".uip-toast")];
}

function endTransition(node: HTMLElement): void {
  node.dispatchEvent(new Event("transitionend"));
}

describe("toast", () => {
  it("mounts a toast into a polite status stack with message, aria-label, tabindex", () => {
    info("Saved");
    const s = stack();
    expect(s).not.toBeNull();
    expect(s!.getAttribute("role")).toBe("status");
    expect(s!.getAttribute("aria-live")).toBe("polite");
    expect(s!.getAttribute("aria-atomic")).toBe("false");

    const nodes = toasts();
    expect(nodes).toHaveLength(1);
    const node = nodes[0]!;
    expect(node.querySelector(".uip-toast-msg")!.textContent).toBe("Saved");
    expect(node.getAttribute("aria-label")).toBe("info notification: Saved. Click to dismiss.");
    expect(node.getAttribute("tabindex")).toBe("0");
    expect(node.classList.contains("uip-toast--info")).toBe(true);
  });

  it("sets --uip-toast-duration and renders a progress bar for timed toasts", () => {
    info("timed");
    const node = toasts()[0]!;
    expect(node.style.getPropertyValue("--uip-toast-duration")).toBe("4000ms");
    expect(node.querySelector(".uip-toast-progress")).not.toBeNull();
  });

  it("gives error toasts role=alert and makes them sticky (no progress bar)", () => {
    error("boom");
    const node = toasts()[0]!;
    expect(node.getAttribute("role")).toBe("alert");
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
});
