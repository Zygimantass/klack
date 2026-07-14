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
- typed extension factories with automatically scoped UI contributions;
- plugin enablement overrides stored in the renderer's local storage;
- resilient buttons, custom DOM mounts, styles, and DOM observers;
- `--klack-vanilla` for starting through the bootstrap without injection.

It has been developed against Slack `4.50.143` on macOS. It does not yet patch
Slack's remote Webpack modules or add a settings UI.

## Build

Requires Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm check
pnpm test
```

## Inspect status

```sh
pnpm klack status
```

## Install and restore

Quit Slack completely first. Do not install this into a managed work computer
without authorization.

```sh
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

Klack follows Pi's extension-factory model: a plugin exports one setup function
or a typed definition. Everything registered through the provided API belongs
to that plugin. Disabling the plugin automatically removes its buttons, mounts,
styles, observers, and button listeners.

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

    klack.ui.observe("[data-qa='message_container']", (message) => {
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

For a zero-build JavaScript plugin, export the factory directly; the filename
becomes its plugin name:

```js
module.exports = function (klack) {
  klack.ui.addButton({
    id: "hello",
    target: "body",
    label: "Hello",
    onClick() {
      console.log("Hello from Klack");
    },
  });
};
```

### UI methods

- `ui.addButton(options)` mounts a button at every matching target. `target`
  can be a CSS selector, an `Element`, or a function returning elements.
- `ui.mount(target, render, { position })` mounts arbitrary DOM. `render`
  returns an `Element` or `{ element, cleanup }`.
- `ui.addStyle(css, { id })` injects plugin-owned CSS.
- `ui.observe(selector, callback)` observes matching Slack elements and calls
  an optional callback cleanup when an element disappears.

Buttons and custom mounts support `append` (default), `prepend`, `before`, and
`after`. Klack watches Slack's React-managed DOM and recreates a contribution if
Slack replaces either its target or the contribution itself.

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
you have not reviewed. The old `globalThis.Klack.register({ start(api) {} })`,
`api.addStyle()`, and `api.observe()` forms remain supported for compatibility.

## How injection works

1. The installer renames Slack's `app.asar` to `_app.asar`, installs a tiny
   bootstrap archive, updates `ElectronAsarIntegrity`, and ad-hoc signs the
   outer app bundle.
2. The bootstrap starts Klack's main-process patcher.
3. Klack redirects Electron to Slack's original package and wraps
   `BrowserWindow`.
4. Windows using Slack's primary `preload.bundle.js` receive a generated
   preload containing Klack followed by Slack's exact original preload.
5. Klack's preload injects the renderer and local plugins before Slack finishes
   loading.

Slack's `sandbox: true` and `contextIsolation: true` settings remain unchanged.
