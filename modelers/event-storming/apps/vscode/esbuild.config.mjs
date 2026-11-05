// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler+CSS)    -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, both bundles take the @miragon/event-storming-* packages straight from
// SOURCE (aliased to src/index.ts). That makes the build self-contained: no prior lib build needed,
// and the diagram-js imports resolve relative to the renderer source. The host needs the DSL for
// its diagnostics; @miragon/modeler-shell comes from node_modules in both.
import * as esbuild from "esbuild";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { alias, editorBundle } from "event-storming-ide-editor/esbuild";

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
  external: ["vscode"],
  alias,
};

/** @type {import('esbuild').BuildOptions} */
export const web = {
  ...common,
  ...editorBundle,
  entryPoints: [resolve(here, "src/webview/main.ts")],
  outfile: resolve(here, "dist/webview.js"),
  format: "iife",
  // The CSP of renderWebviewHtml allows fonts from cspSource, and dist/ is the webview's resource
  // root, so the editor's font files load from next to the bundle.
};

// The options are also read by scripts/third-party-notices.mjs; only a direct run builds. The module
// URL is the real path, argv keeps a symlinked one.
const directRun =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  if (watch) {
    const ctxs = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[event-storming-vscode] watching …");
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
    console.log("[event-storming-vscode] build done");
  }
}
