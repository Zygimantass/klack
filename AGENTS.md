# Klack repository guidance

## Scope and purpose

Klack is an experimental plugin loader that modifies Slack's Electron desktop
application. Treat installer, signing, preload, and renderer changes as
high-risk even when the code change is small. Preserve Slack's sandbox and make
every installation reversible.

Read [BUILDING_PLUGINS.md](BUILDING_PLUGINS.md) before creating or changing a
plugin.

Read [BUILDING_THEMES.md](BUILDING_THEMES.md) before creating or changing a
theme or the shared selector registry.

## Source layout

- `src/installer.ts` owns ASAR backup, integrity metadata, signing, install,
  reinstall, and uninstall behavior.
- `src/main.ts` patches Electron's main process, discovers plugins, watches
  plugin directories, and sends reloads to injected windows.
- `src/preload.ts` bridges the main and renderer processes while preserving
  Slack's original sandboxed preload.
- `src/renderer.ts` owns plugin registration, lifecycle, resource cleanup, and
  UI helpers.
- `src/sdk.ts` is the public typed plugin API.
- `src/plugins.ts` discovers and compiles plugin source files.
- `src/themes.ts` discovers CSS themes and inlines their local modules.
- `src/theme-selectors.ts` is the typed selector compatibility source of truth.
- `themes/` contains modular built-in theme source; `scripts/build-themes.ts`
  validates selectors and compiles distributable theme CSS.
- `plugins/` contains built-in plugins. User plugins live in
  `~/.klack/plugins/` and are not part of this repository.
- `dist/` and `runtime/preload.bundle.js` are generated artifacts. Change their
  source files rather than editing generated output directly.

## Project invariants

- Keep `sandbox: true` and `contextIsolation: true` intact.
- Never overwrite Slack's only original ASAR or remove the preserved original
  app bundle. Install, reinstall, and uninstall must remain reversible.
- Do not bypass the CLI's running-Slack guard. Slack must be fully quit before
  installation or uninstallation.
- Preserve the original Slack preload byte-for-byte after Klack's generated
  preload prefix.
- Do not weaken URL, path, signing, or application-state validation merely to
  make a test pass.
- Plugins execute as trusted renderer code. Do not add network access,
  credential access, telemetry, or remote code loading without an explicit
  requirement and clear documentation.
- Prefer the smallest change in the existing ownership layer. Do not add a
  wrapper when the source-of-truth implementation can be changed safely.

## Development workflow

Use Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm check
pnpm test
```

- Run `pnpm check` for TypeScript or plugin-source changes.
- Run `pnpm test` when changing installation, compilation, preload, plugin
  evaluation, lifecycle, or shared SDK behavior.
- `pnpm test` runs a build first. Use `pnpm build` when generated artifacts are
  specifically needed outside the test suite.
- Use `pnpm klack status` before any live installation work.
- Live install or uninstall is not routine verification. Only do it when the
  requested outcome requires testing against Slack, and quit Slack first.
- After a live renderer/plugin change, inspect Slack's webapp console log for
  `[Klack]` startup, reload, and failure messages.

## Website design iterations

- Preserve distinct website directions as named versions in the Visual Lab
  instead of replacing the previous direction.
- When iterating on site design, add multiple reviewable versions and keep the
  current default unless the user explicitly chooses a replacement.
- Make version selection persistent so screenshots and feedback can reference
  a stable version name.

## Plugin implementation rules

- Export a typed default definition using `definePlugin` from `klack/sdk`.
- Use a stable PascalCase plugin name containing only letters, digits,
  underscores, and hyphens.
- Make `setup()` safe to run repeatedly. Hot reload tears down the old plugin
  set and starts a new one.
- Prefer `klack.ui`, `klack.dom`, `klack.events`, and `klack.timers`. Resources
  registered through them are plugin-owned and cleaned up automatically.
- Register cleanup for direct DOM changes or third-party APIs with
  `klack.cleanup()`; `setup()` does not return cleanup.
- Prefer stable semantic attributes such as `data-qa` and ARIA labels. Avoid
  generated CSS-module suffixes such as `container__Bo6IZ`.
- Prefer CSS for hiding or restyling Slack UI. Avoid removing Slack-owned DOM
  nodes because React may retain references to them.
- Keep selectors narrow and scope behavior to the intended surface. Do not
  intercept every Slack link or button when only message-body links are meant.
- Use `dom.watch()` for existing and future selector matches. It performs one
  initial query and then inspects only added subtrees. Keep selectors narrow and
  never use `*`; even incremental broad selectors add work to every subtree.
- When broad semantic detection is unavoidable, use an incremental
  `dom.observe()` callback: inspect added or directly changed nodes, use an
  `attributeFilter`, and never query the entire document from every callback.
- Restore every Slack-owned attribute or inline style changed directly by a
  plugin when the plugin is disabled or reloaded.
- Include accessible labels on custom controls and preserve native keyboard and
  modifier-click behavior unless changing it is the explicit feature.

## Review checklist

Before considering a plugin complete:

1. Confirm it compiles and appears in the discovered plugin list.
2. Confirm Slack logs `Started <PluginName>` without a subsequent failure.
3. Verify the behavior against live DOM, not only against copied HTML.
4. Exercise a source edit and confirm hot reload applies it.
5. Disable or reload the plugin and confirm styles, nodes, listeners,
   observers, attributes, and timers are cleaned up.
6. Check that normal scrolling and typing remain smooth with DevTools closed.
7. Remove temporary probes, diagnostics, logs, and generated files.
