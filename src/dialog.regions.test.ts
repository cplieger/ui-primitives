import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { announce, mountLiveRegions, _resetForTest as resetAnnounce } from "./announce.js";
import { ask, _resetForTest as resetAsk } from "./ask.js";
import { createDialog, openDialog } from "./dialog.js";
import { createModal, _resetForTest as resetModal } from "./modal.js";
import { topmostOpenDialog } from "./modal-host.js";

/** Matches the leave-transition fallback, so a close completes with no CSS. */
const SETTLE_MS = 400;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetAsk();
  resetModal();
  resetAnnounce();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function pairIn(host: HTMLElement): { polite: HTMLElement; assertive: HTMLElement } {
  const own = [...host.children].filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute("aria-live"),
  );
  expect(own.map((r) => r.getAttribute("aria-live"))).toEqual(["polite", "assertive"]);
  return { polite: own[0]!, assertive: own[1]! };
}

/** The `[aria-live]` count inside each dialog at the moment its showModal() runs. */
function regionsAtShowModal(): number[] {
  const seen: number[] = [];
  const original = HTMLDialogElement.prototype.showModal;
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    seen.push(this.querySelectorAll(":scope > [aria-live]").length);
    original.call(this);
  });
  return seen;
}

describe("dialog primitives mount their own pair before showModal()", () => {
  it("createDialog", () => {
    const seen = regionsAtShowModal();
    const dlg = document.createElement("dialog");
    document.body.appendChild(dlg);
    createDialog(dlg).open();

    expect(seen).toEqual([2]);
    expect(dlg.open).toBe(true);
    pairIn(dlg);
  });

  it("createModal", () => {
    const seen = regionsAtShowModal();
    const modal = createModal(document.createElement("div"));
    modal.open();

    expect(seen).toEqual([2]);
    pairIn(modal.el);
  });

  it("ask, both shapes", () => {
    const seen = regionsAtShowModal();
    void ask("Sure?");
    void ask("Name?", { input: true });

    expect(seen).toEqual([2, 2]);
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog.uip-ask")];
    expect(dialogs).toHaveLength(2);
    for (const d of dialogs) {
      pairIn(d);
    }
  });
});

/** Resolves on `dialog`'s next native `close` event, which the platform fires
 *  on a later task than `close()`. A microtask checkpoint runs between
 *  listeners, so only listeners attached before this call have run by then. */
function nextClose(dialog: HTMLDialogElement): Promise<void> {
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

function callerDialog(): HTMLDialogElement {
  const dlg = document.createElement("dialog");
  document.body.appendChild(dlg);
  return dlg;
}

describe("a dialog's pair lives while the dialog is open", () => {
  it("leaves with the close, and a reopen mounts a fresh pair", async () => {
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    const before = pairIn(dlg);
    const closed = nextClose(dlg);
    controller.close();
    vi.advanceTimersByTime(SETTLE_MS);
    await closed;
    expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);

    controller.open();
    const after = pairIn(dlg);
    expect(after.polite).not.toBe(before.polite);
    expect(after.assertive).not.toBe(before.assertive);
  });

  it("survives a close event queued before a reopen", async () => {
    mountLiveRegions(document.body);
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    dlg.close();
    controller.open();
    await nextClose(dlg);

    announce("back");
    vi.advanceTimersByTime(100);
    expect(pairIn(dlg).polite.textContent).toBe("back");
  });

  it("leaves at once when dispose closes the open dialog, and the root hears", () => {
    mountLiveRegions(document.body);
    const root = pairIn(document.body);
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    controller.dispose();

    expect(dlg.open).toBe(false);
    expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);
    announce("root");
    vi.advanceTimersByTime(100);
    expect(root.polite.textContent).toBe("root");
  });

  it("hands announcements to the modal below once dispose closes the dialog over it", () => {
    mountLiveRegions(document.body);
    const lower = createModal(document.createElement("div"));
    lower.open();
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    controller.dispose();

    announce("lower");
    vi.advanceTimersByTime(100);
    expect(pairIn(lower.el).polite.textContent).toBe("lower");
  });

  it("is removed by dispose of a dialog closed by clearing open", () => {
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    dlg.open = false;
    controller.dispose();

    expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("of an open ended by clearing open is released at the next open", () => {
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    dlg.open = false;
    controller.open();
    const pair = pairIn(dlg);
    controller.dispose();

    expect(pair.polite.isConnected).toBe(false);
    expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);
  });
});

/** Every listener added to `target` from now on that is still attached:
 *  neither removed nor aborted through its `signal`. */
function attachedListeners(target: EventTarget): () => string[] {
  const added: { type: string; listener: unknown; capture: boolean; signal?: AbortSignal }[] = [];
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, "addEventListener").mockImplementation((type, listener, options) => {
    const opts = typeof options === "object" ? options : { capture: options === true };
    added.push({
      type,
      listener,
      capture: opts.capture === true,
      ...(opts.signal === undefined ? {} : { signal: opts.signal }),
    });
    add(type, listener, options);
  });
  vi.spyOn(target, "removeEventListener").mockImplementation((type, listener, options) => {
    const capture = typeof options === "object" ? options.capture === true : options === true;
    const at = added.findIndex(
      (a) => a.type === type && a.listener === listener && a.capture === capture,
    );
    if (at !== -1) {
      added.splice(at, 1);
    }
    remove(type, listener, options);
  });
  return () => added.filter((a) => a.signal?.aborted !== true).map((a) => a.type);
}

describe("a pair is owned, and only its owners release it", () => {
  it("keeps a later root mount on a dialog its disposed controller once opened", async () => {
    const dlg = callerDialog();
    const controller = createDialog(dlg);
    controller.open();
    const closed = nextClose(dlg);
    controller.close();
    vi.advanceTimersByTime(SETTLE_MS);
    await closed;
    controller.dispose();

    mountLiveRegions(dlg);
    dlg.showModal();
    const closedAgain = nextClose(dlg);
    dlg.close();
    await closedAgain;
    expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(2);
  });

  it.each(["close first", "root release first"] as const)(
    "keeps a pair a root mount and a dialog's open share until both release (%s)",
    async (order) => {
      const dlg = callerDialog();
      const releaseRoot = mountLiveRegions(dlg);
      const controller = createDialog(dlg);
      controller.open();
      const pair = pairIn(dlg);
      const closed = nextClose(dlg);

      if (order === "close first") {
        dlg.close();
        await closed;
        expect(pairIn(dlg).polite).toBe(pair.polite);
        releaseRoot();
      } else {
        releaseRoot();
        expect(pairIn(dlg).polite).toBe(pair.polite);
        dlg.close();
        await closed;
      }
      expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);
    },
  );

  it("ignores a repeated release, leaving the other owner's pair", () => {
    const first = mountLiveRegions(document.body);
    mountLiveRegions(document.body);
    first();
    first();

    pairIn(document.body);
    announce("still");
    vi.advanceTimersByTime(100);
    expect(pairIn(document.body).polite.textContent).toBe("still");
  });

  it("keeps a root pair on the same host through dispose before close", async () => {
    const dlg = callerDialog();
    mountLiveRegions(dlg);
    const pair = pairIn(dlg);
    const controller = createDialog(dlg);
    controller.open();
    const closed = nextClose(dlg);
    controller.dispose();
    await closed;

    expect(pairIn(dlg).polite).toBe(pair.polite);
  });

  it.each(["open", "closed"] as const)(
    "leaves no listener on a dialog disposed while %s",
    async (state) => {
      const dlg = callerDialog();
      const closed = nextClose(dlg);
      const attached = attachedListeners(dlg);
      const controller = createDialog(dlg);
      controller.open();
      if (state === "closed") {
        controller.close();
        vi.advanceTimersByTime(SETTLE_MS);
        await closed;
        controller.open();
        dlg.open = false;
      }
      controller.dispose();

      expect(attached()).toEqual([]);
    },
  );
});

/** Puts `dialog` where `showModal()` throws an `InvalidStateError`, and
 *  returns what brings it back to a state `show()` accepts. */
const unshowable = {
  "showing as a popover": (dialog: HTMLDialogElement): (() => void) => {
    dialog.popover = "manual";
    dialog.showPopover();
    return () => {
      dialog.hidePopover();
      dialog.removeAttribute("popover");
    };
  },
  disconnected: (dialog: HTMLDialogElement): (() => void) => {
    dialog.remove();
    return () => {
      document.body.append(dialog);
    };
  },
} as const;

describe("a failed showModal() leaves nothing of the open", () => {
  it.each(Object.keys(unshowable) as (keyof typeof unshowable)[])(
    "openDialog on a dialog %s",
    (state) => {
      const dlg = callerDialog();
      const attached = attachedListeners(dlg);
      const restore = unshowable[state](dlg);

      expect(() => {
        openDialog(dlg);
      }).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      expect(dlg.querySelectorAll("[aria-live]")).toHaveLength(0);
      expect(attached()).toEqual([]);

      restore();
      dlg.show();
      const direct = callerDialog();
      direct.showModal();
      expect(topmostOpenDialog()).toBe(direct);
    },
  );

  it.each(Object.keys(unshowable) as (keyof typeof unshowable)[])(
    "createModal open on a modal %s",
    (state) => {
      const modal = createModal(document.createElement("div"));
      const attached = attachedListeners(modal.el);
      const restore = unshowable[state](modal.el);

      expect(() => {
        modal.open();
      }).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
      expect(document.body.style.position).toBe("");
      expect(document.body.style.overflow).toBe("");
      expect(modal.el.querySelectorAll("[aria-live]")).toHaveLength(0);
      expect(attached()).toEqual([]);

      restore();
      modal.el.show();
      const direct = callerDialog();
      direct.showModal();
      expect(topmostOpenDialog()).toBe(direct);
    },
  );
});

describe("announcements follow the modal stack", () => {
  it("go to the topmost modal, then the one below once it closes, then the root", () => {
    mountLiveRegions(document.body);
    const root = pairIn(document.body);
    const lower = createModal(document.createElement("div"));
    const upper = createModal(document.createElement("div"));
    lower.open();
    upper.open();

    announce("top", "assertive");
    vi.advanceTimersByTime(100);
    expect(pairIn(upper.el).assertive.textContent).toBe("top");
    expect(pairIn(lower.el).assertive.textContent).toBe("");

    upper.close();
    vi.advanceTimersByTime(SETTLE_MS);
    announce("below", "assertive");
    vi.advanceTimersByTime(100);
    expect(pairIn(lower.el).assertive.textContent).toBe("below");

    lower.close();
    vi.advanceTimersByTime(SETTLE_MS);
    announce("root", "assertive");
    vi.advanceTimersByTime(100);
    expect(root.assertive.textContent).toBe("root");
  });

  it("reach an open ask dialog's pair", () => {
    mountLiveRegions(document.body);
    void ask("Delete?", { variant: "destructive" });
    const dialog = document.querySelector<HTMLDialogElement>("dialog.uip-ask")!;

    announce("one item selected");
    vi.advanceTimersByTime(100);
    expect(pairIn(dialog).polite.textContent).toBe("one item selected");
    expect(pairIn(document.body).polite.textContent).toBe("");
  });

  it("reach an ask opened over a modal built after it", async () => {
    mountLiveRegions(document.body);
    const first = ask("Warm up?");
    document.querySelector<HTMLButtonElement>("dialog.uip-ask .uip-ask-cancel")!.click();
    await first;
    vi.advanceTimersByTime(SETTLE_MS);
    const askDialog = document.querySelector<HTMLDialogElement>("dialog.uip-ask")!;
    expect(askDialog.open).toBe(false);

    const modal = createModal(document.createElement("div"));
    modal.open();
    void ask("Discard changes?");

    announce("hello");
    vi.advanceTimersByTime(100);
    expect(pairIn(askDialog).polite.textContent).toBe("hello");
    expect(pairIn(modal.el).polite.textContent).toBe("");
  });

  it("follow open order, not document order", () => {
    mountLiveRegions(document.body);
    const a = createModal(document.createElement("div"));
    const b = createModal(document.createElement("div"));
    b.open();
    a.open();

    announce("top");
    vi.advanceTimersByTime(100);
    expect(pairIn(a.el).polite.textContent).toBe("top");
    expect(pairIn(b.el).polite.textContent).toBe("");

    a.close();
    vi.advanceTimersByTime(SETTLE_MS);
    announce("below");
    vi.advanceTimersByTime(100);
    expect(pairIn(b.el).polite.textContent).toBe("below");
  });

  it("follow a dialog reopened over the one opened after it", () => {
    mountLiveRegions(document.body);
    const a = createModal(document.createElement("div"));
    const b = createModal(document.createElement("div"));
    a.open();
    a.close();
    vi.advanceTimersByTime(SETTLE_MS);
    b.open();
    a.open();

    announce("again");
    vi.advanceTimersByTime(100);
    expect(pairIn(a.el).polite.textContent).toBe("again");
    expect(pairIn(b.el).polite.textContent).toBe("");
  });

  it("skip a disposed modal that was on top", () => {
    mountLiveRegions(document.body);
    const lower = createModal(document.createElement("div"));
    const upper = createModal(document.createElement("div"));
    lower.open();
    upper.open();
    upper.dispose();

    announce("left");
    vi.advanceTimersByTime(100);
    expect(pairIn(lower.el).polite.textContent).toBe("left");
  });
});
