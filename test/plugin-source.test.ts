import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { pluginEvaluationSource } from "../src/plugin-source";
import { loadPlugins } from "../src/plugins";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUILT_IN_PLUGINS = path.join(REPOSITORY_ROOT, "plugins");
const SDK_PATH = path.join(REPOSITORY_ROOT, "dist", "sdk.js");

test("loads every bundled TypeScript plugin", () => {
  const errors: Array<{ error: unknown; pluginPath: string }> = [];
  const plugins = loadPlugins({
    directories: [BUILT_IN_PLUGINS],
    onError(pluginPath, error) {
      errors.push({ error, pluginPath });
    },
    sdkPath: SDK_PATH,
  });
  const loaded: Array<{ extension: unknown; sourceName: string }> = [];

  for (const plugin of plugins) {
    vm.runInNewContext(pluginEvaluationSource(plugin), {
      Klack: {
        loadPlugin(extension: unknown) {
          loaded.push({ extension, sourceName: plugin.name });
        },
      },
    });
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(
    loaded.map(({ sourceName }) => sourceName),
    plugins.map(({ name }) => name),
  );
  loaded.forEach(({ extension }) => {
    const name = (extension as { name?: unknown }).name;
    assert.equal(typeof name, "string");
    assert.match(name as string, /^[A-Za-z0-9_-]+$/);
    assert.equal(typeof (extension as { setup?: unknown }).setup, "function");
  });
  assert.equal(
    new Set(loaded.map(({ extension }) => (extension as { name: string }).name)).size,
    loaded.length,
  );

  const vimNavigation = loaded.find(({ sourceName }) => sourceName === "vim-navigation.js");
  assert.ok(vimNavigation);
  assert.equal((vimNavigation.extension as { name?: unknown }).name, "VimNavigation");
  assert.equal((vimNavigation.extension as { defaultEnabled?: unknown }).defaultEnabled, false);
});

test("loads a zero-build CommonJS plugin definition", (t) => {
  let loaded: { extension: unknown; sourceName: string } | undefined;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "klack-commonjs-plugin-"));
  fs.writeFileSync(
    path.join(directory, "plain-plugin.js"),
    'module.exports = { name: "PlainPlugin", setup() {} };',
  );
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));

  const [plugin] = loadPlugins({
    directories: [directory],
    sdkPath: SDK_PATH,
  });

  vm.runInNewContext(pluginEvaluationSource(plugin), {
    Klack: {
      loadPlugin(extension: unknown) {
        loaded = { extension, sourceName: plugin.name };
      },
    },
  });

  assert.ok(loaded);
  assert.equal(loaded.sourceName, "plain-plugin.js");
  assert.equal((loaded.extension as { name?: unknown }).name, "PlainPlugin");
  assert.equal(typeof (loaded.extension as { setup?: unknown }).setup, "function");
});

test("rejects legacy plugin shapes", () => {
  for (const legacySource of [
    "module.exports = function () {};",
    'module.exports = { name: "Legacy", start() {} };',
  ]) {
    const source = pluginEvaluationSource({
      name: "legacy-plugin.js",
      source: legacySource,
    });

    assert.throws(
      () => vm.runInNewContext(source, { Klack: { loadPlugin() {} } }),
      /must default-export definePlugin/,
    );
  }
});

test("loads TypeScript from a user plugin directory and overrides matching built-ins", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "klack-plugins-"));
  const builtInDirectory = path.join(root, "built-in");
  const userDirectory = path.join(root, "user");
  fs.mkdirSync(builtInDirectory);
  fs.mkdirSync(userDirectory);
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  fs.writeFileSync(
    path.join(builtInDirectory, "same-name.ts"),
    `export default { name: "BuiltIn", setup() {} };`,
  );
  fs.writeFileSync(
    path.join(userDirectory, "same-name.ts"),
    `import { definePlugin } from "klack/sdk";
     export default definePlugin({ name: "UserPlugin", setup() {} });`,
  );

  const [plugin] = loadPlugins({
    directories: [builtInDirectory, userDirectory],
    sdkPath: SDK_PATH,
  });
  let extension: { name?: unknown } | undefined;
  vm.runInNewContext(pluginEvaluationSource(plugin), {
    Klack: {
      loadPlugin(candidate: { name?: unknown }) {
        extension = candidate;
      },
    },
  });

  assert.equal(plugin.name, "same-name.js");
  assert.equal(extension?.name, "UserPlugin");
});
