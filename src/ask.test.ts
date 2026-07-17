// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { ask, _resetForTest } from "./ask.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function booleanDlg(): HTMLDialogElement {
  const d = document.querySelector<HTMLDialogElement>("dialog.uip-ask:not(.uip-ask--input)");
  if (d === null) {
    throw new Error("boolean ask dialog not found");
  }
  return d;
}

function inputDlg(): HTMLDialogElement {
  const d = document.querySelector<HTMLDialogElement>("dialog.uip-ask.uip-ask--input");
  if (d === null) {
    throw new Error("input ask dialog not found");
  }
  return d;
}

function click(scope: HTMLElement, selector: string): void {
  scope
    .querySelector<HTMLButtonElement>(selector)!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("ask (boolean shape)", () => {
  it("resolves true when the confirm button is clicked", async () => {
    const p = ask("Delete?");
    click(booleanDlg(), ".uip-ask-ok");
    await expect(p).resolves.toBe(true);
  });

  it("resolves false when the cancel button is clicked", async () => {
    const p = ask("Delete?");
    click(booleanDlg(), ".uip-ask-cancel");
    await expect(p).resolves.toBe(false);
  });

  it("labels the dialog by its title and describes it by the message when a title is given", () => {
    void ask("Are you sure?", { title: "Heads up", confirmLabel: "Yes", cancelLabel: "No" });
    const d = booleanDlg();
    expect(d.querySelector(".uip-ask-msg")!.textContent).toBe("Are you sure?");
    expect(d.querySelector(".uip-ask-title")!.textContent).toBe("Heads up");
    expect(d.querySelector(".uip-ask-ok")!.textContent).toBe("Yes");
    expect(d.querySelector(".uip-ask-cancel")!.textContent).toBe("No");
    // Name = concise title; description = message body.
    expect(d.getAttribute("aria-labelledby")).toBe("uip-ask-title");
    expect(d.getAttribute("aria-describedby")).toBe("uip-ask-msg");
  });

  it("labels a title-less ask by its message and sets no describedby", () => {
    void ask("Just a plain message");
    const d = booleanDlg();
    expect(d.getAttribute("aria-labelledby")).toBe("uip-ask-msg");
    expect(d.getAttribute("aria-describedby")).toBeNull();
  });

  it("destructive variant uses role=alertdialog and focuses Cancel", () => {
    void ask("Delete everything?", { variant: "destructive" });
    const d = booleanDlg();
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.querySelector(".uip-ask-ok")!.classList.contains("is-destructive")).toBe(true);
    expect(document.activeElement).toBe(d.querySelector(".uip-ask-cancel"));
  });

  it("normal variant clears any prior alertdialog role and destructive modifier", () => {
    void ask("danger", { variant: "destructive" });
    void ask("normal");
    const d = booleanDlg();
    expect(d.getAttribute("role")).toBeNull();
    expect(d.querySelector(".uip-ask-ok")!.classList.contains("is-destructive")).toBe(false);
  });

  it("Escape (cancel event) resolves false", async () => {
    const p = ask("Sure?");
    booleanDlg().dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p).resolves.toBe(false);
  });

  it("a backdrop press+release on the dialog resolves false", async () => {
    const p = ask("Sure?");
    const d = booleanDlg();
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await expect(p).resolves.toBe(false);
  });

  it("preempts a prior open ask, resolving it false; the newer one still resolves", async () => {
    const p1 = ask("First?");
    const p2 = ask("Second?");
    await expect(p1).resolves.toBe(false);
    click(booleanDlg(), ".uip-ask-ok");
    await expect(p2).resolves.toBe(true);
  });

  it("reuses a single dialog element across calls", () => {
    void ask("one");
    void ask("two");
    expect(document.querySelectorAll("dialog.uip-ask")).toHaveLength(1);
  });
});

describe("ask (input shape)", () => {
  it("resolves the typed value on submit (Enter / OK)", async () => {
    const p = ask("Name?", { input: true });
    const d = inputDlg();
    d.querySelector<HTMLInputElement>(".uip-ask-input")!.value = "zaphod";
    d.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await expect(p).resolves.toBe("zaphod");
  });

  it('resolves an empty submission as "", distinct from cancellation\'s null', async () => {
    const p = ask("Name?", { input: true });
    inputDlg()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await expect(p).resolves.toBe("");
  });

  it("resolves null on cancel", async () => {
    const p = ask("Name?", { input: true });
    click(inputDlg(), ".uip-ask-cancel");
    await expect(p).resolves.toBeNull();
  });

  it("resolves null on Escape (cancel event) and backdrop press", async () => {
    const p1 = ask("Name?", { input: true });
    inputDlg().dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p1).resolves.toBeNull();

    const p2 = ask("Name?", { input: true });
    const d = inputDlg();
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await expect(p2).resolves.toBeNull();
  });

  it("applies type / initialValue / placeholder / maxLength / autocomplete, and resets them", async () => {
    void ask("Password?", {
      input: {
        type: "password",
        initialValue: "hunter2",
        placeholder: "secret",
        maxLength: 32,
        autocomplete: "current-password",
      },
    });
    const input = inputDlg().querySelector<HTMLInputElement>(".uip-ask-input")!;
    expect(input.type).toBe("password");
    expect(input.value).toBe("hunter2");
    expect(input.placeholder).toBe("secret");
    expect(input.maxLength).toBe(32);
    expect(input.autocomplete).toBe("current-password");
    // The pre-filled value is selected so typing replaces it.
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("hunter2".length);

    // A later plain input ask must not inherit the previous configuration.
    inputDlg().dispatchEvent(new Event("cancel", { cancelable: true }));
    await Promise.resolve();
    void ask("Plain?", { input: true });
    expect(input.type).toBe("text");
    expect(input.value).toBe("");
    expect(input.hasAttribute("placeholder")).toBe(false);
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(input.autocomplete).toBe("off");
  });

  it("the message is the input's real <label>", () => {
    void ask("API key label:", { input: true });
    const d = inputDlg();
    const label = d.querySelector<HTMLLabelElement>("label.uip-ask-msg")!;
    expect(label.htmlFor).toBe("uip-ask-input");
    expect(label.textContent).toBe("API key label:");
  });

  it("destructive input ask keeps focus on the input (type-to-confirm flows)", () => {
    void ask("Type the name to delete:", { variant: "destructive", input: true });
    const d = inputDlg();
    expect(d.getAttribute("role")).toBe("alertdialog");
    expect(d.querySelector(".uip-ask-ok")!.classList.contains("is-destructive")).toBe(true);
    expect(document.activeElement).toBe(d.querySelector(".uip-ask-input"));
  });
});

describe("ask — one preemption domain across shapes", () => {
  it("an input ask preempts an open boolean ask (resolves false) and closes its dialog", async () => {
    const p1 = ask("Sure?");
    const d1 = booleanDlg();
    expect(d1.open).toBe(true);

    const p2 = ask("Name?", { input: true });
    await expect(p1).resolves.toBe(false);
    // The boolean dialog is fading closed (is-leaving), the input one is open.
    expect(d1.classList.contains("is-leaving")).toBe(true);
    expect(inputDlg().open).toBe(true);

    click(inputDlg(), ".uip-ask-cancel");
    await expect(p2).resolves.toBeNull();
  });

  it("a boolean ask preempts an open input ask (resolves null)", async () => {
    const p1 = ask("Name?", { input: true });
    const p2 = ask("Sure?");
    await expect(p1).resolves.toBeNull();
    click(booleanDlg(), ".uip-ask-ok");
    await expect(p2).resolves.toBe(true);
  });
});
