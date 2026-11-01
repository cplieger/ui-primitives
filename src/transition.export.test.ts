import { describe, it, expect } from "vitest";

import { cancelTransition, runTransition } from "@cplieger/ui-primitives/transition";
import type { TransitionSpec } from "@cplieger/ui-primitives/transition";

describe("the ./transition subpath export", () => {
  it("resolves runTransition, cancelTransition and TransitionSpec through the package exports", () => {
    expect(typeof runTransition).toBe("function");
    expect(typeof cancelTransition).toBe("function");

    const el = document.createElement("div");
    let settled = 0;
    const spec: TransitionSpec = {
      change: () => {
        el.classList.add("is-on");
      },
      settled: () => {
        settled++;
      },
    };
    runTransition(el, spec);
    expect(el.classList.contains("is-on")).toBe(true);
    el.dispatchEvent(new Event("transitionend"));
    expect(settled).toBe(1);
  });
});
