// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { prompt, _resetForTest } from "./prompt.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  _resetForTest();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function dialogEl(): HTMLDialogElement {
  const d = document.querySelector<HTMLDialogElement>("dialog.uip-prompt");
  if (d === null) {
    throw new Error("prompt dialog not mounted");
  }
  return d;
}

function inputEl(): HTMLInputElement {
  const i = dialogEl().querySelector<HTMLInputElement>(".uip-prompt-input");
  if (i === null) {
    throw new Error("prompt input missing");
  }
  return i;
}

function submit(): void {
  const form = dialogEl().querySelector<HTMLFormElement>(".uip-prompt-form");
  form?.dispatchEvent(new Event("submit", { cancelable: true }));
}

describe("prompt", () => {
  it("resolves the typed value on submit (OK / Enter path)", async () => {
    const p = prompt("Name this key:");
    inputEl().value = "deploy key";
    submit();
    await expect(p).resolves.toBe("deploy key");
  });

  it('resolves the raw value — empty submit is "", distinct from cancel\'s null', async () => {
    const p = prompt("Label:");
    submit();
    await expect(p).resolves.toBe("");
  });

  it("resolves null on Cancel, and on Escape via the cancel event", async () => {
    const p1 = prompt("First:");
    dialogEl().querySelector<HTMLButtonElement>(".uip-prompt-cancel")?.click();
    await expect(p1).resolves.toBeNull();

    const p2 = prompt("Second:");
    const cancel = new Event("cancel", { cancelable: true });
    dialogEl().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    await expect(p2).resolves.toBeNull();
  });

  it("resolves null on a drag-safe backdrop click", async () => {
    const p = prompt("Value:");
    const d = dialogEl();
    d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    d.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await expect(p).resolves.toBeNull();
  });

  it("a newer prompt preempts the prior one (null) and reuses the dialog", async () => {
    const first = prompt("One:");
    const second = prompt("Two:");
    await expect(first).resolves.toBeNull();
    expect(document.querySelectorAll("dialog.uip-prompt")).toHaveLength(1);
    inputEl().value = "x";
    submit();
    await expect(second).resolves.toBe("x");
  });

  it("applies type / initialValue / placeholder / maxLength / autocomplete, and resets them", async () => {
    const p1 = prompt("Password:", {
      type: "password",
      initialValue: "hunter2",
      placeholder: "Your password",
      maxLength: 64,
      autocomplete: "current-password",
    });
    const input = inputEl();
    expect(input.type).toBe("password");
    expect(input.value).toBe("hunter2");
    expect(input.placeholder).toBe("Your password");
    expect(input.maxLength).toBe(64);
    expect(input.autocomplete).toBe("current-password");
    expect(document.activeElement).toBe(input);
    submit();
    await p1;

    const p2 = prompt("Plain:");
    expect(input.type).toBe("text");
    expect(input.value).toBe("");
    expect(input.hasAttribute("placeholder")).toBe(false);
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(input.autocomplete).toBe("off");
    submit();
    await p2;
  });

  it("labels the dialog by the title when present (message becomes the description)", async () => {
    const p1 = prompt("Enter the new name:", { title: "Rename" });
    const d = dialogEl();
    expect(d.getAttribute("aria-labelledby")).toBe("uip-prompt-title");
    expect(d.getAttribute("aria-describedby")).toBe("uip-prompt-msg");
    submit();
    await p1;

    const p2 = prompt("Just a message:");
    expect(d.getAttribute("aria-labelledby")).toBe("uip-prompt-msg");
    expect(d.hasAttribute("aria-describedby")).toBe(false);
    const title = d.querySelector<HTMLElement>(".uip-prompt-title");
    expect(title?.hidden).toBe(true);
    submit();
    await p2;
  });

  it("the message is the input's native <label>", async () => {
    const p = prompt("API key label:");
    const label = dialogEl().querySelector<HTMLLabelElement>(".uip-prompt-msg");
    expect(label?.htmlFor).toBe("uip-prompt-input");
    expect(label?.textContent).toBe("API key label:");
    submit();
    await p;
  });
});
