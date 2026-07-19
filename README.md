# Klack

Klack is an experimental plugin loader for Slack's Electron desktop app. It is
inspired by Vencord's bootstrap architecture, but it preserves Slack's
sandboxed preload because current Slack releases close windows that disable
`sandbox` or `contextIsolation`.

> [!WARNING]
> Klack is unofficial, unsupported, and currently intended only for local
> experimentation. Plugins execute as trusted code inside Slack and can read or
> modify anything visible to the renderer. Installing Klack modifies Slack's
> application bundle, invalidates its vendor code signature, and may violate
> Slack or workspace policies.

## Current status

The MVP supports:

- reversible `app.asar` bootstrap installation;
- preservation of Slack's original ASAR and native unpacked modules;
- automatic updates to Electron's embedded ASAR-integrity metadata;
- outer-app ad-hoc signing while preserving Slack's vendor-signed helpers;
- injection without disabling Slack's renderer sandbox;
- typed plugin definitions with automatically scoped UI contributions;
- plugin enablement overrides stored in the renderer's local storage;
- first-class local CSS themes with isolated hot reload;
- a shared, typed Slack selector compatibility registry;
- a built-in manager for plugins and themes;
- resilient buttons, custom DOM mounts, styles, events, timers, and DOM watchers;
- `--klack-vanilla` for starting through the bootstrap without injection.

It has been developed against Slack `4.50.143` on macOS. It does not yet patch
Slack's remote Webpack modules or provide a plugin marketplace.

## Install

Release installs require macOS and Node.js 24 or newer. Downloading Klack and
patching Slack are separate steps so modifying the application remains an
explicit action:

```sh
curl -fsSL https://raw.githubusercontent.com/Zygimantass/klack/main/install.sh | sh
~/.local/bin/klack install
```

The installer selects the Apple silicon or Intel release, verifies its SHA-256
checksum, and stores it under `~/Library/Application Support/Klack`. It does
not require pnpm or build anything locally. To download Klack and patch Slack
in one command, pass `--install`:

```sh
curl -fsSL https://raw.githubusercontent.com/Zygimantass/klack/main/install.sh | sh -s -- --install
```

Re-run the download command to update Klack, then run `klack install` to apply
the new version. Previously installed releases are retained because a patched
Slack installation contains an absolute path to the Klack version that created
it.

## Build from source

Requires Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm check
pnpm test
```

## Website

The static site for `klack.sh` lives in `site/`. It has no build step or runtime
dependencies. Run `pnpm site:dev` and open `http://localhost:4173` to preview it.

For Vercel, import this repository with the repository root as the project root.
The checked-in `vercel.json` skips dependency installation and the CLI build,
then serves `site/` directly. Add `klack.sh` under the Vercel project's Domains
settings after the first deployment.

## Manage Slack

Quit Slack completely before install or uninstall. Do not install this into a
managed work computer without authorization.

For a release installation:

```sh
klack status
klack install
klack uninstall
```

When running from a source checkout, use the equivalent pnpm commands:

```sh
pnpm klack status
pnpm klack install
pnpm klack uninstall
```

Use `--app /path/to/Slack.app` to operate on a disposable copy while testing.
After a Slack update, run `klack install` again because Slack replaces its
application resources.

Slack browser sign-in returns through the `slack://` URL scheme. macOS chooses
its handler by bundle identifier, not by app path, so it cannot reliably choose
between multiple Slack copies with the same identifier. Quit every other Slack
copy when testing, or install Klack into `/Applications/Slack.app` so browser
callbacks return to the Klack-enabled app.

On macOS, modifying any sealed resource invalidates Slack's vendor signature,
so Klack updates Electron's ASAR integrity metadata and ad-hoc signs the outer
app by default. It leaves Slack's vendor-signed helpers and frameworks
untouched. Use `--no-resign` to skip this, but the modified app will not launch
until it is signed.

Ad-hoc signing can alter Keychain, notification, update, and device-permission
behavior. When macOS App Management prevents direct changes to the canonical
Slack app, Klack installs through a clean staging copy and retains the complete
original bundle in `/Applications/.Slack.app.klack-original`. Uninstall then
restores that vendor-signed bundle. Directly writable copies only preserve the
original ASAR and remain ad-hoc signed after uninstall.

## Plugin API

Klack follows Pi's extension model: a plugin default-exports one typed
`definePlugin({ name, setup })` definition. Everything registered through the
provided API belongs to that plugin. Disabling the plugin automatically removes
its UI, DOM watchers, listeners, and timers.

See [BUILDING_PLUGINS.md](BUILDING_PLUGINS.md) for plugin patterns, lifecycle
rules, performance constraints, and a verification checklist. Plugins can use
`klack.selectors.get()` and `klack.selectors.probe()` instead of duplicating
shared Slack selectors.

At startup, Klack loads its built-in plugins and then scans
`~/.klack/plugins/*.{ts,tsx,js,jsx}`. TypeScript and JavaScript modules are
bundled in memory, so generated files are not written beside plugin sources. A
user plugin replaces a built-in plugin with the same filename. Set
`KLACK_PLUGIN_DIR` to use a different user plugin directory.

Create `~/.klack/plugins/example.ts`:

```ts
import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "Example",
  description: "Example Klack plugin",
  setup(klack) {
    klack.ui.addStyle(`
      [data-klack-button="Example:hello"] {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 10000;
      }
    `);

    klack.ui.addButton({
      id: "hello",
      target: "body",
      label: "Hello from Klack",
      title: "A Klack plugin button",
      onClick(_event, { button }) {
        button.textContent = "Clicked!";
      },
    });

    klack.dom.watch("[data-qa='message_container']", (message) => {
      klack.logger.debug("Message rendered", message);
    });
  },
});
```

Klack resolves the `klack/sdk` import to the SDK bundled with the active Klack
installation. Changes, additions, and deletions in the plugin directory are
compiled and applied to every Slack window automatically. Plugin-owned UI and
other resources are cleaned up before the new plugin set starts. If a plugin
does not compile, Klack logs the error and keeps the last working set running.
No manual build or Slack restart is required.

For a zero-build JavaScript plugin, export the same definition object directly:

```js
module.exports = {
  name: "Example",
  setup(klack) {
    klack.ui.hide('[data-qa="some-target"]');
  },
};
```

### UI methods

- `ui.addButton(options)` mounts a button at every matching target. `target`
  can be a CSS selector, an `Element`, or a function returning elements.
- `ui.mount(target, render, { position })` mounts arbitrary DOM. `render`
  returns an `Element`; its context provides mount-scoped `on()` and `cleanup()`.
- `ui.addStyle(css, { id })` injects plugin-owned CSS.
- `ui.hide(selector | selectors, { id })` hides matching Slack UI with
  plugin-owned CSS.
- `dom.watch(selector, callback, { attributes })` initializes matching elements
  incrementally and calls optional per-element cleanup when they disappear.
- `dom.observe(target, callback, options)` creates a plugin-owned mutation
  observer.
- `events.on(target, type, listener, options)` adds a plugin-owned listener.
- `timers.timeout()`, `timers.interval()`, and `timers.animationFrame()` return
  cancellation functions and are cancelled automatically when the plugin stops.
- `cleanup(callback)` owns any cleanup not covered by another SDK method.

Buttons and custom mounts support `append` (default), `prepend`, `before`, and
`after`. Klack watches Slack's React-managed DOM and recreates a contribution if
Slack replaces either its target or the contribution itself.

Klack's built-in **PluginManager** adds a **Klack** button to Slack's top bar.
It provides searchable, persistent enable/disable controls for built-in and
user plugins and themes. The manager itself stays enabled so the controls
remain accessible.

### Vim navigation

The opt-in **VimNavigation** plugin adds a visual keyboard cursor across the
sidebar, message transcript, Threads view, and an open thread. Enable it from
the Klack plugin manager, then use:

| Key | Action |
| --- | --- |
| `[count]j` / `[count]k` | Select the next or previous conversation or message; for example, `10j` moves ten rows. |
| `gg` | Select the first row in the sidebar or the first message in an open thread. |
| `G` | Select the last row in the active navigation surface. |
| `h` | Move from messages to the sidebar, or close an open thread. |
| `l` / `Enter` | Open the selected conversation or message thread. |
| `{` / `}` | Move backward or forward by one viewport. |
| `Ctrl+U` / `Ctrl+D` | Move backward or forward by half a viewport. |
| `/` | Open Slack's global search from any navigation surface and focus it immediately. |
| `i` | Focus the composer for the active conversation or thread. |
| `Escape` | Leave plugin-entered insert mode, close search and restore the Vim cursor, close an open thread, or clear the cursor. |

Counts also multiply viewport motions, so `2}` moves forward two viewports.
After using `i`, the first `Escape` restores the previous Vim cursor; press it
again to close the thread or clear the cursor.

Press `/` from the sidebar, message transcript, Threads view, or an open thread
to open global Slack search with its input focused immediately. Press `Escape`
to close search and restore the Vim cursor to its previous surface and row.
Search uses native typing immediately, so `i` is inserted into the query there
rather than acting as the insert-mode command. To search within one channel,
use Slack's `in:channel-name search terms` syntax in that field.

VimNavigation is modal: it remains in normal mode even when Slack leaves the
message composer focused. Normal-mode keys move the Vim cursor without changing
the draft, and other text-editing keys are suppressed until `i` explicitly
enters insert mode. Other inputs, links, buttons, dialogs, menus, and suggestion
lists retain their native behavior. Other modified keys are left alone;
`Ctrl+U` and `Ctrl+D` are captured only on a navigation surface.

For channel navigation, press `h` to move into the sidebar, use `j`/`k` to
place the highlighted Vim cursor on a channel, then press `l` or `Enter` to
open it. `gg` moves to the first sidebar row; it also moves to the first
message in an open thread. Main-channel history is excluded because Slack
loads older messages without a finite top. To open a thread, use `j`/`k` in
the message transcript to highlight
its parent message, then press `l` or `Enter`. Once the thread opens, use
`j`/`k` to navigate its messages and `i` to focus the thread reply composer.
Press `Escape` to return to normal mode, then `h` to close the thread and
restore the parent-message cursor.

## Themes

Klack discovers `~/.klack/themes/**/*.theme.css` at startup. Themes have their
own enablement and hot-reload lifecycle: saving CSS updates its style element
without restarting plugins or their observers. Theme entries may import local
CSS partials from the same directory; remote and escaping imports are rejected.

The built-in **Minimal IRC** theme is split into surface-owned SCSS modules and
compiled from Klack's typed selector registry. The same registry generates a
runtime probe manifest and powers the plugin SDK's selector helper.

See [BUILDING_THEMES.md](BUILDING_THEMES.md) for metadata, modular CSS, selector
compatibility, companion plugins, and the live verification checklist.

From Slack DevTools:

```js
Klack.list()
Klack.disable("Example")
Klack.enable("Example")
```

Klack adds **Toggle DevTools** to Slack's **View** menu (or a **Klack** menu if
Slack has no View menu). Its shortcut is `Cmd+Option+I` on macOS and
`Ctrl+Alt+I` on Windows and Linux. Use the element-picker button to inspect
Slack's DOM and find stable selectors for plugin mounts.

Plugins are not sandboxed from Slack or from one another. Do not install code
you have not reviewed.

## How injection works

1. The installer renames Slack's `app.asar` to `_app.asar`, installs a tiny
   bootstrap archive, updates `ElectronAsarIntegrity`, and ad-hoc signs the
   outer app bundle.
2. The bootstrap starts Klack's main-process patcher.
3. Klack redirects Electron to Slack's original package and wraps
   `BrowserWindow`.
4. Windows using Slack's primary `preload.bundle.js` receive a generated
   preload containing Klack followed by Slack's exact original preload.
5. Klack's preload injects the renderer, applies enabled local themes, and then
   starts local plugins before Slack finishes loading.

Slack's `sandbox: true` and `contextIsolation: true` settings remain unchanged.
