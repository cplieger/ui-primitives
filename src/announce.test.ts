// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";

import { announce, _resetForTest } from "./announce.js";

afterEach(() => {
  _resetForTest();
  document.body.innerHTML = "";
});

function regions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".uip-visually-hidden")];
}

describe("announce", () => {
  it("creates a single polite live region and sets its text on the next microtask", async () => {
    announce("hello");
    const all = regions();
    expect(all).toHaveLength(1);
    const region = all[0]!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe(""); // cleared synchronously
    await Promise.resolve();
    expect(region.textContent).toBe("hello");
  });

  it("reuses the same region across polite announcements", async () => {
    announce("one");
    await Promise.resolve();
    announce("two");
    await Promise.resolve();
    const all = regions();
    expect(all).toHaveLength(1);
    expect(all[0]!.textContent).toBe("two");
  });

  it("uses a separate assertive region with role=alert", async () => {
    announce("polite msg", "polite");
    announce("assertive msg", "assertive");
    await Promise.resolve();
    const polite = document.querySelector('[aria-live="polite"].uip-visually-hidden');
    const assertive = document.querySelector('[aria-live="assertive"].uip-visually-hidden');
    expect(polite?.textContent).toBe("polite msg");
    expect(assertive?.textContent).toBe("assertive msg");
    expect(assertive?.getAttribute("role")).toBe("alert");
    expect(regions()).toHaveLength(2);
  });

  it("re-announces an identical message by clearing then re-setting", async () => {
    announce("same");
    await Promise.resolve();
    expect(regions()[0]!.textContent).toBe("same");
    announce("same");
    expect(regions()[0]!.textContent).toBe(""); // cleared so the change is observable
    await Promise.resolve();
    expect(regions()[0]!.textContent).toBe("same");
  });
});
