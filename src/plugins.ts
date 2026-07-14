import fs from "node:fs";
import path from "node:path";

import { buildSync } from "esbuild";

export type LoadedPlugin = {
  name: string;
  source: string;
};

export type LoadPluginsOptions = {
  directories: string[];
  onError?: (pluginPath: string, error: unknown) => void;
  sdkPath: string;
};

const EXTENSION_PRIORITY = new Map([
  [".ts", 4],
  [".tsx", 3],
  [".js", 2],
  [".jsx", 1],
]);

function pluginFiles(directories: string[]): Map<string, string> {
  const selected = new Map<string, string>();

  for (const directory of directories) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    const directoryPlugins = new Map<string, { path: string; priority: number }>();
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      const priority = EXTENSION_PRIORITY.get(extension);
      if (!priority) continue;

      const name = path.basename(entry.name, extension);
      const current = directoryPlugins.get(name);
      if (!current || priority > current.priority) {
        directoryPlugins.set(name, { path: path.join(directory, entry.name), priority });
      }
    }

    // Later directories are higher priority, so user plugins can replace a
    // built-in plugin by using the same filename.
    directoryPlugins.forEach((plugin, name) => selected.set(name, plugin.path));
  }

  return selected;
}

function compilePlugin(pluginPath: string, sdkPath: string): string {
  const result = buildSync({
    alias: {
      "klack/sdk": sdkPath,
    },
    bundle: true,
    entryPoints: [pluginPath],
    format: "cjs",
    logLevel: "silent",
    platform: "browser",
    sourcemap: "inline",
    write: false,
  });
  const output = result.outputFiles?.find((file) => file.path.endsWith(".js")) || result.outputFiles?.[0];
  if (!output) throw new Error(`Plugin compiler produced no JavaScript for ${pluginPath}`);
  return output.text;
}

export function loadPlugins(options: LoadPluginsOptions): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = [];

  for (const [name, pluginPath] of pluginFiles(options.directories)) {
    try {
      plugins.push({
        name: `${name}.js`,
        source: compilePlugin(pluginPath, options.sdkPath),
      });
    } catch (error) {
      options.onError?.(pluginPath, error);
    }
  }

  return plugins;
}
