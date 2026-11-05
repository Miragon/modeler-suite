// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler + modeler shell + React inspector + CSS)
//                       -> dist/webview.js (+ dist/webview.css, Geist font files in dist/fonts/)
//
// Like the demo webapp, we bundle the @miragon/team-topologies-* packages straight from SOURCE (aliased to
// src/index.ts; the ui package's own `exports` already point there). That makes the build
// self-contained: no prior lib build needed, and the diagram-js imports resolve relative to the
// renderer source (packages/renderer/node_modules). @miragon/modeler-shell comes from node_modules
// in both bundles.
import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { alias, editorBundle } from "team-topologies-ide-editor/esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
export const host = {
  ...common,
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(here, "dist/extension.cjs"),
  platform: "node",
  format: "cjs",
  // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its
  // globalThis.crypto.
  target: "node20",
  // jsonc-parser's `main` is a UMD build whose inner requires esbuild can't follow: they would stay
  // in the bundle and throw on load, so the extension never registers its editors.
  mainFields: ["module", "main"],
  alias,
  // `vscode` is only available at runtime (from the host) and must not be bundled.
  external: ["vscode"],
};

/** @type {import('esbuild').BuildOptions} */
export const web = {
  ...common,
  ...editorBundle,
  entryPoints: [resolve(here, "src/webview/main.ts")],
  outfile: resolve(here, "dist/webview.js"),
  format: "iife",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
};

// The options are also read by scripts/third-party-notices.mjs; only a direct run builds.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (watch) {
    const ctxs = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[tt-vscode] watching …");
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
    console.log("[tt-vscode] build done");
  }
}
