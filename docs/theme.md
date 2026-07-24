# theme

`@cplieger/ui-primitives/theme`

Persisted tri-state theme (`light` / `dark` / `system`). While in `system` it
follows the OS preference live via `matchMedia`.

## Usage

```ts
import { createTheme, themeInitSnippet } from "@cplieger/ui-primitives/theme";

const theme = createTheme({ storageKey: "app-theme" });
theme.set("dark");
theme.cycle(); // light -> dark -> system -> light
theme.resolved(); // "light" | "dark" (system resolved to a concrete value)
theme.dispose();
```

```html
<script>
  /* server-render this: themeInitSnippet("app-theme") */
</script>
```

## API

- `createTheme(opts)` → `ThemeController` with `get()`, `set(choice)`, `resolved()`, `cycle()`, `getSystem()`, `dispose()`.
- `ThemeOptions` = `{ storageKey; storage?; attribute?; onChange? }`. `attribute` defaults to `data-theme` and is set on `<html>` with the resolved value.
- `themeInitSnippet(storageKey, attribute?)` → a self-contained IIFE **string** to inline in a blocking `<head>` script so the correct theme paints before stylesheets load (a real import can't run there).
- `themeInitSnippetFromJSON(storageKey, field, attribute?)` → the anti-FOUC companion for the JSON-blob case: the inline IIFE reads `localStorage[storageKey]`, `JSON.parse`s it, extracts `field`, and applies the resolved theme before paint.

```html
<script>
  /* server-render this: themeInitSnippetFromJSON("app.ui-state", "theme") */
</script>
```

### Custom `storage` adapter

By default the preference is a bare `localStorage[storageKey]` string. Pass a
`storage` adapter to persist it anywhere else, e.g. a `theme` field of a JSON
blob you already own:

```ts
const KEY = "app.ui-state";
const theme = createTheme({
  storageKey: KEY, // unused by a custom adapter, but still required
  storage: {
    get: () => JSON.parse(localStorage.getItem(KEY) ?? "{}").theme ?? null,
    set: (value) => {
      const blob = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      blob.theme = value; // read-modify-write; siblings untouched
      localStorage.setItem(KEY, JSON.stringify(blob));
    },
  },
});
```

`ThemeStorage` is `{ get(): string | null; set(value: string): void }`. Only
persistence goes through it; tri-state resolution, following the OS while
`system`, and the applied attribute are unchanged. A **2-state** app
(light/dark, no "system") simply never calls `set("system")`; nothing forces
tri-state. A throwing adapter (blocked storage, bad JSON) degrades to
in-memory.

## Notes

- Both snippets read `window.localStorage` directly; they run before any module loads, so they **cannot** use a custom `storage` adapter (use the plain `themeInitSnippet` for a bare key, `themeInitSnippetFromJSON` for a JSON field).
- When storage is unavailable, the blob is missing/malformed, or the field is absent / `"system"`, the snippets fall back to the OS preference (`prefers-color-scheme`), matching `createTheme`'s runtime default, so dark-mode users don't get a flash of light.
- The `storageKey`, `field`, and `attribute` are escaped for the inline-`<script>` context, so a value containing `</script>` (or other HTML-breaking characters) is safe.
