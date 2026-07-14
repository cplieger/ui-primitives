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

describe("suspended-renderer safety", () => {
  afterEach(() => {
    // Restore the prototype-backed accessor removed by the defineProperty
    // override below.
    delete (document as unknown as Record<string, unknown>)["hidden"];
    vi.useRealTimers();
  });

  it("runs fn directly (no transition) when the document is hidden", async () => {
    const startViewTransition = vi.fn();
    (document as MutableDoc).startViewTransition = startViewTransition;
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const fn = vi.fn();
    await viewTransition(fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("watchdog skips a transition whose finished never settles, and the queue survives", async () => {
    vi.useFakeTimers();
    // A starved renderer grants no rendering opportunities: `finished` pends
    // forever until skipTransition() flushes the update via task queues.
    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const skipTransition = vi.fn(() => {
      resolveFinished();
    });
    (document as MutableDoc).startViewTransition = (cb: () => void) => {
      cb();
      return {
        finished,
        ready: new Promise(() => undefined),
        updateCallbackDone: Promise.resolve(),
        skipTransition,
      };
    };
    const fn = vi.fn();
    const first = viewTransition(fn);
    const queued = vi.fn();
    const second = viewTransition(queued); // must not wedge behind the first
    await vi.advanceTimersByTimeAsync(1_000);
    await first;
    expect(skipTransition).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await second;
    expect(queued).toHaveBeenCalledOnce();
  });

  it("clears the watchdog when the transition finishes normally", async () => {
    vi.useFakeTimers();
    const skipTransition = vi.fn();
    (document as MutableDoc).startViewTransition = (cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition,
      };
    };
    await viewTransition(vi.fn());
    await vi.advanceTimersByTimeAsync(2_000);
    expect(skipTransition).not.toHaveBeenCalled();
  });
});
