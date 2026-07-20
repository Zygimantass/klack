import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { THEME_SELECTORS, selectorFor } from "../src/theme-selectors";
import { loadThemes } from "../src/themes";

function fixture(t: test.TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "klack-themes-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

test("loads theme metadata and inlines local CSS modules", (t) => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, "minimal"));
  fs.writeFileSync(
    path.join(directory, "minimal", "minimal.theme.css"),
    `/**
     * @id Minimal
     * @name Minimal Theme
     * @description A fixture theme
     * @version 2.0.0
     */
    @import "./tokens.css";
    body { color: var(--fixture); }
    `,
  );
  fs.writeFileSync(path.join(directory, "minimal", "tokens.css"), ":root { --fixture: red; }");

  const [theme] = loadThemes({ directories: [directory] });
  assert.deepEqual(
    { description: theme.description, id: theme.id, name: theme.name, version: theme.version },
    { description: "A fixture theme", id: "Minimal", name: "Minimal Theme", version: "2.0.0" },
  );
  assert.match(theme.css, /--fixture: red/);
  assert.match(theme.css, /body \{ color: var\(--fixture\); \}/);
  assert.doesNotMatch(theme.css, /@import/);
});

test("preserves theme identity when compiled CSS starts with a charset", (t) => {
  const directory = fixture(t);
  fs.writeFileSync(
    path.join(directory, "charset.theme.css"),
    `@charset "UTF-8";
/**
 * @id CharsetTheme
 * @name Charset theme
 */
:root::before { content: "→"; }
`,
  );

  const [theme] = loadThemes({ directories: [directory] });

  assert.equal(theme.id, "CharsetTheme");
  assert.equal(theme.name, "Charset theme");
});

test("later theme directories override earlier definitions by id", (t) => {
  const root = fixture(t);
  const builtIn = path.join(root, "built-in");
  const user = path.join(root, "user");
  fs.mkdirSync(builtIn);
  fs.mkdirSync(user);
  fs.writeFileSync(
    path.join(builtIn, "same.theme.css"),
    "/** @id Same\n * @name Built In\n */\nbody { color: red; }",
  );
  fs.writeFileSync(
    path.join(user, "override.theme.css"),
    "/** @id Same\n * @name User Override\n */\nbody { color: blue; }",
  );

  const themes = loadThemes({ directories: [builtIn, user] });
  assert.equal(themes.length, 1);
  assert.equal(themes[0].name, "User Override");
  assert.match(themes[0].css, /color: blue/);
});

test("rejects remote, escaping, and circular theme imports", (t) => {
  const directory = fixture(t);
  const errors: Array<{ path: string; error: unknown }> = [];
  fs.writeFileSync(path.join(directory, "outside.css"), "body {}");
  for (const [name, source] of [
    ["remote", '@import "https://example.com/theme.css";'],
    ["escaping", '@import "../outside.css";'],
    ["circular", '@import "./circular.theme.css";'],
  ]) {
    fs.writeFileSync(path.join(directory, `${name}.theme.css`), source);
  }

  const themes = loadThemes({
    directories: [directory],
    onError(themePath, error) {
      errors.push({ error, path: themePath });
    },
  });
  assert.equal(themes.length, 0);
  assert.equal(errors.length, 3);
  assert.match(String(errors[0].error), /Theme imports must be local|Circular theme import/);
  assert.ok(errors.every(({ path: themePath }) => themePath.endsWith(".theme.css")));
});

test("theme selector registry exposes ordered, composable candidates", () => {
  assert.ok(Object.keys(THEME_SELECTORS).length >= 250);
  assert.equal(
    selectorFor("slack.message.row"),
    ':is([data-qa="message_container"], .c-message_kit__message)',
  );
  assert.equal(THEME_SELECTORS["klack.plugin-manager.dialog"].candidates[0].stability, "owned");
  assert.equal(THEME_SELECTORS["slack.message.row"].required, true);
});

test("theme selector registry exposes compact-theme affordances", () => {
  assert.match(selectorFor("slack.channel-header.members-action"), /data-qa="avatar_stack"/);
  assert.match(selectorFor("slack.composer.actions-buttons"), /data-qa="wysiwyg-container_toolbar-buttons"/);
  assert.match(selectorFor("slack.composer.emoji-action"), /data-qa="emoji_toolbar_button"/);
  assert.match(selectorFor("slack.message.reaction"), /data-qa="reactji"/);
  assert.match(selectorFor("klack.loaded-indicator.button"), /LoadedIndicator:loaded-indicator/);
  assert.equal(
    selectorFor("slack.message.user-mention"),
    ':is([data-qa="rich_text_message_mention_element"], .c-mrkdwn__mention, .c-member_slug[data-stringify-type="mention"])',
  );
  assert.equal(selectorFor("slack.message.user-group-mention"), ".c-mrkdwn__user_group");
});
