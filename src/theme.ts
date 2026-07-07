// theme.ts — Persisted tri-state theme controller (light / dark / system).
// While the choice is "system" it follows the OS preference live via
// matchMedia; concrete choices are pinned. The resolved concrete value is
// written to a document-element attribute (default `data-theme`) so CSS can
// key off it. `themeInitSnippet` produces an inline blocking-script string for
// paint-time application (a real import can't run before first paint).

export type ThemeChoice = "light" | "dark" | "system";
type Resolved = "light" | "dark";

/** Persistence adapter for the theme preference. Encapsulates WHERE and HOW the
 *  value is stored, so an app can keep the theme inside its own structure (for
 *  example a field of a larger JSON blob) rather than a bare localStorage key. */
export interface ThemeStorage {
  /** Read the persisted preference, or `null` when nothing is stored yet. */
  get(): string | null;
  /** Persist the preference value. */
  set(value: string): void;
}

export interface ThemeOptions {
  /** localStorage key the default adapter persists under. Unused when a custom
   *  `storage` adapter is supplied (the adapter owns where the value lives). */
  storageKey: string;
  /** Persistence adapter. Defaults to bare `localStorage[storageKey]`. Supply a
   *  custom adapter to read/write the theme inside your own structure — e.g. a
   *  `theme` field of a JSON blob: `get` parses the blob and returns the field,
   *  `set` does a read-modify-write of that field. Everything else (tri-state
   *  resolution, following the OS while `system`, the applied attribute) is
   *  unchanged; a 2-state app simply never calls `set("system")`. */
  storage?: ThemeStorage;
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
  // Default adapter: a bare localStorage key. Access is lazy (only inside
  // get/set) and every call is wrapped in try/catch below, so blocked or absent
  // storage degrades to in-memory rather than throwing at construction.
  const storage: ThemeStorage = opts.storage ?? {
    get: () => window.localStorage.getItem(opts.storageKey),
    set: (value) => {
      window.localStorage.setItem(opts.storageKey, value);
    },
  };
  const mql = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;

  const readChoice = (): ThemeChoice => {
    let stored: string | null;
    try {
      stored = storage.get();
    } catch {
      stored = null;
    }
    return isChoice(stored) ? stored : "system";
  };

  let choice: ThemeChoice = readChoice();

  const getSystem = (): Resolved => (mql?.matches === true ? "dark" : "light");
  const resolved = (): Resolved => (choice === "system" ? getSystem() : choice);

  const apply = (): void => {
    const value = resolved();
    document.documentElement.setAttribute(attribute, value);
    opts.onChange?.(value);
  };

  const set = (next: ThemeChoice): void => {
    choice = next;
    try {
      storage.set(next);
    } catch {
      // Storage denied (private mode / disabled), or a custom adapter threw —
      // apply in memory only.
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
  mql?.addEventListener("change", onSystemChange);

  apply();

  return {
    get: () => choice,
    set,
    resolved,
    cycle,
    getSystem,
    dispose: () => {
      mql?.removeEventListener("change", onSystemChange);
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
  const key = jsonForScript(storageKey);
  const attr = jsonForScript(attribute);
  const system = `window.matchMedia("${DARK_QUERY}").matches?"dark":"light"`;
  return (
    `(function(){try{` +
    `var c=localStorage.getItem(${key});` +
    `if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}` +
    `var r=c==="system"?(${system}):c;` +
    `document.documentElement.setAttribute(${attr},r);` +
    // Fall back to the resolved system preference (matching createTheme's
    // runtime default) rather than a hardcoded "light" that would flash the
    // wrong theme for dark-mode users when storage is unavailable.
    `}catch(e){document.documentElement.setAttribute(${attr},${system});}})();`
  );
}

/** Like {@link themeInitSnippet}, but the preference lives in a **field of a
 *  JSON object** stored under `storageKey` — the anti-FOUC companion to a custom
 *  `storage` adapter that persists the theme inside a JSON blob. The inline
 *  blocking-`<head>` IIFE reads `localStorage[storageKey]`, `JSON.parse`s it,
 *  extracts `field`, and applies the resolved theme attribute before paint:
 *
 *      <script>{themeInitSnippetFromJSON("app.ui-state", "theme")}</script>
 *
 *  A missing / blank / non-object blob, or a `"system"` (or unrecognized) field,
 *  resolves to the OS preference — so a 2-state app that only ever stores
 *  `"light"` / `"dark"` still gets the correct first paint, and a dark-mode user
 *  never flashes light. `storageKey`, `field`, and `attribute` are escaped for
 *  the inline-`<script>` context exactly like {@link themeInitSnippet}. */
export function themeInitSnippetFromJSON(
  storageKey: string,
  field: string,
  attribute = DEFAULT_ATTRIBUTE,
): string {
  const key = jsonForScript(storageKey);
  const fld = jsonForScript(field);
  const attr = jsonForScript(attribute);
  const system = `window.matchMedia("${DARK_QUERY}").matches?"dark":"light"`;
  return (
    `(function(){try{` +
    `var raw=localStorage.getItem(${key});` +
    `var o=raw?JSON.parse(raw):null;` +
    `var c=o&&typeof o==="object"?o[${fld}]:null;` +
    `if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}` +
    `var r=c==="system"?(${system}):c;` +
    `document.documentElement.setAttribute(${attr},r);` +
    // Same system-preference fallback as themeInitSnippet: never flash a
    // hardcoded light theme for dark-mode users when storage / JSON is unusable.
    `}catch(e){document.documentElement.setAttribute(${attr},${system});}})();`
  );
}

/** `JSON.stringify` a value, then neutralize the characters that could break
 *  out of an inline `<script>` context: `<` (so `</script>` can't close the
 *  tag) and the raw line separators U+2028 / U+2029 (invalid in JS strings in
 *  older engines, and stray line breaks in HTML). */
function jsonForScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\x3C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
