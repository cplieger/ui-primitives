import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";

import {
  ToastEngine,
  type ToastCallbacks,
  type ToastRenderData,
  type ToastView,
} from "./engine.js";

interface FakeToast {
  data: ToastRenderData;
  ctx: ToastCallbacks;
  left: boolean;
  removed: boolean;
  paused: boolean;
  done: (() => void) | null;
}

function makeFakeView(autoLeave = true): { view: ToastView<FakeToast>; mounts: FakeToast[] } {
  const mounts: FakeToast[] = [];
  const view: ToastView<FakeToast> = {
    mount(data, ctx) {
      const handle: FakeToast = {
        data,
        ctx,
        left: false,
        removed: false,
        paused: false,
        done: null,
      };
      mounts.push(handle);
      return handle;
    },
    scheduleLeave(handle, done) {
      handle.left = true;
      if (autoLeave) {
        done();
      } else {
        handle.done = done;
      }
    },
    remove(handle) {
      handle.removed = true;
    },
    pauseProgress(handle) {
      handle.paused = true;
    },
    resumeProgress(handle) {
      handle.paused = false;
    },
    dispose() {
      /* no-op */
    },
  };
  return { view, mounts };
}

describe("ToastEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses per-level default durations (info/success = default, error = sticky 0)", () => {
    const { view, mounts } = makeFakeView();
    const engine = new ToastEngine<FakeToast>({ view, defaultDuration: 1234 });
    engine.show("a", { level: "info" });
    engine.show("b", { level: "success" });
    engine.show("c", { level: "error" });
    expect(mounts[0]!.data.duration).toBe(1234);
    expect(mounts[1]!.data.duration).toBe(1234);
    expect(mounts[2]!.data.duration).toBe(0);
  });

  it("honors an explicit duration override", () => {
    const { view, mounts } = makeFakeView();
    const engine = new ToastEngine<FakeToast>({ view, defaultDuration: 4000 });
    engine.show("x", { level: "info", duration: 500 });
    expect(mounts[0]!.data.duration).toBe(500);
  });

  it("promotes from the queue when a visible slot frees up", () => {
    const { view, mounts } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 2, defaultDuration: 0 });
    const dismiss1 = engine.show("1");
    engine.show("2");
    engine.show("3");
    expect(engine.visibleCount).toBe(2);
    expect(engine.queuedCount).toBe(1);
    expect(mounts).toHaveLength(2);

    dismiss1();
    expect(engine.visibleCount).toBe(2);
    expect(engine.queuedCount).toBe(0);
    expect(mounts).toHaveLength(3);
    expect(mounts[2]!.data.message).toBe("3");
  });

  it("caps the queue at maxQueue, dropping the oldest queued toast", () => {
    const { view } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({
      view,
      maxVisible: 1,
      maxQueue: 2,
      defaultDuration: 0,
    });
    engine.show("visible");
    engine.show("q1");
    engine.show("q2");
    engine.show("q3"); // drops q1
    expect(engine.visibleCount).toBe(1);
    expect(engine.queuedCount).toBe(2);
  });

  it("a dropped queued toast's dismiss function is a no-op", () => {
    const { view } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({
      view,
      maxVisible: 1,
      maxQueue: 1,
      defaultDuration: 0,
    });
    engine.show("visible");
    const dropped = engine.show("will-queue");
    engine.show("evicts-the-previous"); // drops "will-queue"
    expect(engine.queuedCount).toBe(1);
    expect(() => {
      dropped();
    }).not.toThrow();
    expect(engine.queuedCount).toBe(1);
  });

  it("pauses and resumes the dismiss timer with correct remaining-time math", () => {
    vi.useFakeTimers();
    const { view, mounts } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 1, defaultDuration: 1000 });
    engine.show("t", { level: "info", duration: 1000 });
    expect(engine.visibleCount).toBe(1);

    vi.advanceTimersByTime(400);
    mounts[0]!.ctx.pause();
    expect(mounts[0]!.paused).toBe(true);

    vi.advanceTimersByTime(5000); // paused: must not dismiss
    expect(engine.visibleCount).toBe(1);

    mounts[0]!.ctx.resume();
    expect(mounts[0]!.paused).toBe(false);

    vi.advanceTimersByTime(599); // 600 remained, not yet elapsed
    expect(engine.visibleCount).toBe(1);
    vi.advanceTimersByTime(2);
    expect(engine.visibleCount).toBe(0);
  });

  it("auto-dismisses a timed toast after its duration", () => {
    vi.useFakeTimers();
    const { view } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 3, defaultDuration: 4000 });
    engine.show("hi", { level: "info" });
    expect(engine.visibleCount).toBe(1);
    vi.advanceTimersByTime(3999);
    expect(engine.visibleCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(engine.visibleCount).toBe(0);
  });

  it("sticky toasts (duration 0) never auto-dismiss", () => {
    vi.useFakeTimers();
    const { view } = makeFakeView(true);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 3 });
    engine.show("e", { level: "error" });
    vi.advanceTimersByTime(1_000_000);
    expect(engine.visibleCount).toBe(1);
  });

  it("clear() removes all visible toasts and empties the queue", () => {
    const { view, mounts } = makeFakeView(false);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 2, defaultDuration: 0 });
    engine.show("1");
    engine.show("2");
    engine.show("3"); // queued
    engine.clear();
    expect(engine.visibleCount).toBe(0);
    expect(engine.queuedCount).toBe(0);
    expect(mounts[0]!.removed).toBe(true);
    expect(mounts[1]!.removed).toBe(true);
  });

  it("dismissNewest() dismisses the most recently shown visible toast", () => {
    const { view, mounts } = makeFakeView(false);
    const engine = new ToastEngine<FakeToast>({ view, maxVisible: 3, defaultDuration: 0 });
    engine.show("old");
    engine.show("new");
    engine.dismissNewest();
    expect(mounts[0]!.left).toBe(false);
    expect(mounts[1]!.left).toBe(true);
  });

  it("property: visible never exceeds maxVisible and queue never exceeds maxQueue", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }),
        (maxVisible, maxQueue, ops) => {
          const { view } = makeFakeView(true);
          const engine = new ToastEngine<FakeToast>({
            view,
            maxVisible,
            maxQueue,
            defaultDuration: 0,
          });
          const dismissers: (() => void)[] = [];
          for (const isShow of ops) {
            if (isShow) {
              dismissers.push(engine.show("m", { level: "error" })); // sticky
            } else {
              const dismiss = dismissers.shift();
              if (dismiss) {
                dismiss();
              }
            }
            expect(engine.visibleCount).toBeLessThanOrEqual(maxVisible);
            expect(engine.queuedCount).toBeLessThanOrEqual(maxQueue);
          }
        },
      ),
    );
  });
});

describe("ToastEngine: mode replace (single-slot latest-wins)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a new toast instantly removes the visible one — remove, not a leave; nothing queues", () => {
    const { view, mounts } = makeFakeView();
    const engine = new ToastEngine<FakeToast>({ view, mode: "replace", defaultDuration: 0 });

    engine.show("first");
    engine.show("second");
    expect(engine.visibleCount).toBe(1);
    expect(engine.queuedCount).toBe(0);
    expect(mounts).toHaveLength(2);
    expect(mounts[0]?.removed).toBe(true);
    expect(mounts[0]?.left).toBe(false);
    expect(mounts[1]?.removed).toBe(false);
  });

  it("ignores maxVisible (single slot) and cancels the replaced toast's timer", () => {
    vi.useFakeTimers();
    const { view, mounts } = makeFakeView();
    const engine = new ToastEngine<FakeToast>({
      view,
      mode: "replace",
      maxVisible: 5,
      defaultDuration: 1000,
    });

    engine.show("a");
    engine.show("b");
    expect(engine.visibleCount).toBe(1);

    // Only b's timer may fire; a's was cancelled with its removal.
    vi.advanceTimersByTime(1000);
    expect(mounts[0]?.left).toBe(false);
    expect(mounts[1]?.left).toBe(true);
  });

  it("a replaced toast's dismiss fn is a safe no-op", () => {
    const { view, mounts } = makeFakeView();
    const engine = new ToastEngine<FakeToast>({ view, mode: "replace", defaultDuration: 0 });
    const dismissFirst = engine.show("first");
    engine.show("second");
    dismissFirst(); // must not throw or touch the new toast
    expect(engine.visibleCount).toBe(1);
    expect(mounts[1]?.left).toBe(false);
    expect(mounts[1]?.removed).toBe(false);
  });
});
