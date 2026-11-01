// Two bundles from one run:
//   the extension host (Node, CJS, `vscode` external) -> dist/extension.cjs
//   the webview (browser, IIFE, diagram and chrome)    -> dist/webview.js and dist/webview.css
// Both take the workspace packages from source, so the build needs no prior library build.
import * as esbuild from "esbuild";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fromRoot = (path) => resolve(here, "../..", path);
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const alias = {
  "@miragon/c4-renderer/themes": fromRoot("packages/renderer/src/themes.ts"),
  "@miragon/c4-renderer": fromRoot("packages/renderer/src/index.ts"),
  "@miragon/c4-schema-model": fromRoot("packages/schema-model/src/index.ts"),
  "@miragon/c4-dsl": fromRoot("packages/dsl/src/index.ts"),
  "@miragon/c4-layout": fromRoot("packages/layout/src/index.ts"),
};

/**
 * `import url from 'file?dataurl'` inlines that one file as a data: URL, while every other import
 * of the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an
 * image cannot load the webview's font files.
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
 * `import text from 'file?raw'` inlines that file as a string, as Vite does: the example the
 * extension writes is the repository's `example/bookshop.c4`, the one file both apps ship.
 * @type {import('esbuild').Plugin}
 */
const rawImports = {
  name: "raw-imports",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, async (args) => {
      const resolved = await build.resolve(args.path.slice(0, -"?raw".length), {
        kind: args.kind,
        resolveDir: args.resolveDir,
      });
      if (resolved.errors.length > 0) return { errors: resolved.errors };
      return { path: resolved.path, namespace: "raw" };
    });
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text",
      watchFiles: [args.path],
    }));
  },
};

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  alias,
};

/** @type {import('esbuild').BuildOptions} */
export const host = {
  ...common,
  entryPoints: [resolve(here, "src/extension.ts")],
  outfile: resolve(here, "dist/extension.cjs"),
  platform: "node",
  format: "cjs",
  // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its crypto.
  target: "node20",
  external: ["vscode"],
  plugins: [rawImports],
};

/** @type {import('esbuild').BuildOptions} */
export const webview = {
  ...common,
  entryPoints: [resolve(here, "src/webview/main.ts")],
  outfile: resolve(here, "dist/webview.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
  // Fonts as files next to the bundle: the CSP allows fonts from cspSource, and the browser loads
  // only the subsets a page's unicode-range needs.
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "fonts/[name]-[hash]",
  // The shell's Lucide licence comment travels with the bundle.
  legalComments: "inline",
  plugins: [dataUrlImports],
};

// scripts/third-party-notices.mjs reads the options too; only a direct run builds. The module URL
// is the real path, argv keeps a symlinked one.
const directRun =
  process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) {
  if (watch) {
    const contexts = await Promise.all([esbuild.context(host), esbuild.context(webview)]);
    await Promise.all(contexts.map((context) => context.watch()));
  } else {
    await Promise.all([esbuild.build(host), esbuild.build(webview)]);
  }
}
