// modal.ts — Overlay-<div> modal. The sibling to the native-<dialog> `dialog`
// member: use `dialog` when the platform <dialog> is enough (it gives focus
// containment, the top layer, and Escape for free); use this when your modal is
// an overlay div (`.uip-modal`) and the library has to manage containment,
// stacking, scroll-lock, and the enter/leave lifecycle by hand — apps whose
// modals are `.modal-overlay` divs, that need custom stacking or transitions, or
// that grid-center to dodge the Safari <dialog> height bug.
//
// The hard parts a native <dialog> gives for free, reimplemented here:
//   - Focus containment via the `focus-trap` member, managed as a STACK. The
//     trap installs a DOCUMENT-CAPTURE keydown, so two live traps fight over
//     Tab. We keep only the TOPMOST trap active: opening a child modal pauses
//     (releases) the parent's trap; closing the child re-traps the parent.
//     `returnFocus` chains down the stack (each modal restores focus to its own
//     opener, which sits inside the modal below it).
//   - Inert background (`inert`) + scroll-lock (`overflow:hidden` on the root),
//     BOTH ref-counted across the stack so they release only when the last
//     modal closes.
//   - Drag-safe backdrop dismiss: close only when a press STARTS and ENDS on the
//     overlay itself (mousedown+mouseup both === overlay), so a drag-select that
//     escapes the panel doesn't dismiss.

import { el } from "@cplieger/reactive";

import { trapFocus } from "./focus-trap.js";

/** Fallback (ms) if `transitionend` never fires on the panel (no CSS
 *  transition, reduced motion, or an interrupted animation). */
const LEAVE_FALLBACK_MS = 400;

export interface ModalOptions {
  /** Close when the backdrop (the overlay itself) is clicked. Default `true`. */
  closeOnBackdrop?: boolean;
  /** Close on Escape (topmost modal only). Default `true`. */
  closeOnEscape?: boolean;
  /** ARIA role for the panel. Default `"dialog"`. */
  role?: "dialog" | "alertdialog";
  /** `id` for `aria-labelledby`. When omitted, a descendant whose `id` ends in
   *  `-title` is auto-detected. */
  labelledBy?: string;
  /** `id` for `aria-describedby`. */
  describedBy?: string;
  /** Element to focus on open. Defaults to the first focusable in the panel. */
  initialFocus?: HTMLElement | null;
  /** Where focus goes when this modal closes. `true`/omitted restores the
   *  element focused before it opened; an `HTMLElement` focuses that element;
   *  `false` leaves focus alone. Chains down the stack. */
  returnFocus?: boolean | HTMLElement;
  /** Lock page scroll while open (`overflow:hidden` on `<html>`/`<body>`),
   *  ref-counted across the stack. Default `true`. */
  scrollLock?: boolean;
  /** Mark background siblings `inert` while open, ref-counted across the stack.
   *  Default `true`. */
  inertBackground?: boolean;
  /** Invoked after this modal has finished closing. */
  onClose?: () => void;
}

export interface ModalController {
  open(): void;
  close(): void;
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  dispose(): void;
}

interface ModalEntry {
  readonly overlay: HTMLElement;
  readonly panel: HTMLElement;
  readonly closeOnBackdrop: boolean;
  readonly closeOnEscape: boolean;
  readonly scrollLock: boolean;
  readonly inertBackground: boolean;
  readonly onClose: (() => void) | undefined;
  /** Focus-restore target computed at open time from `returnFocus`. */
  readonly opener: HTMLElement | null;
  /** Active focus-trap release fn; `null` while the trap is paused. */
  releaseTrap: (() => void) | null;
  readonly onMouseDown: (e: MouseEvent) => void;
  readonly onMouseUp: (e: MouseEvent) => void;
  /** Pending enter-frame handle, or `null` once it has run / been cancelled. */
  enterRaf: number | null;
  /** Set once `closeModal` has begun this modal's leave lifecycle. */
  leaving: boolean;
  /** Set once torn down, so a dispose + a pending leave can't double-release. */
  torndown: boolean;
}

// The open-modal stack (topmost last) and the state shared across it.
const stack: ModalEntry[] = [];
// Elements WE currently hold `inert` on (so an app-set inert is never clobbered
// and everything is released together when the stack empties).
const ourInert = new Set<Element>();
let scrollLockCount = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";
let docKeydown: ((e: KeyboardEvent) => void) | null = null;

/** The panel is the first `.uip-modal-dialog` descendant, else the overlay's
 *  first element child, else the overlay itself (degenerate). */
function resolvePanel(overlay: HTMLElement): HTMLElement {
  const found = overlay.querySelector<HTMLElement>(".uip-modal-dialog");
  if (found !== null) {
    return found;
  }
  const firstChild = overlay.firstElementChild;
  return firstChild instanceof HTMLElement ? firstChild : overlay;
}

/** Auto-detect an accessible-name target: a descendant whose id ends `-title`. */
function autoLabelId(panel: HTMLElement): string | null {
  const titled = panel.querySelector<HTMLElement>("[id$='-title']");
  return titled !== null && titled.id !== "" ? titled.id : null;
}

function applyScrollLock(): void {
  scrollLockCount++;
  if (scrollLockCount === 1) {
    savedHtmlOverflow = document.documentElement.style.overflow;
    savedBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
}

function releaseScrollLock(): void {
  if (scrollLockCount === 0) {
    return;
  }
  scrollLockCount--;
  if (scrollLockCount === 0) {
    document.documentElement.style.overflow = savedHtmlOverflow;
    document.body.style.overflow = savedBodyOverflow;
  }
}

/** Recompute background inerting from the stack: every `<body>` child except
 *  the topmost modal's overlay is marked `inert` (so a lower modal's overlay is
 *  inert while a child is on top, and interactive again once it becomes top).
 *  Runs on every open/close, so inert is fully released only when the last modal
 *  closes. We track exactly the elements we set, never clobbering an app-set
 *  `inert`, and the top modal's `inertBackground` governs whether we inert at
 *  all. */
function syncInert(): void {
  const top = stack[stack.length - 1];
  const wantInert = top?.inertBackground ?? false;
  const topOverlay = top?.overlay;
  const bodyChildren = Array.from(document.body.children);

  // Release anything we hold that should no longer be inert.
  for (const node of [...ourInert]) {
    if (!wantInert || node === topOverlay || !bodyChildren.includes(node)) {
      node.removeAttribute("inert");
      ourInert.delete(node);
    }
  }
  if (!wantInert) {
    return;
  }
  // Inert every background sibling we don't already own and the app hasn't set.
  for (const child of bodyChildren) {
    if (child === topOverlay || child.hasAttribute("inert")) {
      continue;
    }
    child.setAttribute("inert", "");
    ourInert.add(child);
  }
}

function ensureDocKeydown(): void {
  if (docKeydown !== null) {
    return;
  }
  docKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") {
      return;
    }
    const top = stack[stack.length - 1];
    if (top !== undefined && top.closeOnEscape && !top.leaving) {
      closeModal(top.overlay);
    }
  };
  document.addEventListener("keydown", docKeydown);
}

function maybeRemoveDocKeydown(): void {
  if (stack.length === 0 && docKeydown !== null) {
    document.removeEventListener("keydown", docKeydown);
    docKeydown = null;
  }
}

/** Open `overlay` as a modal: reveal it, trap focus in its panel, inert the
 *  background, lock scroll, and wire backdrop dismissal. The showModal()
 *  equivalent for an overlay div. Idempotent per overlay; reopening one caught
 *  mid fade-out revives it. */
export function openModal(overlay: HTMLElement, opts?: ModalOptions): void {
  const existing = stack.find((e) => e.overlay === overlay);
  if (existing !== undefined) {
    if (existing.leaving) {
      // Reopened mid fade-out: cancel the leave; the pending finish() no-ops
      // because we clear `is-leaving` (its guard). Trap/inert/scroll-lock were
      // never released, so nothing to re-acquire.
      existing.leaving = false;
      overlay.classList.remove("is-leaving");
      overlay.classList.add("is-open");
    }
    return;
  }

  const closeOnBackdrop = opts?.closeOnBackdrop ?? true;
  const closeOnEscape = opts?.closeOnEscape ?? true;
  const role = opts?.role ?? "dialog";
  const returnFocus = opts?.returnFocus ?? true;
  const scrollLock = opts?.scrollLock ?? true;
  const inertBackground = opts?.inertBackground ?? true;

  overlay.classList.add("uip-modal");
  overlay.classList.toggle("uip-modal--alert", role === "alertdialog");

  const panel = resolvePanel(overlay);
  panel.classList.add("uip-modal-dialog");
  panel.setAttribute("role", role);
  panel.setAttribute("aria-modal", "true");
  const labelledBy = opts?.labelledBy ?? autoLabelId(panel);
  if (labelledBy !== null) {
    panel.setAttribute("aria-labelledby", labelledBy);
  }
  if (opts?.describedBy !== undefined) {
    panel.setAttribute("aria-describedby", opts.describedBy);
  }

  // Hoist to <body> so background inerting (siblings of the overlay) and
  // stacking behave like a real top layer.
  if (overlay.parentNode !== document.body) {
    document.body.appendChild(overlay);
  }

  // Capture the focus-restore target BEFORE we move focus into the panel.
  const opener =
    returnFocus === false
      ? null
      : returnFocus instanceof HTMLElement
        ? returnFocus
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

  // Pause the current top trap. It was created with returnFocus:false, so its
  // release moves no focus — this module owns focus restoration.
  const parent = stack[stack.length - 1];
  if (parent !== undefined && parent.releaseTrap !== null) {
    parent.releaseTrap();
    parent.releaseTrap = null;
  }

  // Reveal, then transition in on the next frame (is-entering -> is-open).
  overlay.classList.remove("is-leaving");
  overlay.hidden = false;
  overlay.classList.add("is-entering");

  // Trap focus in the panel (topmost). returnFocus:false so pausing it later
  // never moves focus.
  const releaseTrap = trapFocus(panel, {
    returnFocus: false,
    initialFocus: opts?.initialFocus ?? null,
  });

  let downOnOverlay = false;
  const onMouseDown = (e: MouseEvent): void => {
    downOnOverlay = e.target === overlay;
  };
  const onMouseUp = (e: MouseEvent): void => {
    const onBackdrop = e.target === overlay && downOnOverlay;
    downOnOverlay = false;
    if (closeOnBackdrop && onBackdrop) {
      closeModal(overlay);
    }
  };
  overlay.addEventListener("mousedown", onMouseDown);
  overlay.addEventListener("mouseup", onMouseUp);

  const entry: ModalEntry = {
    overlay,
    panel,
    closeOnBackdrop,
    closeOnEscape,
    scrollLock,
    inertBackground,
    onClose: opts?.onClose,
    opener,
    releaseTrap,
    onMouseDown,
    onMouseUp,
    enterRaf: null,
    leaving: false,
    torndown: false,
  };
  stack.push(entry);

  if (scrollLock) {
    applyScrollLock();
  }
  syncInert();
  ensureDocKeydown();

  entry.enterRaf = requestAnimationFrame(() => {
    entry.enterRaf = null;
    overlay.classList.remove("is-entering");
    overlay.classList.add("is-open");
  });
}

/** Close `overlay` after a fade-out: add `is-leaving`, wait for `transitionend`
 *  on the panel (or the fallback), then tear down (release trap, un-inert,
 *  un-scroll-lock, restore focus) and invoke `onClose`/`onClosed`. */
export function closeModal(overlay: HTMLElement, onClosed?: () => void): void {
  const entry = stack.find((e) => e.overlay === overlay);
  if (entry === undefined || entry.leaving) {
    onClosed?.();
    return;
  }
  entry.leaving = true;

  // A close can land before the enter frame runs. Cancel it and settle into
  // is-open so the leave transition starts from a defined state and its
  // transitionend fires instead of stalling on the fallback.
  if (entry.enterRaf !== null) {
    cancelAnimationFrame(entry.enterRaf);
    entry.enterRaf = null;
    overlay.classList.remove("is-entering");
    overlay.classList.add("is-open");
  }

  let done = false;
  let fallback: ReturnType<typeof setTimeout> | null = null;
  const finish = (): void => {
    if (done) {
      return;
    }
    done = true;
    if (fallback !== null) {
      clearTimeout(fallback);
    }
    entry.panel.removeEventListener("transitionend", onEnd);
    // Don't yank it closed if a newer owner reset the leaving state (reopened).
    if (overlay.classList.contains("is-leaving")) {
      teardown(entry);
      onClosed?.();
    }
  };
  const onEnd = (e: TransitionEvent): void => {
    if (e.target === entry.panel) {
      finish();
    }
  };
  entry.panel.addEventListener("transitionend", onEnd);
  fallback = setTimeout(finish, LEAVE_FALLBACK_MS);
  overlay.classList.remove("is-open");
  overlay.classList.add("is-leaving");
}

/** Close the topmost open (non-leaving) modal. Returns `true` if one closed. */
export function closeTopModal(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry !== undefined && !entry.leaving) {
      closeModal(entry.overlay);
      return true;
    }
  }
  return false;
}

/** Release everything a modal holds and restore focus down the stack. Safe to
 *  call once; a second call (dispose racing a pending leave) is a no-op. */
function teardown(entry: ModalEntry): void {
  if (entry.torndown) {
    return;
  }
  entry.torndown = true;

  const { overlay } = entry;
  overlay.classList.remove("is-leaving", "is-open", "is-entering");
  overlay.hidden = true;
  overlay.removeEventListener("mousedown", entry.onMouseDown);
  overlay.removeEventListener("mouseup", entry.onMouseUp);

  if (entry.releaseTrap !== null) {
    entry.releaseTrap();
    entry.releaseTrap = null;
  }

  const i = stack.indexOf(entry);
  if (i !== -1) {
    stack.splice(i, 1);
  }

  if (entry.scrollLock) {
    releaseScrollLock();
  }
  syncInert();

  const newTop = stack[stack.length - 1];
  if (newTop !== undefined) {
    // Re-trap the parent, focusing this modal's opener so focus returns into
    // the parent at the spot it left (returnFocus chaining down the stack).
    newTop.releaseTrap = trapFocus(newTop.panel, {
      returnFocus: false,
      initialFocus: entry.opener,
    });
  } else {
    if (entry.opener?.isConnected === true) {
      entry.opener.focus();
    }
    maybeRemoveDocKeydown();
  }

  entry.onClose?.();
}

/** Build a modal from `content`: wrap it in a `.uip-modal-dialog` panel inside a
 *  `.uip-modal` overlay appended to `<body>` (hidden until opened). */
export function createModal(content: HTMLElement, opts?: ModalOptions): ModalController {
  content.classList.add("uip-modal-dialog");
  const overlay = el("div", { className: "uip-modal", hidden: true }, content);
  document.body.appendChild(overlay);

  return {
    el: overlay,
    get isOpen(): boolean {
      return stack.some((e) => e.overlay === overlay && !e.leaving);
    },
    open(): void {
      openModal(overlay, opts);
    },
    close(): void {
      closeModal(overlay);
    },
    dispose(): void {
      const entry = stack.find((e) => e.overlay === overlay);
      if (entry !== undefined) {
        if (entry.enterRaf !== null) {
          cancelAnimationFrame(entry.enterRaf);
          entry.enterRaf = null;
        }
        teardown(entry);
      }
      overlay.remove();
    },
  };
}

/** Test-only: force-tear-down every open modal and reset shared state. */
export function _resetForTest(): void {
  for (const entry of [...stack]) {
    if (entry.enterRaf !== null) {
      cancelAnimationFrame(entry.enterRaf);
      entry.enterRaf = null;
    }
    teardown(entry);
  }
  stack.length = 0;
  for (const node of ourInert) {
    node.removeAttribute("inert");
  }
  ourInert.clear();
  scrollLockCount = 0;
  savedHtmlOverflow = "";
  savedBodyOverflow = "";
  if (docKeydown !== null) {
    document.removeEventListener("keydown", docKeydown);
    docKeydown = null;
  }
}
