// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler + CSS)  -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, we bundle the @miragon/context-maps-* packages straight from SOURCE (aliased to
// src/index.ts). That makes the build self-contained: no prior lib build needed, and the diagram-js
// imports resolve relative to the renderer source (packages/renderer/node_modules).
// @miragon/modeler-shell comes from node_modules in both bundles.
import * as esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const r = (p) => resolve(root, p);

/** Package aliases pointing at the TS source (mirrors apps/webapp/vite.config.ts). */
const alias = {
  "@miragon/context-maps-renderer": r("packages/renderer/src/index.ts"),
  "@miragon/context-maps-schema-model": r("packages/schema-model/src/index.ts"),
  "@miragon/context-maps-cml": r("packages/cml/src/index.ts"),
};

/**
 * `import url from "file?dataurl"` inlines that one file as a data: URL, while every other import of
 * the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an image
 * can't load the webview's font files, and the webview's CSP has no connect-src to fetch them.
 * @type {import('esbuild').Plugin}
 */
const dataUrlImports = {
  name: "dataurl-imports",
  setup(build) {
    build.onResolve({ filter: /\?dataurl$/ }, async (args) => {
      const resolved = await build.resolve(args.path.slice(0, -"?dataurl".length), {
        kind: args.kind,
        resolveDir: args.resolveDir,
      });
      if (resolved.errors.length > 0) return { errors: resolved.errors };
      return { path: resolved.path, namespace: "dataurl" };
    });
    build.onLoad({ filter: /.*/, namespace: "dataurl" }, async (args) => ({
      contents: await readFile(args.path),
      loader: "dataurl",
    }));
  },
};

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
  entryPoints: [resolve(here, "src/webview/main.ts")],
  outfile: resolve(here, "dist/webview.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
  alias,
  // Font files next to the bundle, not inlined: Geist Mono alone brings six subsets, and as
  // separate files the browser fetches only the ones a page's unicode-range needs. The CSP of
  // renderWebviewHtml allows fonts from cspSource, and dist/ is the webview's resource root.
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  assetNames: "fonts/[name]-[hash]",
  plugins: [dataUrlImports],
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
