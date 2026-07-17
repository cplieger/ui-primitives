// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { announce, _resetForTest } from "./announce.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function regions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".uip-visually-hidden")];
}

describe("announce", () => {
  it("creates a single polite live region and sets its text after the delay", () => {
    announce("hello");
    const all = regions();
    expect(all).toHaveLength(1);
    const region = all[0]!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe(""); // cleared synchronously
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("hello");
  });

  it("reuses the same region across polite announcements", () => {
    announce("one");
    vi.advanceTimersByTime(100);
    announce("two");
    vi.advanceTimersByTime(100);
    const all = regions();
    expect(all).toHaveLength(1);
    expect(all[0]!.textContent).toBe("two");
  });

  it("uses a separate assertive region with role=alert", () => {
    announce("polite msg", "polite");
    announce("assertive msg", "assertive");
    vi.advanceTimersByTime(100);
    const polite = document.querySelector('[aria-live="polite"].uip-visually-hidden');
    const assertive = document.querySelector('[aria-live="assertive"].uip-visually-hidden');
    expect(polite?.textContent).toBe("polite msg");
    expect(assertive?.textContent).toBe("assertive msg");
    expect(assertive?.getAttribute("role")).toBe("alert");
    expect(regions()).toHaveLength(2);
  });

  it("re-announces an identical message by clearing then re-setting after the delay", () => {
    announce("same");
    vi.advanceTimersByTime(100);
    expect(regions()[0]!.textContent).toBe("same");
    announce("same");
    expect(regions()[0]!.textContent).toBe(""); // cleared so the change is observable
    vi.advanceTimersByTime(100);
    expect(regions()[0]!.textContent).toBe("same");
  });

  it("cancels a pending announce so a rapid second message wins (first never lands)", () => {
    announce("first");
    vi.advanceTimersByTime(50);
    announce("second"); // cancels first's pending timer
    // At +50ms from the second call (and +100ms from the first): the first
    // would have landed here if it had NOT been cancelled. It must not.
    vi.advanceTimersByTime(50);
    expect(regions()[0]!.textContent).toBe("");
    vi.advanceTimersByTime(50); // now +100ms from the second call
    expect(regions()[0]!.textContent).toBe("second");
  });
});

describe("announce: modal <dialog> re-homing", () => {
  it("homes the region into an open modal (inert-safe) and back after it closes", () => {
    const dlg = document.createElement("dialog");
    document.body.appendChild(dlg);
    dlg.showModal();

    // showModal() inerts everything outside the dialog subtree, and inert
    // content is silent to AT — the region must live INSIDE the dialog.
    announce("saved inside modal");
    const region = regions()[0]!;
    expect(region.parentElement).toBe(dlg);
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("saved inside modal");

    dlg.close();
    dlg.remove();

    // Next announce re-resolves the host: back on document.body (and the
    // region survives its host's removal — it re-attaches).
    announce("back outside");
    expect(region.parentElement).toBe(document.body);
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("back outside");
  });
});
