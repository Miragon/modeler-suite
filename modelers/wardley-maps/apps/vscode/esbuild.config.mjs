// Two bundles from one run:
//   1. Extension host  (Node/CJS, `vscode` external)  -> dist/extension.cjs
//   2. Webview          (Browser/IIFE, Modeler+CSS)    -> dist/webview.js (+ dist/webview.css)
//
// Like the demo webapp, both bundles take the @miragon/wardley-* packages straight from SOURCE
// (aliased to src/index.ts). That makes the build self-contained: no prior lib build needed, and the
// diagram-js imports resolve relative to the renderer source (packages/renderer/node_modules). The
// host only pulls in the DOM-free DSL (diagnostics); @miragon/modeler-shell comes from node_modules
// in both.
import * as esbuild from "esbuild";
import { realpathSync } from "node:fs";
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
  "@miragon/wardley-renderer": r("packages/renderer/src/index.ts"),
  "@miragon/wardley-schema-model": r("packages/schema-model/src/index.ts"),
  "@miragon/wardley-dsl": r("packages/dsl/src/index.ts"),
  "@miragon/wardley-transforms": r("packages/transforms/src/index.ts"),
};

/**
 * `import url from "file?dataurl"` inlines that one file as a data: URL, while every other import of
 * the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an image
 * can't load the webview's font files.
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
};

// The options are also read by scripts/third-party-notices.mjs; only a direct run builds. The module
// URL is the real path, argv keeps a symlinked one.
const directRun =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  if (watch) {
    const ctxs = await Promise.all([esbuild.context(host), esbuild.context(web)]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[wardley-vscode] watching …");
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(web)]);
    console.log("[wardley-vscode] build done");
  }
}
