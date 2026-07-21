# Klack

Klack is an experimental plugin loader for Slack's Electron desktop app. It is
inspired by Vencord's bootstrap architecture, but it preserves Slack's
sandboxed preload because current Slack releases close windows that disable
`sandbox` or `contextIsolation`.

> [!WARNING]
> Klack is not affiliated with, endorsed by, or associated with Slack or
> Salesforce. It is unofficial, unsupported, and currently intended only for
> local experimentation. Plugins execute as trusted code inside Slack and can
> read or modify anything visible to the renderer. Installing Klack modifies
> Slack's application bundle, invalidates its vendor code signature, and may
> violate Slack or workspace policies.

## Install

Release installs require macOS and Node.js 24 or newer. Downloading Klack and
patching Slack are separate steps so modifying the application remains an
explicit action:

```sh
curl -fsSL https://klack.sh/install | sh
~/.local/bin/klack install
```

The installer selects the Apple silicon or Intel release, verifies its SHA-256
checksum, and stores it under `~/Library/Application Support/Klack`. It does
not require pnpm or build anything locally. To download Klack and patch Slack
in one command, pass `--install`:

```sh
curl -fsSL https://klack.sh/install | sh -s -- --install
```

After the initial installation, quit Slack and run `klack update` to download,
verify, and apply the latest Klack release. Previously installed releases are
retained because a patched Slack installation contains an absolute path to the
Klack version that created it.

## Build from source

Requires Node.js 24 or newer and pnpm.

```sh
pnpm install
pnpm check
pnpm test
```

## Manage Slack

Quit Slack completely before install, update, or uninstall. Do not install
this into a managed work computer without authorization.

For a release installation:

```sh
klack status
klack install
klack update
klack uninstall
```

To test the latest successful CI build for a pull request, authenticate the
GitHub CLI and pass the quoted PR number:

```sh
gh auth login
klack install '#123'
```

`klack install --pr 123` is equivalent. PR builds are unreviewed code with the
same access as Klack and its plugins; only install pull requests you trust.

When running from a source checkout, use the equivalent pnpm commands:

```sh
pnpm klack status
pnpm klack install
pnpm klack update
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
| `[count]j` / `[count]k` | Select the next or previous conversation or message; in content mode, cycle through links and images; in the image viewer, show the next or previous image. For example, `10j` moves ten rows. |
| `gg` | Select the first row in the sidebar or the first message in an open thread. |
| `G` | Select the last row in the active navigation surface. |
| `zz` | Center the selected conversation or message in its scrollable view. |
| `H` / `L` | Go back or forward in Slack's navigation history. |
| `h` | Leave content mode, close the image viewer, move from messages to the sidebar, or close an open thread. |
| `l` | Open the selected conversation or message thread from normal mode. |
| `Enter` | Enter content mode when the selected message contains links or images, otherwise open its thread; in content mode, open the highlighted target. |
| `{` / `}` | Move backward or forward by one viewport. |
| `Ctrl+U` / `Ctrl+D` | Move backward or forward by half a viewport. |
| `/` | Search conversation names from the sidebar, or open Slack's global search from a message surface. |
| `:` | Open Slack's emoji-reaction picker for the selected message. |
| `i` | Focus the composer for the active conversation or the selected thread. |
| `c` | Edit the selected message when Slack permits editing it. |
| `yy` | Copy the selected message permalink, including the reply context for a thread reply. |
| `v` | Start visual selection at the current message's first character; press it again after moving to re-anchor the selection there. |
| `[count]h` / `[count]l` | Move the visual selection endpoint by characters. |
| `[count]w` / `[count]b` / `[count]e` | Move the visual selection endpoint by words. |
| `[count]W` / `[count]E` | Move the visual selection endpoint by whitespace-delimited WORDs. |
| `0` / `$` / `o` | In visual mode, move to line start/end or swap the anchor and endpoint. |
| `y` | Copy the visual-mode message selection as plain text and return to normal mode. |
| `Escape` | Leave insert, content, or visual mode; close the image viewer; close search and restore the Vim cursor; close an open thread; leave sidebar navigation for the visible transcript; or clear the cursor. |

Counts also multiply viewport motions, so `2}` moves forward two viewports.
After using `i`, the first `Escape` restores the previous Vim cursor; press it
again to close the thread or clear the cursor.

After opening a thread, normal-mode `j`/`k` takes over its parent and replies
even if Slack autofocuses the reply composer or a thread control. With no
message row selected yet, `j` starts at the first visible row and `k` starts at
the last visible reply; a focused control inside a row seeds navigation there.

On a selected message, press `Enter` to highlight its first content link or
uploaded image thumbnail. Use `j`/`k` (with optional counts) to cycle through
mixed targets in document order, then `Enter` to open the highlighted target.
An uploaded image opens in Slack's viewer; use counted `j`/`k` there for
next/previous and `h` or `Escape` to return to the originating thumbnail. Press
`h` or `Escape` again to return to the message. `l` never activates a
highlighted target. Messages without content targets retain the normal `Enter`
behavior of opening their thread, and `l` always opens a thread from normal
mode. Native arrow keys keep their normal image-viewer behavior.

Press `:` on a selected message to open Slack's emoji-reaction picker. The
picker's search field and controls remain native, so type to search, use Slack's
usual arrow/Enter controls to choose, or press `Escape` to cancel and resume
from the same message.

Press `c` on one of your editable messages to enter Slack's inline message
editor. Type normally, then use Slack's native save command or controls;
`Escape` cancels the edit and restores the Vim cursor. If Slack does not offer
its **Edit message** action for that row, VimNavigation leaves the message
unchanged and restores the cursor.

Press `yy` on a selected message to copy its permalink without moving the Vim
cursor. On a reply inside an open thread, the copied URL retains Slack's thread
context and opens that specific reply. Visual-mode `y` continues to copy only
the selected message text.

Press `v` on a selected message to start at its first text character without
including its author, timestamp, reactions, or attachments. Move with `h`/`l`,
`w`/`b`/`e`, whitespace-delimited `W`/`E`, `0`/`$`, and optional counts. To
begin somewhere in the middle, move there and press `v` again: that character
becomes the new anchor. Use `o` to swap the two ends, `y` to copy the selected
text and return to normal mode, or `Escape` to cancel. Visual mode is scoped to
one message; it does not extend across messages.

Press `/` from the sidebar to reveal and focus Slack's conversation-name filter.
Type a query, press `Enter` to enter its results, use `j`/`k` (with optional
counts) to move, and press `Enter` again to open the selected conversation.
`l` is consumed while navigating filtered results so it cannot leak into the
current message. Press `/` to edit the query again, or `Escape` to cancel the
filter and restore the previous sidebar cursor. After a searched conversation
has opened, `Escape` leaves any remaining sidebar navigation state for the
visible transcript, so the next `j`/`k` browses its messages without finding the
conversation again and pressing `l`.

Press `/` from the message transcript, Threads view, or an open thread to open
global Slack search with its input focused immediately. Press `Escape` to close
search and restore the Vim cursor to its previous surface and row. Search uses
native typing immediately, so `i` is inserted into the query rather than acting
as the insert-mode command. Submit with `Enter`; when Slack shows the results,
the first match receives the Vim cursor. Use counted `j`/`k`, `gg`/`G`, viewport
motions, or `zz` to browse matches, then press `Enter` to open the selected
result's thread. Thread navigation and `i` work normally; closing the thread
returns to the same search result. `l` is consumed in result mode so it cannot
leak into the channel underneath. Press `Escape` or `H` from the result list to
leave search and restore the original cursor. To constrain global search to one
channel, use Slack's `in:channel-name search terms` syntax in that field.

VimNavigation is modal: it remains in normal mode even when Slack leaves the
message composer focused. Normal-mode keys move the Vim cursor without changing
the draft, and other text-editing keys are suppressed until `i` explicitly
enters insert mode. Other inputs, links, buttons, dialogs, menus, and suggestion
lists retain their native behavior. Other modified keys are left alone;
`Ctrl+U` and `Ctrl+D` are captured only on a navigation surface.

For channel navigation, press `h` to move into the sidebar, use `j`/`k` to
place the highlighted Vim cursor on a channel, then press `l` or `Enter` to
open it. In a non-member channel preview, Vim navigation still owns its normal
keys while Slack's **Join channel** action keeps native `Enter` behavior. `gg`
moves to the first sidebar row; it also moves to the first
message in an open thread. Main-channel history is excluded because Slack
loads older messages without a finite top. To open a thread, use `j`/`k` in
the message transcript to highlight its parent message, then press `l`.
`Enter` also opens the thread when that message has no eligible content target;
otherwise it enters content mode. Once the thread opens, use
`j`/`k` to navigate its messages and `i` to focus the thread reply composer.
Press `Escape` to return to normal mode, then `h` to close the thread and
restore the parent-message cursor.

In Slack's Threads view, `k` expands a crossed **Show more replies** boundary
before continuing to the newly revealed replies. `i` resolves the reply
composer inside the selected thread card, so it does not jump to the first
thread's composer at the top.

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
