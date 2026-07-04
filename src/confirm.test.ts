// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { confirm, _resetForTest } from "./confirm.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function dialogEl(): HTMLDialogElement {
  const d = document.querySelector<HTMLDialogElement>("dialog.uip-confirm");
  if (d === null) {
    throw new Error("confirm dialog not found");
  }
  return d;
}

function click(selector: string): void {
  dialogEl()
    .querySelector<HTMLButtonElement>(selector)!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("confirm", () => {
  it("resolves true when the confirm button is clicked", async () => {
    const p = confirm("Delete?");
    click(".uip-confirm-ok");
    await expect(p).resolves.toBe(true);
  });

  it("resolves false when the cancel button is clicked", async () => {
    const p = confirm("Delete?");
    click(".uip-confirm-cancel");
    await expect(p).resolves.toBe(false);
  });

  it("labels the dialog by its title and describes it by the message when a title is given", () => {
    void confirm("Are you sure?", { title: "Heads up", confirmLabel: "Yes", cancelLabel: "No" });
    const d = dialogEl();
    expect(d.querySelector(".uip-confirm-msg")!.textContent).toBe("Are you sure?");
    expect(d.querySelector(".uip-confirm-title")!.textContent).toBe("Heads up");
    expect(d.querySelector(".uip-confirm-ok")!.textContent).toBe("Yes");
    expect(d.querySelector(".uip-confirm-cancel")!.textContent).toBe("No");
    // Name = concise title; description = message body.
    expect(d.getAttribute("aria-labelledby")).toBe("uip-confirm-title");
    expect(d.getAttribute("aria-describedby")).toBe("uip-confirm-msg");
  });

  it("labels a title-less confirm by its message and sets no describedby", () => {
    void confirm("Just a plain message");
    const d = dialogEl();
    expect(d.getAttribute("aria-labelledby")).toBe("uip-confirm-msg");
    expect(d.getAttribute("aria-describedby")).toBeNull();
  });

  it("destructive variant uses role=alertdialog and focuses Cancel", () => {
    void confirm("Delete everything?", { variant: "destructive" });
    const d = dialogEl();
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.querySelector(".uip-confirm-ok")!.classList.contains("is-destructive")).toBe(true);
    expect(document.activeElement).toBe(d.querySelector(".uip-confirm-cancel"));
  });

  it("normal variant clears any prior alertdialog role and destructive modifier", () => {
    void confirm("danger", { variant: "destructive" });
    void confirm("normal");
    const d = dialogEl();
    expect(d.getAttribute("role")).toBeNull();
    expect(d.querySelector(".uip-confirm-ok")!.classList.contains("is-destructive")).toBe(false);
  });

  it("Escape (cancel event) resolves false", async () => {
    const p = confirm("Sure?");
    dialogEl().dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p).resolves.toBe(false);
  });

  it("a backdrop press+release on the dialog resolves false", async () => {
    const p = confirm("Sure?");
    const d = dialogEl();
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await expect(p).resolves.toBe(false);
  });

  it("preempts a prior open confirm, resolving it false; the newer one still resolves", async () => {
    const p1 = confirm("First?");
    const p2 = confirm("Second?");
    await expect(p1).resolves.toBe(false);
    click(".uip-confirm-ok");
    await expect(p2).resolves.toBe(true);
  });

  it("reuses a single dialog element across calls", () => {
    void confirm("one");
    void confirm("two");
    expect(document.querySelectorAll("dialog.uip-confirm")).toHaveLength(1);
  });
});
