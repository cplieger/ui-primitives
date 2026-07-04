// theme.ts — Persisted tri-state theme controller (light / dark / system).
// While the choice is "system" it follows the OS preference live via
// matchMedia; concrete choices are pinned. The resolved concrete value is
// written to a document-element attribute (default `data-theme`) so CSS can
// key off it. `themeInitSnippet` produces an inline blocking-script string for
// paint-time application (a real import can't run before first paint).

export type ThemeChoice = "light" | "dark" | "system";
type Resolved = "light" | "dark";

export interface ThemeOptions {
  /** localStorage-style key the preference is persisted under. */
  storageKey: string;
  /** Storage backend. Defaults to `window.localStorage`. */
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Attribute set on `<html>` with the resolved value. Default `data-theme`. */
  attribute?: string;
  /** Called with the resolved concrete theme whenever it changes/applies. */
  onChange?: (resolved: Resolved) => void;
}

export interface ThemeController {
  /** The stored preference (may be `"system"`). */
  get(): ThemeChoice;
  /** Persist + apply a preference. */
  set(choice: ThemeChoice): void;
  /** The concrete resolved theme (`"system"` → OS value via matchMedia). */
  resolved(): Resolved;
  /** Cycle light → dark → system → light. */
  cycle(): void;
  /** The current OS preference. */
  getSystem(): Resolved;
  /** Remove the matchMedia listener. */
  dispose(): void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_ATTRIBUTE = "data-theme";

function isChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** Create a theme controller bound to the given storage key. Applies the
 *  resolved theme immediately and starts following the OS while in "system". */
export function createTheme(opts: ThemeOptions): ThemeController {
  const attribute = opts.attribute ?? DEFAULT_ATTRIBUTE;
  const storage = opts.storage ?? window.localStorage;
  const mql = window.matchMedia(DARK_QUERY);

  const readChoice = (): ThemeChoice => {
    let stored: string | null;
    try {
      stored = storage.getItem(opts.storageKey);
    } catch {
      stored = null;
    }
    return isChoice(stored) ? stored : "system";
  };

  let choice: ThemeChoice = readChoice();

  const getSystem = (): Resolved => (mql.matches ? "dark" : "light");
  const resolved = (): Resolved => (choice === "system" ? getSystem() : choice);

  const apply = (): void => {
    const value = resolved();
    document.documentElement.setAttribute(attribute, value);
    opts.onChange?.(value);
  };

  const set = (next: ThemeChoice): void => {
    choice = next;
    try {
      storage.setItem(opts.storageKey, next);
    } catch {
      // Storage denied (private mode / disabled) — apply in memory only.
    }
    apply();
  };

  const cycle = (): void => {
    set(choice === "light" ? "dark" : choice === "dark" ? "system" : "light");
  };

  const onSystemChange = (): void => {
    if (choice === "system") {
      apply();
    }
  };
  mql.addEventListener("change", onSystemChange);

  apply();

  return {
    get: () => choice,
    set,
    resolved,
    cycle,
    getSystem,
    dispose: () => {
      mql.removeEventListener("change", onSystemChange);
    },
  };
}

/** Build a self-contained IIFE string that reads the stored preference and sets
 *  the resolved theme attribute synchronously. Inline it in a blocking `<head>`
 *  script so the correct theme is painted before stylesheets parse:
 *
 *      <script>{themeInitSnippet("app-theme")}</script>
 */
export function themeInitSnippet(storageKey: string, attribute = DEFAULT_ATTRIBUTE): string {
  const key = JSON.stringify(storageKey);
  const attr = JSON.stringify(attribute);
  return (
    `(function(){try{` +
    `var c=localStorage.getItem(${key});` +
    `if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}` +
    `var r=c==="system"?(window.matchMedia("${DARK_QUERY}").matches?"dark":"light"):c;` +
    `document.documentElement.setAttribute(${attr},r);` +
    `}catch(e){document.documentElement.setAttribute(${attr},"light");}})();`
  );
}
