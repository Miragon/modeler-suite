// Two bundles from one run:
//   the extension host (Node, CJS, `vscode` external) -> dist/extension.cjs
//   the webview (browser, IIFE, diagram and chrome)    -> dist/webview.js and dist/webview.css
// Both take the workspace packages from source (the ide-editor's alias), so the build needs no
// prior library build.
import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alias, editorBundle } from '@miragon/__NOTATION__-ide-editor/esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const host = {
  ...common,
  entryPoints: [resolve(here, 'src/extension.ts')],
  outfile: resolve(here, 'dist/extension.cjs'),
  platform: 'node',
  format: 'cjs',
  // VS Code 1.96 (engines) runs extensions on Node 20; the shell's createNonce needs its crypto.
  target: 'node20',
  alias,
  external: ['vscode'],
};

const webview = {
  ...common,
  ...editorBundle,
  entryPoints: [resolve(here, 'src/webview/main.ts')],
  outfile: resolve(here, 'dist/webview.js'),
  format: 'iife',
  // The shell's Lucide licence comment travels with the bundle.
  legalComments: 'inline',
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(host), esbuild.context(webview)]);
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all([esbuild.build(host), esbuild.build(webview)]);
}
