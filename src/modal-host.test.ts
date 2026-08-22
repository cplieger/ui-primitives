import { describe, it, expect, afterEach, vi } from "vitest";

import { topmostOpenDialog } from "./modal-host.js";

// modal-host resolves the open <dialog> that page-level chrome (the toast
// stack, the announce regions) must live inside to escape showModal()'s
// inertness. `matches` is stubbed per dialog to declare which ones the
// platform would call modal, so a test can state an arbitrary stack of open
// dialogs directly: the ORDERING preference is what this module decides, and
// driving it through real showModal() calls would make the fixture the
// platform's business rather than the test's.

afterEach(() => {
  document.body.innerHTML = "";
});

/** An open <dialog> whose `:modal` answer is `modal`, or that throws for it. */
function openDialog(modal: boolean | "throws"): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.setAttribute("open", "");
  document.body.appendChild(d);
  vi.spyOn(d, "matches").mockImplementation((selector: string) => {
    if (selector !== ":modal") {
      return false;
    }
    if (modal === "throws") {
      throw new SyntaxError("unsupported pseudo-class");
    }
    return modal;
  });
  return d;
}

describe("topmostOpenDialog", () => {
  it("returns null when no dialog is open", () => {
    document.body.appendChild(document.createElement("dialog")); // present but closed
    expect(topmostOpenDialog()).toBeNull();
  });

  it("prefers a modal dialog over a later non-modal one", () => {
    // Document order alone would pick the last open dialog. Chrome has to land
    // inside the MODAL one: that is the only subtree showModal() leaves live.
    const modal = openDialog(true);
    openDialog(false);
    expect(topmostOpenDialog()).toBe(modal);
  });

  it("takes the last modal dialog when several are open", () => {
    openDialog(true);
    const newest = openDialog(true);
    expect(topmostOpenDialog()).toBe(newest);
  });

  it("falls back to the last open dialog when none reports itself modal", () => {
    openDialog(false);
    const last = openDialog(false);
    expect(topmostOpenDialog()).toBe(last);
  });

  it("does not treat a dialog as modal when the :modal check throws", () => {
    // An engine without a faithful `:modal` must fall through to the
    // last-open-dialog fallback rather than trusting the failed probe.
    openDialog("throws");
    const last = openDialog(false);
    expect(topmostOpenDialog()).toBe(last);
  });
});
