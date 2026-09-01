// tooltip.ts — One delegated tooltip controller on `document`. Replaces bare
// `title` attributes with positioned, delay-aware, accessible tooltips.
//
// BY DEFAULT `delayWarm` IS `delayCold`, so every hover waits the same time —
// matching native `title` behavior. A warm group (peers appearing faster once
// one has shown) is opt-in through an explicit smaller `delayWarm`.
//
// Scroll HIDES the tooltip rather than repositioning it, unlike popover:
// once the user scrolls, the pointer is no longer meaningfully over the
// anchor, matching native `title`; a popover is an opened surface the user is
// interacting with and must follow its anchor instead.

import { el } from "@cplieger/reactive";

import { placeAnchored } from "./popover.js";
import { cancelTransition, runTransition } from "./transition.js";

export interface TooltipOptions {
  /** Trigger attribute holding the tooltip text. Default `data-uip-tooltip`. */
  attribute?: string;
  /** Delay (ms) before the first tooltip of a cold group. Default 500, the
   *  hover time a native `title` waits out (Firefox's `ui.tooltipDelay`
   *  default; the Windows mouse-hover time is 400). */
  delayCold?: number;
  /** Delay (ms) before tooltips while the group is warm. Defaults to
   *  `delayCold`, so every hover costs the same wait. Set it lower to opt into
   *  a warm group, where a peer shows faster once one tooltip has. */
  delayWarm?: number;
  /** Warm window (ms) after a tooltip hides. Default 500. Inert while
   *  `delayWarm` equals `delayCold`. */
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
    // :focus-visible gate: a bare focusin also fires on programmatic focus
    // (modal open, focus-trap restore, autofocus), popping tooltips with no
    // hover or keypress.
    if (!isKeyboardFocus(e.target)) {
      return;
    }
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
    this.delayCold = opts.delayCold ?? 500;
    // Defaults to delayCold, not a constant, so a partial override can't
    // produce a warm path faster than the delay the caller asked for.
    this.delayWarm = opts.delayWarm ?? this.delayCold;
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
    // Shares the dialog's top-layer context; body-appended would paint behind a modal.
    const host: Element = anchor.closest("dialog[open]") ?? document.body;
    host.appendChild(tip);
    addDescribedBy(anchor, tipId);

    this.position(anchor, tip);

    this.state = { kind: "visible", anchor, tip };
    // Keep the group warm long enough to cover a cold-delay hover of a peer.
    this.warmUntil = Date.now() + this.cooldown + this.delayCold;
  }

  private position(anchor: HTMLElement, tip: HTMLElement): void {
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
    this.state = { kind: "fading", tip };
    this.warmUntil = Date.now() + this.cooldown;

    runTransition(tip, {
      change: () => {
        tip.classList.add("is-leaving");
      },
      settled: () => {
        this.state = { kind: "idle" };
        tip.remove();
      },
    });
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
        cancelTransition(this.state.tip);
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

/** True when the focus landing on `target` should count as keyboard-driven:
 *  the element matches `:focus-visible`. Engines without the selector (or a
 *  non-Element target) fall back to `true`, preserving the old show-on-focus
 *  behavior rather than silently disabling focus tooltips. */
function isKeyboardFocus(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
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
