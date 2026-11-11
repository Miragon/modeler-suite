// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler+CSS)    -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, we bundle the @miragon/business-model-canvas-* packages straight from SOURCE
// (aliased to src/index.ts). That makes the build self-contained: no prior lib build needed,
// and the diagram-js imports resolve relative to the renderer source. @miragon/modeler-shell
// comes from node_modules in both bundles.
import * as esbuild from "esbuild";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { alias, editorBundle } from "business-model-canvas-ide-editor/esbuild";

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
    alias,
    // `vscode` is only available at runtime (from the host) and must not be bundled.
    external: ["vscode"],
  };

  /** @type {import('esbuild').BuildOptions} */
  const web = {
    ...common,
    ...editorBundle,
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
    const ctxs = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[business-model-canvas-vscode] watching …");
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
    console.log("[business-model-canvas-vscode] build done");
  }
}
