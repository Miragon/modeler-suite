// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler + CSS)  -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, we bundle the @miragon/context-maps-* packages straight from SOURCE (aliased to
// src/index.ts). That makes the build self-contained: no prior lib build needed, and the diagram-js
// imports resolve relative to the renderer source (packages/renderer/node_modules).
// @miragon/modeler-shell comes from node_modules in both bundles.
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { alias, editorBundle } from "context-maps-ide-editor/esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

/**
 * @param {boolean} production
 * @returns {import('esbuild').BuildOptions}
 */
const common = (production) => ({
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
});

/**
 * The extension host; `production` is the bundle `vscode:prepublish` puts into the VSIX.
 * @param {boolean} production
 * @returns {import('esbuild').BuildOptions}
 */
export const hostOptions = (production) => ({
  ...common(production),
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(here, "dist/extension.cjs"),
  platform: "node",
  format: "cjs",
  // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its
  // globalThis.crypto.
  target: "node20",
  // jsonc-parser's `main` is a UMD build whose inner requires esbuild can't follow: they would stay
  // in the bundle and throw on load, as the VSIX ships no node_modules, so the extension would
  // never activate.
  mainFields: ["module", "main"],
  alias,
  // `vscode` is only available at runtime (from the host) and must not be bundled.
  external: ["vscode"],
});

/**
 * @param {boolean} production
 * @returns {import('esbuild').BuildOptions}
 */
export const webviewOptions = (production) => ({
  ...common(production),
  ...editorBundle,
  entryPoints: [resolve(here, "src/webview/main.ts")],
  outfile: resolve(here, "dist/webview.js"),
  format: "iife",
});

// The bundle test imports the options; only a direct run builds.
if (import.meta.main) {
  const builds = [hostOptions(production), webviewOptions(production)];
  if (watch) {
    const ctxs = await Promise.all(builds.map((options) => esbuild.context(options)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[context-maps-vscode] watching …");
  } else {
    await Promise.all(builds.map((options) => esbuild.build(options)));
    console.log("[context-maps-vscode] build done");
  }
}
