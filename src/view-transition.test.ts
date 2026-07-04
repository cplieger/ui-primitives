// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";

import { viewTransition } from "./view-transition.js";

interface MutableDoc {
  startViewTransition?: unknown;
}

afterEach(() => {
  delete (document as MutableDoc).startViewTransition;
});

describe("viewTransition", () => {
  it("runs fn directly and resolves when startViewTransition is unavailable", async () => {
    delete (document as MutableDoc).startViewTransition;
    const fn = vi.fn();
    await viewTransition(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("awaits an async callback before resolving", async () => {
    delete (document as MutableDoc).startViewTransition;
    let done = false;
    await viewTransition(async () => {
      await Promise.resolve();
      done = true;
    });
    expect(done).toBe(true);
  });

  it("serializes overlapping calls in order", async () => {
    delete (document as MutableDoc).startViewTransition;
    const order: number[] = [];
    const p1 = viewTransition(() => {
      order.push(1);
    });
    const p2 = viewTransition(() => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it("uses startViewTransition when present and resolves on finished", async () => {
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => undefined,
      };
    });
    (document as MutableDoc).startViewTransition = startViewTransition;
    const fn = vi.fn();
    await viewTransition(fn);
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("resolves even when the transition's finished promise rejects", async () => {
    (document as MutableDoc).startViewTransition = (cb: () => void) => {
      cb();
      return {
        finished: Promise.reject(new Error("skipped")),
        ready: Promise.reject(new Error("skipped")),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => undefined,
      };
    };
    const fn = vi.fn();
    await expect(viewTransition(fn)).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("resolves (swallows) when fn rejects and the API is absent — matching the API path", async () => {
    delete (document as MutableDoc).startViewTransition;
    await expect(viewTransition(() => Promise.reject(new Error("boom")))).resolves.toBeUndefined();
  });

  it("resolves (swallows) when fn throws synchronously and the API is absent", async () => {
    delete (document as MutableDoc).startViewTransition;
    await expect(
      viewTransition(() => {
        throw new Error("sync boom");
      }),
    ).resolves.toBeUndefined();
  });

  it("a rejecting fn does not wedge the queue for the next call", async () => {
    delete (document as MutableDoc).startViewTransition;
    const order: number[] = [];
    const p1 = viewTransition(() => Promise.reject(new Error("boom")));
    const p2 = viewTransition(() => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([2]);
  });
});
