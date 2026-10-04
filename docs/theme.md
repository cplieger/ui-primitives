# theme

`@cplieger/ui-primitives/theme`

A stored theme choice of `light`, `dark` or `system`. In `system` it follows the OS preference live through `matchMedia`.

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

- `createTheme(opts)` returns a `ThemeController` with `get()`, `set(choice)`, `resolved()`, `cycle()`, `getSystem()` and `dispose()`.
- `ThemeOptions` = `{ storageKey; storage?; attribute?; onChange? }`. `attribute` defaults to `data-theme` and is set on `<html>` with the resolved value.
- `themeInitSnippet(storageKey, attribute?)` returns a self-contained script as a string. Inline it in a blocking `<head>` script so the right theme paints before stylesheets load, a place where a real import cannot run.
- `themeInitSnippetFromJSON(storageKey, field, attribute?)` does the same when the theme is a field of a JSON value. The inline script reads `localStorage[storageKey]`, parses it, takes `field`, and applies the resolved theme before the first paint.

```html
<script>
  /* server-render this: themeInitSnippetFromJSON("app.ui-state", "theme") */
</script>
```

### Custom `storage` adapter

By default the choice is a plain string in `localStorage[storageKey]`. Pass a `storage` adapter to keep it anywhere else, for example as a `theme` field of a JSON value you already own:

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

`ThemeStorage` is `{ get(): string | null; set(value: string): void }`. Only storage goes through it. Resolving the choice, following the OS in `system` and setting the attribute work the same way. A two-state app with only light and dark never calls `set("system")`, and nothing forces the third state. An adapter that throws, because storage is blocked or the JSON is bad, falls back to keeping the choice in memory.

## Notes

- Both snippets read `window.localStorage` directly. They run before any module loads, so they cannot use a custom `storage` adapter. Use `themeInitSnippet` for a plain key and `themeInitSnippetFromJSON` for a JSON field.
- The snippets fall back to the OS preference, `prefers-color-scheme`, when storage is unavailable, the value is missing or malformed, or the field is absent or `"system"`. That matches `createTheme`'s default at runtime, so a dark-mode user does not see a flash of the light theme.
- The `storageKey`, `field` and `attribute` are escaped for an inline `<script>`, so a value containing `</script>` or other HTML-breaking characters is safe.
