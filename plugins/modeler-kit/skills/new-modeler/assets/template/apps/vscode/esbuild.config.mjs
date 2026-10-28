// Two bundles from one run:
//   the extension host (Node, CJS, `vscode` external) -> dist/extension.cjs
//   the webview (browser, IIFE, diagram and chrome)    -> dist/webview.js and dist/webview.css
// Both take the workspace packages from source, so the build needs no prior library build.
import * as esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fromRoot = (path) => resolve(here, '../..', path);
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const alias = {
  '@miragon/__NOTATION__-renderer/themes': fromRoot('packages/renderer/src/themes.ts'),
  '@miragon/__NOTATION__-renderer': fromRoot('packages/renderer/src/index.ts'),
  '@miragon/__NOTATION__-schema-model': fromRoot('packages/schema-model/src/index.ts'),
  '@miragon/__NOTATION__-dsl': fromRoot('packages/dsl/src/index.ts'),
};

/**
 * `import url from 'file?dataurl'` inlines that one file as a data: URL, while every other import
 * of the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an
 * image cannot load the webview's font files.
 * @type {import('esbuild').Plugin}
 */
const dataUrlImports = {
  name: 'dataurl-imports',
  setup(build) {
    build.onResolve({ filter: /\?dataurl$/ }, async (args) => {
      const resolved = await build.resolve(args.path.slice(0, -'?dataurl'.length), {
        kind: args.kind,
        resolveDir: args.resolveDir,
      });
      if (resolved.errors.length > 0) return { errors: resolved.errors };
      return { path: resolved.path, namespace: 'dataurl' };
    });
    build.onLoad({ filter: /.*/, namespace: 'dataurl' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'dataurl',
    }));
  },
};

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  alias,
};

const host = {
  ...common,
  entryPoints: [resolve(here, 'src/extension.ts')],
  outfile: resolve(here, 'dist/extension.cjs'),
  platform: 'node',
  format: 'cjs',
  // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its crypto.
  target: 'node20',
  external: ['vscode'],
};

const webview = {
  ...common,
  entryPoints: [resolve(here, 'src/webview/main.ts')],
  outfile: resolve(here, 'dist/webview.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  // Fonts as files next to the bundle: the CSP allows fonts from cspSource, and the browser loads
  // only the subsets a page's unicode-range needs.
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  // The shell's Lucide licence comment travels with the bundle.
  legalComments: 'inline',
  plugins: [dataUrlImports],
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(host), esbuild.context(webview)]);
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview)]);
}
