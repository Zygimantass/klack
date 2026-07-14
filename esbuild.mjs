import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const define = {
  __KLACK_VERSION__: JSON.stringify(packageJson.version),
};

await rm(new URL("./dist", import.meta.url), { force: true, recursive: true });
await mkdir(new URL("./dist", import.meta.url));

await Promise.all([
  build({
    bundle: false,
    entryPoints: ["src/sdk.ts"],
    format: "esm",
    outfile: "dist/sdk.js",
    platform: "browser",
    sourcemap: true,
  }),
  build({
    bundle: false,
    entryPoints: ["src/sdk.ts"],
    format: "cjs",
    outfile: "dist/sdk.cjs",
    platform: "browser",
    sourcemap: true,
  }),
]);

const renderer = await build({
  bundle: true,
  define,
  entryPoints: ["src/renderer.ts"],
  format: "iife",
  platform: "browser",
  sourcemap: "inline",
  write: false,
});
const rendererSource = renderer.outputFiles[0].text;
await writeFile(new URL("./dist/renderer.js", import.meta.url), rendererSource);

await Promise.all([
  build({
    bundle: true,
    define,
    entryPoints: ["src/main.ts"],
    external: ["electron", "esbuild"],
    format: "cjs",
    outfile: "dist/main.cjs",
    platform: "node",
    sourcemap: true,
  }),
  build({
    bundle: true,
    define: {
      ...define,
      __KLACK_RENDERER_SOURCE__: JSON.stringify(rendererSource),
    },
    entryPoints: ["src/preload.ts"],
    external: ["electron"],
    format: "iife",
    outfile: "dist/preload.js",
    platform: "node",
    sourcemap: "inline",
  }),
  build({
    banner: { js: "#!/usr/bin/env node" },
    bundle: true,
    entryPoints: ["src/cli.ts"],
    format: "cjs",
    outfile: "dist/cli.cjs",
    packages: "external",
    platform: "node",
    sourcemap: true,
  }),
]);
