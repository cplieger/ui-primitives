import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import { createRoot, runWithOwner } from "@cplieger/reactive";

import { trapFocus } from "./focus-trap.js";
import {
  type World,
  explore,
  firstFailure,
  isInvalidState,
  sentinelsOnce,
  throwSentinel,
  type Scenario,
} from "./test-helpers/reentry.js";

// The re-entry property for a focus trap. The model tracks where focus must
// be: the first item on entry (the container itself when nothing inside is
// focusable), the wrapped edge on Tab and Shift+Tab, wherever the case moves
// it, and the return target once the trap is released.

type ReturnTo = "opener" | "outside" | "none";

interface Run {
  readonly empty: boolean;
  readonly returnFocus: ReturnTo;
  readonly script: readonly Step[];
  readonly injections: readonly {
    readonly at: number;
    readonly hit?: string;
    readonly actions: readonly Step[];
  }[];
}

type Step =
  | { readonly k: "tab" | "shiftTab" | "focusOutside" | "focusMiddle" }
  | { readonly k: "dispose" | "owner" | "throw" };

const stepArb = fc.constantFrom<Step>(
  { k: "tab" },
  { k: "shiftTab" },
  { k: "focusOutside" },
  { k: "focusMiddle" },
  { k: "dispose" },
  { k: "owner" },
);
const injArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 6, arbitrary: stepArb },
  { weight: 1, arbitrary: fc.constant<Step>({ k: "throw" }) },
);
const runArb: fc.Arbitrary<Run> = fc.record({
  empty: fc.boolean(),
  returnFocus: fc.constantFrom<ReturnTo>("opener", "outside", "none"),
  script: fc.array(stepArb, { minLength: 1, maxLength: 8 }),
  injections: fc.array(
    fc.record({
      at: fc.nat({ max: 300 }),
      actions: fc.array(injArb, { minLength: 1, maxLength: 2 }),
    }),
    {
      maxLength: 2,
    },
  ),
});

const scenarioFor =
  (run: Run) =>
  (w: World): Scenario<Step> => {
    const failure: string | null = null;
    const opener = w.probe("opener", "button");
    const outside = w.probe("outside", "button");
    const container = w.probe("container");
    const items = [
      w.probe("first", "button"),
      w.probe("middle", "button"),
      w.probe("last", "button"),
    ];
    w.quiet(() => {
      container.removeAttribute("tabindex");
      if (!run.empty) {
        container.append(...items);
      }
      document.body.append(opener, container, outside);
      opener.focus();
    });
    const returnTo =
      run.returnFocus === "opener" ? opener : run.returnFocus === "outside" ? outside : null;
    const m = { active: opener as HTMLElement, ended: false, restoring: false };
    let entered = false;
    // A Tab's own redirect focus is not the entry focus.
    let tabbing = 0;
    let starting = false;
    // The release's focus restore runs at once, or, from code a call of the trap's
    // reaches (its entry focus, a Tab redirect), when that call returns. It lands at
    // the return target's own focus hit, or changes nothing when focus is already there.
    w.onHit = (kind) => {
      // The trap's entry focus: the first item, or the container when nothing inside is focusable.
      if (
        !m.ended &&
        !entered &&
        tabbing === 0 &&
        kind === (run.empty ? "focus@container" : "focus@first")
      ) {
        entered = true;
        m.active = run.empty ? container : first;
      }
      if (
        m.restoring &&
        returnTo !== null &&
        kind === `focus@${String(returnTo.getAttribute("data-probe"))}`
      ) {
        m.restoring = false;
        m.active = returnTo;
      }
    };
    // A released trap moves focus only to its return target; a live one only inside its container.
    w.admit = (write) => {
      if (write.name === "focus") {
        return m.ended ? write.el === returnTo : container.contains(write.el);
      }
      return m.ended ? false : undefined;
    };
    let release: (() => void) | undefined;
    let disposeParent = (): void => undefined;
    const first = items[0]!;
    const last = items[2]!;

    const end = (how: "dispose" | "owner"): void => {
      if (how === "dispose" && release === undefined) {
        // A setup hit: the release function is not returned yet.
        return;
      }
      w.entry(null, () => {
        if (!m.ended) {
          m.ended = true;
          if (
            returnTo !== null &&
            tabbing === 0 &&
            !starting &&
            document.activeElement === returnTo
          ) {
            m.active = returnTo;
          } else {
            m.restoring = true;
          }
        }
        if (how === "dispose") {
          release?.();
        } else {
          disposeParent();
        }
      });
    };
    const tab = (shift: boolean): void => {
      w.entry(null, () => {
        if (!m.ended) {
          const inside = container.contains(m.active);
          if (run.empty) {
            m.active = container;
          } else if (!inside) {
            m.active = shift ? last : first;
          } else if (shift && m.active === first) {
            m.active = last;
          } else if (!shift && m.active === last) {
            m.active = first;
          }
        }
        tabbing++;
        try {
          (document.activeElement ?? document.body).dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Tab",
              shiftKey: shift,
              bubbles: true,
              cancelable: true,
            }),
          );
        } finally {
          tabbing--;
        }
      });
    };

    return {
      start(): void {
        starting = true;
        w.entry(null, () => {
          const [d, parent] = createRoot((dispose, owner) => [dispose, owner] as const);
          disposeParent = d;
          release = runWithOwner(parent, () =>
            trapFocus(container, { returnFocus: returnTo === opener ? true : (returnTo ?? false) }),
          );
        });
        starting = false;
      },
      act(s: Step): undefined {
        switch (s.k) {
          case "tab":
          case "shiftTab":
            tab(s.k === "shiftTab");
            return;
          case "focusOutside":
            w.entry(null, () => {
              m.active = outside;
              outside.focus();
            });
            return;
          case "focusMiddle":
            if (run.empty) {
              return;
            }
            w.entry(null, () => {
              m.active = items[1]!;
              items[1]!.focus();
            });
            return;
          case "dispose":
          case "owner":
            end(s.k);
            return;
          case "throw":
            throwSentinel(w);
        }
      },
      check(where: string): string | null {
        if (m.restoring) {
          m.restoring = false;
          if (returnTo !== null) {
            m.active = returnTo;
          }
        }
        return (
          failure ??
          firstFailure(where, [
            [
              document.activeElement === m.active,
              `focus on ${String(document.activeElement?.getAttribute("data-probe"))}, model ${String(m.active.getAttribute("data-probe"))}`,
            ],
            [
              w.ledger.count(document, ["keydown"]) === (m.ended ? 0 : 1),
              "the document keydown listener",
            ],
          ])
        );
      },
      finish(): string | null {
        return failure ?? sentinelsOnce(w, isInvalidState);
      },
      cleanup(): void {
        release?.();
      },
    };
  };

afterEach(() => {
  document.body.replaceChildren();
});

describe("trapFocus: re-entry property", () => {
  it("focus lands where the trap's contract puts it through re-entry", async () => {
    await fc.assert(
      fc.asyncProperty(runArb, async (run) => {
        expect(await explore(scenarioFor(run), run)).toBeNull();
      }),
      {
        numRuns: 150,
        examples: [
          // A dispose from a focus handler outside any call of the trap's: the restore
          // finds focus on the return target already, and the handler's later focus stays.
          [
            {
              empty: false,
              returnFocus: "outside",
              script: [{ k: "focusOutside" }, { k: "tab" }],
              injections: [
                { at: 0, hit: "focus@outside", actions: [{ k: "dispose" }, { k: "focusMiddle" }] },
              ],
            },
          ],
          // An owner released from a focus handler the Shift+Tab redirect reaches, which
          // then moves focus inside: the restore runs once the redirect returns.
          [
            {
              empty: false,
              returnFocus: "outside",
              script: [{ k: "shiftTab" }],
              injections: [
                {
                  at: 0,
                  hit: "focus@last",
                  actions: [{ k: "focusOutside" }, { k: "focusMiddle" }],
                },
                { at: 0, hit: "focus@outside", actions: [{ k: "owner" }] },
              ],
            },
          ],
          // An owner release at the container's tabindex write leaves focus where the release put it.
          [
            {
              empty: true,
              returnFocus: "opener",
              script: [{ k: "tab" }],
              injections: [{ at: 0, hit: "attr:tabindex@container", actions: [{ k: "owner" }] }],
            },
          ],
        ],
      },
    );
  }, 60000);
});
