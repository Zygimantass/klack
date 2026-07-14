import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { pluginEvaluationSource } from "../src/plugin-source";
import { loadPlugins } from "../src/plugins";

test("loads the default export from a bundled TypeScript plugin", () => {
  const [plugin] = loadPlugins({
    directories: [path.resolve("plugins")],
    sdkPath: path.resolve("dist", "sdk.js"),
  });
  let loaded: { extension: unknown; sourceName: string } | undefined;

  vm.runInNewContext(pluginEvaluationSource(plugin), {
    Klack: {
      loadPlugin(sourceName: string, extension: unknown) {
        loaded = { extension, sourceName };
      },
    },
  });

  assert.ok(loaded);
  assert.equal(loaded.sourceName, "loaded-indicator.js");
  assert.equal((loaded.extension as { name?: unknown }).name, "LoadedIndicator");
  assert.equal(typeof (loaded.extension as { setup?: unknown }).setup, "function");
});

test("loads a zero-build CommonJS extension factory", (t) => {
  let loaded: { extension: unknown; sourceName: string } | undefined;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "klack-commonjs-plugin-"));
  fs.writeFileSync(path.join(directory, "plain-plugin.js"), "module.exports = function () {};");
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));

  const [plugin] = loadPlugins({
    directories: [directory],
    sdkPath: path.resolve("dist", "sdk.js"),
  });

  vm.runInNewContext(pluginEvaluationSource(plugin), {
    Klack: {
      loadPlugin(sourceName: string, extension: unknown) {
        loaded = { extension, sourceName };
      },
    },
  });

  assert.ok(loaded);
  assert.equal(loaded.sourceName, "plain-plugin.js");
  assert.equal(typeof loaded.extension, "function");
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
    sdkPath: path.resolve("dist", "sdk.js"),
  });
  let extension: { name?: unknown } | undefined;
  vm.runInNewContext(pluginEvaluationSource(plugin), {
    Klack: {
      loadPlugin(_sourceName: string, candidate: { name?: unknown }) {
        extension = candidate;
      },
    },
  });

  assert.equal(plugin.name, "same-name.js");
  assert.equal(extension?.name, "UserPlugin");
});
