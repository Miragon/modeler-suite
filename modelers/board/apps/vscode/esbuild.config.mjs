// Two bundles from one run:
//   1. Extension host (Node/CJS, `vscode` external)       -> dist/extension.cjs
//   2. Webview (browser/IIFE, the board and its editors)  -> dist/webview.js, dist/webview.css
//      and the font files beside them in dist/fonts
//
// Both are built from source. The board's packages export their TypeScript, and the webview
// takes the other modelers' packages from their sources too (board-suite-editors/build), so no
// modeler is built first. @miragon/modeler-shell comes from its dist in both bundles.
import * as esbuild from "esbuild";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { webviewBundle } from "board-suite-editors/build/esbuild.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The options of both bundles; `production` is the build the VSIX ships (`vscode:prepublish`).
 * @param {{ production: boolean }} mode
 * @returns {{ host: import('esbuild').BuildOptions, web: import('esbuild').BuildOptions }}
 */
export function bundleOptions({ production }) {
  /** @type {import('esbuild').BuildOptions} */
  const common = {
    bundle: true,
    sourcemap: !production,
    minify: production,
    // The shell's chunks bring bare imports that esbuild names in a warning: a warning is no
    // failed build here.
    logLevel: "info",
  };

  /** @type {import('esbuild').BuildOptions} */
  const host = {
    ...common,
    entryPoints: [resolve(here, "src/extension.ts")],
    outfile: resolve(here, "dist/extension.cjs"),
    platform: "node",
    format: "cjs",
    // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its
    // globalThis.crypto.
    target: "node20",
    // `vscode` is only available at runtime (from the host) and must not be bundled.
    external: ["vscode"],
  };

  /** @type {import('esbuild').BuildOptions} */
  const web = {
    ...common,
    ...webviewBundle,
    entryPoints: [resolve(here, "src/webview/main.ts")],
    outfile: resolve(here, "dist/webview.js"),
    format: "iife",
  };

  return { host, web };
}

// The bundle test imports the options; only a direct run builds. The module URL is the real path,
// argv keeps a symlinked one (macOS /tmp).
const directRun =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  const { host, web } = bundleOptions({ production: process.argv.includes("--production") });
  if (process.argv.includes("--watch")) {
    const contexts = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all(contexts.map((context) => context.watch()));
    console.log("[board-vscode] watching …");
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
    console.log("[board-vscode] build done");
  }
}
