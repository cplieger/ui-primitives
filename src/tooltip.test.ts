// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initTooltips, _resetForTest } from "./tooltip.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function anchor(text: string): HTMLElement {
  const el = document.createElement("button");
  el.setAttribute("data-uip-tooltip", text);
  document.body.appendChild(el);
  return el;
}

function tip(): HTMLElement | null {
  return document.querySelector(".uip-tooltip");
}

function pointerOver(el: HTMLElement): void {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

function pointerOut(el: HTMLElement, related: EventTarget | null = null): void {
  const e = new Event("pointerout", { bubbles: true }) as Event & {
    relatedTarget: EventTarget | null;
  };
  e.relatedTarget = related;
  el.dispatchEvent(e);
}

describe("initTooltips", () => {
  it("shows a tooltip after the cold delay and wires aria-describedby", () => {
    initTooltips();
    const a = anchor("Hello");
    pointerOver(a);
    expect(tip()).toBeNull(); // still pending during the cold delay
    vi.advanceTimersByTime(1000);
    const t = tip();
    expect(t).not.toBeNull();
    expect(t!.getAttribute("role")).toBe("tooltip");
    expect(t!.textContent).toBe("Hello");
    expect(t!.id).not.toBe("");
    expect(a.getAttribute("aria-describedby")).toBe(t!.id);
  });

  it("hides on pointerout, removing aria-describedby and the element", () => {
    initTooltips();
    const a = anchor("Hello");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();

    pointerOut(a, null);
    expect(a.getAttribute("aria-describedby")).toBeNull();
    expect(tip()!.classList.contains("is-leaving")).toBe(true);
    vi.advanceTimersByTime(150); // fallback removal
    expect(tip()).toBeNull();
  });

  it("uses the warm (instant) delay for a peer within the cooldown window", () => {
    initTooltips();
    const a = anchor("A");
    const b = anchor("B");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()!.textContent).toBe("A");
    pointerOut(a, null);
    vi.advanceTimersByTime(150); // remove A; group is now warm
    pointerOver(b);
    vi.advanceTimersByTime(1); // warm delay is 0
    expect(tip()!.textContent).toBe("B");
  });

  it("splits multiline text on newlines with <br>", () => {
    initTooltips();
    const a = anchor("line1\nline2");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(t.querySelectorAll("br")).toHaveLength(1);
    expect(t.textContent).toBe("line1line2");
  });

  it("Escape hides the tooltip", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    vi.advanceTimersByTime(150);
    expect(tip()).toBeNull();
  });

  it("honors a custom attribute and delay options", () => {
    initTooltips({ attribute: "data-hint", delayCold: 200 });
    const el = document.createElement("button");
    el.setAttribute("data-hint", "Custom");
    document.body.appendChild(el);
    pointerOver(el);
    vi.advanceTimersByTime(200);
    expect(tip()!.textContent).toBe("Custom");
  });

  it("is idempotent — a second initTooltips does not double-install", () => {
    initTooltips();
    initTooltips();
    const a = anchor("X");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(document.querySelectorAll(".uip-tooltip")).toHaveLength(1);
  });

  it("ignores triggers with an empty tooltip value", () => {
    initTooltips();
    const a = anchor("");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).toBeNull();
  });

  it("hides on capture-phase scroll", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    document.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(150);
    expect(tip()).toBeNull();
  });

  it("hides on window blur", () => {
    initTooltips();
    const a = anchor("Hi");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    expect(tip()).not.toBeNull();
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(150);
    expect(tip()).toBeNull();
  });

  it("preserves a pre-existing aria-describedby, appending then removing only its own id", () => {
    initTooltips();
    const a = anchor("Hi");
    a.setAttribute("aria-describedby", "foo");
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(a.getAttribute("aria-describedby")).toBe(`foo ${t.id}`);
    pointerOut(a, null);
    expect(a.getAttribute("aria-describedby")).toBe("foo"); // prior token restored
    vi.advanceTimersByTime(150);
  });

  it("renders into an open ancestor <dialog> so it clears the modal's top layer", () => {
    initTooltips();
    const d = document.createElement("dialog");
    d.setAttribute("open", "");
    const a = document.createElement("button");
    a.setAttribute("data-uip-tooltip", "In dialog");
    d.appendChild(a);
    document.body.appendChild(d);
    pointerOver(a);
    vi.advanceTimersByTime(1000);
    const t = tip()!;
    expect(t.parentElement).toBe(d); // appended into the dialog, not document.body
  });
});
