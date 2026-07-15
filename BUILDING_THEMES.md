# Building Klack themes

Klack themes are local CSS add-ons with their own discovery, enablement, and
hot-reload lifecycle. They are intentionally separate from plugins: changing a
theme replaces its style element without restarting plugin code or DOM
observers.

## Create a theme

User themes live beneath:

```text
~/.klack/themes/**/*.theme.css
```

Set `KLACK_THEME_DIR` before starting Slack to use another directory. Add a
metadata block at the beginning of each theme entry:

```css
/**
 * @id MyTheme
 * @name My Theme
 * @description A concise description shown in Klack's manager
 * @version 1.0.0
 */

:root {
  --my-theme-accent: #7aa2b8;
}

[data-qa="message_container"] {
  border-left: 2px solid var(--my-theme-accent);
}
```

Theme IDs must match `[A-Za-z0-9_-]+` and remain stable because enablement is
stored by ID. `@name`, `@description`, and `@version` are display metadata. If
`@id` or `@name` is absent, Klack uses the entry filename.

Themes start disabled. Open **Klack → Themes** in Slack's top bar to enable one.
Saving an enabled theme updates every injected Slack window automatically.

## Split themes into modules

An entry may import local CSS files from its own directory:

```css
/**
 * @id MyTheme
 * @name My Theme
 */

@import "./tokens.css";
@import "./sidebar.css";
@import "./messages.css";
```

Klack inlines those files in import order. Imports must be quoted, relative,
remain inside the entry theme's directory, and end in `.css`. Remote imports
are rejected: themes cannot silently introduce network-loaded code or styles.
Circular imports are rejected and the previous working theme set remains
active until the source is fixed.

Organize partials by UI ownership rather than by CSS property. A substantial
theme will usually have modules resembling:

```text
tokens.css
foundations.css
shell.css
top-nav.css
sidebar.css
headers.css
messages.css
attachments.css
composer.css
threads.css
search.css
overlays.css
settings.css
```

## Use the shared selector registry

Slack does not publish a stable styling API. Klack therefore maintains one
typed compatibility registry in `src/theme-selectors.ts`. Each semantic ID has
ordered candidates and metadata describing ownership, stability, cardinality,
and surface. Prefer candidates in this order:

1. Klack-owned `data-*` hooks;
2. Slack `data-qa` and ARIA identities;
3. long-lived semantic Slack classes;
4. structural selectors;
5. generated-class fallbacks.

`pnpm build` validates every candidate and generates:

- `dist/_theme-selectors.scss`, with a `selector("semantic.id")` function;
- `dist/theme-selectors.json`, for diagnostics and external tooling; and
- compiled built-in CSS under `dist/themes/`.

Built-in SCSS modules use the generated function:

```scss
@use "theme-selectors" as *;

#{selector("slack.message.row")} {
  color: var(--theme-text);
}

#{selector("slack.message.row")}:hover {
  background: var(--theme-hover);
}
```

Keep relationships and states local to the module. The registry should identify
an element, not encode every way it is used:

```scss
#{selector("slack.search.view")} #{selector("slack.search.result")}:hover {
  background: var(--theme-hover);
}
```

Do not add broad descendants, text matching, behavioral link predicates, or a
one-off `:has()` chain to the registry. Add a semantic ID only when it names a
real UI role and centralizing it improves compatibility for more than one rule
or consumer.

Plugins use the same source of truth:

```ts
const message = klack.selectors.get("slack.message.row");
const probe = klack.selectors.probe("slack.message.row");
```

`probe()` reports the first matching candidate, its stability tier, and match
count. A weaker candidate succeeding after the preferred candidate stops
matching is a signal that Slack changed its DOM.

## Keep behavior in plugins

CSS themes should not own event listeners, mutation observers, navigation, or
DOM creation. Put those behaviors in a small companion plugin and expose only
stable Klack-owned attributes for theme styling. The built-in Minimal IRC theme,
for example, uses a companion plugin for its IRC-style message prefix. That
plugin remains idle unless the theme is enabled.

## Verify a theme

Before considering a theme complete:

1. Run `pnpm check` and `pnpm test` for registry or built-in theme changes.
2. Confirm the theme appears under **Klack → Themes**.
3. Enable it and inspect all changed surfaces in live Slack.
4. Save a partial and verify the style updates without plugin restart logs.
5. Disable the theme and confirm Slack-owned styling returns.
6. Exercise channels, threads, search, unreads, profiles, dialogs, menus,
   attachments, media, and the composer.
7. Check typography, spacing, hover/focus states, narrow panes, and empty/error
   states.
8. Inspect selector probes for required surfaces and investigate fallback use.

Themes and plugins are unofficial modifications to Slack. Keep them local,
reviewable, and free of remote code or telemetry.
