# Building Klack plugins

Klack plugins are trusted TypeScript or JavaScript modules that run inside
Slack's renderer. They can modify anything visible in Slack, so keep them
small, reviewable, reversible, and inexpensive while idle.

## Create a plugin

User plugins live in:

```text
~/.klack/plugins/*.{ts,tsx,js,jsx}
```

Klack creates this directory automatically. Set `KLACK_PLUGIN_DIR` before
starting Slack to use another directory. Built-in plugins live in this
repository's `plugins/` directory. A user plugin overrides a built-in plugin
with the same filename.

Start with a typed default export:

```ts
import { definePlugin } from "klack/sdk";

export default definePlugin({
  name: "ExamplePlugin",
  description: "Explains exactly what the plugin changes.",
  setup(klack) {
    klack.ui.hide(
      '[data-qa="stable-slack-target"]',
      { id: "example-plugin" },
    );
  },
});
```

Plugin names must match `[A-Za-z0-9_-]+`. Use a stable PascalCase name because
enablement overrides and ownership markers are keyed by it.

Klack bundles source files in memory. Do not generate a neighboring `.js` file
for a TypeScript plugin.

## Hot reload and lifecycle

Klack watches built-in and user plugin directories. A source addition, change,
rename, or deletion triggers a debounced rebuild and reload in every injected
Slack window.

On a successful reload, Klack:

1. stops every running plugin;
2. cleans plugin-owned resources;
3. clears the old definitions;
4. evaluates the new compiled modules; and
5. starts enabled plugins again.

If compilation fails, Klack logs the error and keeps the last working plugin
set running. Fixing and saving the source triggers another attempt.

Treat `setup()` as repeatable. Do not assume module or DOM state survives a
reload. Use `defaultEnabled: false` when a plugin should be opt-in.

## Prefer plugin-owned resources

The SDK owns everything registered through `klack.ui`, `klack.dom`,
`klack.events`, and `klack.timers`. It removes those resources in reverse
registration order when the plugin stops. Use `klack.cleanup()` to register
cleanup for direct changes or third-party APIs.

### Styles

Use `ui.addStyle()` for CSS:

```ts
klack.ui.addStyle(
  `
    [data-qa="target"] {
      opacity: 0.6;
    }
  `,
  { id: "dim-target" },
);
```

For a plugin that only removes UI, use `ui.hide()` instead of writing the CSS
rule yourself:

```ts
klack.ui.hide([
  '[data-qa="first-target"]',
  '[data-qa="second-target"]',
]);
```

Prefer CSS over deleting Slack-owned elements. Hiding an element avoids
breaking React's references and automatically applies when Slack recreates the
element.

### Buttons

Use `ui.addButton()` for a standard button contribution:

```ts
klack.ui.addButton({
  id: "copy-link",
  target: '[data-qa="message_actions"]',
  label: "Copy link",
  ariaLabel: "Copy message link",
  title: "Copy message link",
  onClick(_event, { button, target }) {
    console.debug("Clicked", button, target);
  },
});
```

Provide `ariaLabel` when the visible label alone does not describe the action.
Targets may be selectors, elements, or functions returning elements. Keep
target functions cheap because Slack changes its DOM frequently.

### Arbitrary mounts

Use `ui.mount()` instead of manually appending persistent custom UI:

```ts
klack.ui.mount(
  '[data-qa="target"]',
  ({ on }) => {
    const badge = document.createElement("span");
    badge.textContent = "Klack";
    on(badge, "click", () => console.debug("Clicked"));
    return badge;
  },
  { position: "after" },
);
```

The mount context's `on()` and `cleanup()` methods are scoped to that one mount.
They run when Slack replaces the target as well as when the plugin stops.

### Targeted DOM watching

Use `dom.watch()` to initialize existing and future matching elements:

```ts
klack.dom.watch('[data-qa="message_attachment_slack_msg_text"]', (preview) => {
  preview.setAttribute("data-example-processed", "");
  return () => preview.removeAttribute("data-example-processed");
});
```

The callback may return cleanup for that element. Cleanup runs when the element
disappears or the plugin stops. Klack queries the document once, then inspects
only added subtrees instead of rescanning the whole Slack DOM after every
mutation.

Keep selectors as narrow as practical. A broad selector such as `"button"` is
now incremental, but it still initializes every existing button and checks every
subtree Slack adds. Never use `"*"`.

When an existing element can begin matching only after Slack changes an
attribute, opt into those attribute updates explicitly:

```ts
klack.dom.watch(".is-active", initialize, { attributes: ["class"] });
```

`ui.mount()` accepts the equivalent `observeAttributes` option for selector
targets.

## Observe mutations only for broad semantics

Sometimes the desired element has no unique selector and must be recognized by
text or a combination of attributes. In that case, inspect only newly added or
directly changed nodes:

```ts
const selector = 'button, [role="button"]';
const changed = new Set<Element>();

function inspectAddedNode(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(selector)) changed.add(node);
  node.querySelectorAll(selector).forEach((element) => changed.add(element));
}

klack.dom.observe(document.documentElement, (records) => {
  for (const record of records) {
    if (record.type === "attributes" && record.target instanceof Element) {
      changed.add(record.target);
    }
    record.addedNodes.forEach(inspectAddedNode);
  }

  for (const element of changed) {
    // Apply or reconcile the narrowly defined behavior.
  }
  changed.clear();
}, {
  attributeFilter: ["aria-label", "data-qa", "title"],
  attributes: true,
  childList: true,
  subtree: true,
});
```

Important performance rules:

- Query the full document once during setup, if needed—not after every
  mutation.
- In mutation callbacks, inspect `addedNodes`, the changed target, or the
  nearest affected container.
- Do not run `document.querySelectorAll()` for every mutation.
- Use `attributeFilter`; do not observe every attribute.
- Avoid `characterData: true` unless text-node updates cannot be detected from
  child-list changes.
- Batch duplicate work with a `Set` or a queued microtask.
- Undo direct changes with `klack.cleanup()`; the SDK disconnects the observer.

## Choose resilient Slack selectors

Prefer selectors in this order:

1. stable `data-qa` or other semantic data attributes;
2. ARIA roles and labels;
3. long-lived semantic Slack classes such as `c-message_attachment`;
4. structural selectors scoped beneath a stable semantic ancestor.

Avoid CSS-module names with generated suffixes:

```css
/* Fragile */
.container__Bo6IZ

/* Better */
[data-qa="ai-apps-menu-container"]
```

Before copying a Slack selector into a plugin, check Klack's shared semantic
registry. It keeps preferred selectors and compatibility fallbacks in one
place:

```ts
const message = klack.selectors.get("slack.message.row");
klack.dom.watch(message, initializeMessage);
```

During Slack updates, use `probe()` to see which candidate currently wins:

```ts
klack.logger.table([
  klack.selectors.probe("slack.message.row"),
  klack.selectors.probe("slack.composer.input"),
]);
```

Keep behavior predicates local even when their element identity is shared. A
plugin should still perform its own URL validation, text matching, or
feature-specific `:has()` composition rather than adding those predicates to
the registry.

Keep selectors as narrow as the feature. For example, a plugin that changes
linked Slack messages should scope links beneath `[data-qa="message-text"]`
and exclude timestamps and attachment-footer links. Broad click interception
can silently change unrelated navigation.

Use Slack's theme variables where possible and include sensible fallbacks:

```css
color: var(--sk_primary_foreground, #f8f8f8);
background: var(--sk_primary_background, #1a1d21);
```

## Clean up direct changes

Save prior values and register cleanup alongside the direct change. Use the SDK
for events so listener removal is automatic:

```ts
setup(klack) {
  const target = document.querySelector("[data-example]");
  const previousTitle = target?.getAttribute("title") ?? null;

  target?.setAttribute("title", "Temporary title");
  const onClick = () => console.log("clicked");
  klack.events.on(document, "click", onClick, true);

  klack.cleanup(() => {
    if (!target) return;
    if (previousTitle === null) target.removeAttribute("title");
    else target.setAttribute("title", previousTitle);
  });
}
```

The SDK automatically cleans up:

- document/window/element listeners registered with `events.on()`;
- mutation observers registered with `dom.observe()` or `dom.watch()`;
- intervals, timeouts, and animation frames registered with `timers`;
- styles, hidden selectors, buttons, and mounts registered with `ui`.

Use `klack.cleanup()` for:

- third-party subscriptions and APIs;
- `ResizeObserver` and `IntersectionObserver` instances;
- direct attributes, classes, and inline styles;
- manually appended DOM nodes;
- global state and subscriptions.

## Diagnostic screenshots

Trusted plugins can use `klack.diagnostics` to capture the current Slack
window and copy a PNG to the system clipboard:

```ts
const screenshot = await klack.diagnostics.capturePage();
await klack.diagnostics.copyImage(screenshot);
```

`capturePage()` returns a PNG data URL for the calling Slack window only.
`copyImage()` accepts PNG data URLs and writes an image-only clipboard entry so
chat and issue-tracking clients paste the screenshot instead of preferring a
plain-text representation. Do not collect message bodies, composer contents,
credentials, or other private data without an explicit user action and clear
disclosure.

Do not remove or overwrite a newer Slack-owned value during cleanup when the
UI may have changed independently.

## Link and event handling

- Intercept events only when changing navigation is the feature.
- Scope delegated handlers to the intended link type.
- Preserve right-click and non-primary mouse behavior.
- Use `noopener noreferrer` for new browsing contexts.
- Use capture and `stopImmediatePropagation()` only when Slack's delegated
  handler must be bypassed; otherwise preserve normal event propagation.
- Remember that browsers decide whether `_blank` becomes a tab or a window.
- Do not assume a Slack permalink is a thread link merely because it contains
  `/archives/`; timestamps and attachment footers use similar URLs.

## Debug and verify

Open DevTools only while inspecting; a detached DevTools window creates an
additional renderer and can affect perceived performance.

Useful console commands:

```js
Klack.list()
Klack.disable("ExamplePlugin")
Klack.enable("ExamplePlugin")
```

On macOS, renderer logs are written beneath:

```text
~/Library/Application Support/Slack/logs/
```

Look for:

```text
[Klack] Started ExamplePlugin
[Klack] Hot reloaded N plugin(s)
[Klack] Failed ...
```

Before finishing a plugin:

1. Confirm the source compiles.
2. Confirm the plugin starts in Slack without errors.
3. Verify the selector against live DOM rather than copied markup alone.
4. Verify additions and React-replaced nodes receive the behavior.
5. Verify hot reload removes the old behavior before applying the new one.
6. Disable the plugin and confirm every contribution is restored or removed.
7. Scroll, type, and switch conversations with DevTools closed to catch idle
   performance regressions.
8. Remove temporary probes and debug logging.

Plugins are not sandboxed from Slack or from each other. Install only code you
have reviewed.
