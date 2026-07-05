// tooltip.ts — One delegated tooltip controller on `document`. Replaces bare
// `title` attributes with positioned, delay-aware, accessible tooltips.
//
// pointerover/pointerout (which bubble) + focusin/focusout drive a single
// delegated listener; Escape / capture-phase scroll / window blur hide. The
// first tooltip in a group waits `delayCold`; peers show after `delayWarm`
// while the group stays warm (`cooldown`). The trigger text is wired to the
// anchor via `aria-describedby` so AT announces it, and `\n` splits into
// <br>-separated lines. Placement is `position: fixed` via getBoundingClientRect
// with viewport clamping and above→below flip when there is no room above.

import { el } from "@cplieger/reactive";

import { placeAnchored } from "./popover.js";
import { afterTransition } from "./transition.js";

export interface TooltipOptions {
  /** Trigger attribute holding the tooltip text. Default `data-uip-tooltip`. */
  attribute?: string;
  /** Delay (ms) before the first tooltip of a cold group. Default 1000. */
  delayCold?: number;
  /** Delay (ms) before tooltips while the group is warm. Default 0. */
  delayWarm?: number;
  /** Warm window (ms) after a tooltip hides. Default 500. */
  cooldown?: number;
}

type TooltipState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pending";
      readonly anchor: HTMLElement;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  | { readonly kind: "visible"; readonly anchor: HTMLElement; readonly tip: HTMLElement }
  | { readonly kind: "fading"; readonly tip: HTMLElement };

const HIDE_FALLBACK_MS = 150;

let tipIdSeq = 0;

class TooltipController {
  private state: TooltipState = { kind: "idle" };
  private warmUntil = 0;
  private readonly attribute: string;
  private readonly selector: string;
  private readonly delayCold: number;
  private readonly delayWarm: number;
  private readonly cooldown: number;

  private readonly onPointerOver = (e: Event): void => {
    this.onEnter(e);
  };
  private readonly onPointerOut = (e: Event): void => {
    this.onLeave(e);
  };
  private readonly onFocusIn = (e: Event): void => {
    this.onEnter(e);
  };
  private readonly onFocusOut = (e: Event): void => {
    this.onLeave(e);
  };
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.hide();
    }
  };
  private readonly onScroll = (): void => {
    this.hide();
  };
  private readonly onWindowBlur = (): void => {
    this.hide();
  };

  constructor(opts: TooltipOptions) {
    this.attribute = opts.attribute ?? "data-uip-tooltip";
    this.selector = `[${this.attribute}]`;
    this.delayCold = opts.delayCold ?? 1000;
    this.delayWarm = opts.delayWarm ?? 0;
    this.cooldown = opts.cooldown ?? 500;
  }

  init(): void {
    document.addEventListener("pointerover", this.onPointerOver);
    document.addEventListener("pointerout", this.onPointerOut);
    document.addEventListener("focusin", this.onFocusIn);
    document.addEventListener("focusout", this.onFocusOut);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("scroll", this.onScroll, true);
    window.addEventListener("blur", this.onWindowBlur);
  }

  dispose(): void {
    document.removeEventListener("pointerover", this.onPointerOver);
    document.removeEventListener("pointerout", this.onPointerOut);
    document.removeEventListener("focusin", this.onFocusIn);
    document.removeEventListener("focusout", this.onFocusOut);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("scroll", this.onScroll, true);
    window.removeEventListener("blur", this.onWindowBlur);
    this.teardown();
  }

  private closestAnchor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const anchor = target.closest(this.selector);
    return anchor instanceof HTMLElement ? anchor : null;
  }

  private onEnter(e: Event): void {
    const anchor = this.closestAnchor(e.target);
    if (anchor === null) {
      return;
    }
    const text = anchor.getAttribute(this.attribute) ?? "";
    if (text === "") {
      return;
    }
    if (
      (this.state.kind === "pending" || this.state.kind === "visible") &&
      this.state.anchor === anchor
    ) {
      return;
    }
    this.teardown();
    const delay = Date.now() < this.warmUntil ? this.delayWarm : this.delayCold;
    const timer = setTimeout(() => {
      this.show(anchor, text);
    }, delay);
    this.state = { kind: "pending", anchor, timer };
  }

  private onLeave(e: Event): void {
    const anchor = this.closestAnchor(e.target);
    if (anchor === null) {
      return;
    }
    if (this.state.kind === "idle" || this.state.kind === "fading") {
      return;
    }
    if (this.state.anchor !== anchor) {
      return;
    }
    // Ignore transitions that stay within the same anchor subtree.
    const related = (e as { relatedTarget?: EventTarget | null }).relatedTarget ?? null;
    if (related instanceof Node && anchor.contains(related)) {
      return;
    }
    this.hide();
  }

  private show(anchor: HTMLElement, text: string): void {
    if (!anchor.isConnected) {
      this.state = { kind: "idle" };
      return;
    }
    this.teardown();

    const tipId = `uip-tip-${(++tipIdSeq).toString()}`;
    const tip = el(
      "div",
      { className: "uip-tooltip", role: "tooltip", id: tipId },
      ...renderLines(text),
    );
    // When the anchor is inside an open modal <dialog>, render the tooltip into
    // that dialog so it shares the dialog's top-layer stacking context;
    // appending to document.body would leave it painted behind the modal.
    const host: Element = anchor.closest("dialog[open]") ?? document.body;
    host.appendChild(tip);
    addDescribedBy(anchor, tipId);

    this.position(anchor, tip);

    this.state = { kind: "visible", anchor, tip };
    // Keep the group warm long enough to cover a cold-delay hover of a peer.
    this.warmUntil = Date.now() + this.cooldown + this.delayCold;
  }

  private position(anchor: HTMLElement, tip: HTMLElement): void {
    // Reuse the shared anchored positioner instead of re-deriving the math:
    // centered above the anchor, gap 6, viewport margin 4, flipping below when
    // there is no room above and clamping horizontally. placeAnchored also
    // reads window.visualViewport, so the tooltip stays correct above the
    // mobile on-screen keyboard.
    placeAnchored(tip, anchor, { placement: "top", align: "center", offset: 6, margin: 4 });
  }

  private hide(): void {
    if (this.state.kind === "pending") {
      clearTimeout(this.state.timer);
      this.state = { kind: "idle" };
      this.warmUntil = Date.now() + this.cooldown;
      return;
    }
    if (this.state.kind !== "visible") {
      return;
    }
    const { anchor, tip } = this.state;
    removeDescribedBy(anchor, tip.id);
    tip.classList.add("is-leaving");
    this.state = { kind: "fading", tip };
    this.warmUntil = Date.now() + this.cooldown;

    afterTransition(
      tip,
      () => {
        if (this.state.kind === "fading" && this.state.tip === tip) {
          this.state = { kind: "idle" };
        }
        tip.remove();
      },
      HIDE_FALLBACK_MS,
    );
  }

  private teardown(): void {
    switch (this.state.kind) {
      case "pending":
        clearTimeout(this.state.timer);
        break;
      case "visible":
        removeDescribedBy(this.state.anchor, this.state.tip.id);
        this.state.tip.remove();
        break;
      case "fading":
        this.state.tip.remove();
        break;
      case "idle":
        break;
    }
    this.state = { kind: "idle" };
  }
}

/** Append `id` to the anchor's `aria-describedby` token list, preserving any
 *  tokens the app already set. */
function addDescribedBy(anchor: HTMLElement, id: string): void {
  const current = anchor.getAttribute("aria-describedby");
  const tokens = current === null ? [] : current.split(/\s+/).filter((t) => t !== "");
  if (!tokens.includes(id)) {
    tokens.push(id);
  }
  anchor.setAttribute("aria-describedby", tokens.join(" "));
}

/** Remove only `id` from the anchor's `aria-describedby`, restoring the rest.
 *  Removes the attribute entirely only when nothing else remains. */
function removeDescribedBy(anchor: HTMLElement, id: string): void {
  const current = anchor.getAttribute("aria-describedby");
  if (current === null) {
    return;
  }
  const tokens = current.split(/\s+/).filter((t) => t !== "" && t !== id);
  if (tokens.length > 0) {
    anchor.setAttribute("aria-describedby", tokens.join(" "));
  } else {
    anchor.removeAttribute("aria-describedby");
  }
}

/** Split tooltip text on newlines into text nodes separated by <br>. */
function renderLines(text: string): (string | Node)[] {
  const lines = text.split("\n");
  const children: (string | Node)[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      children.push(el("br"));
    }
    children.push(lines[i] ?? "");
  }
  return children;
}

let controller: TooltipController | null = null;

/** Install the delegated tooltip controller once. Idempotent — later calls
 *  (including with different options) are no-ops until reset. */
export function initTooltips(opts?: TooltipOptions): void {
  if (controller !== null) {
    return;
  }
  controller = new TooltipController(opts ?? {});
  controller.init();
}

/** Test-only: remove the controller's listeners and any live tooltip. */
export function _resetForTest(): void {
  if (controller !== null) {
    controller.dispose();
    controller = null;
  }
}
