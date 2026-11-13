// Builds the Orca plugin into plugin/: the manifest, the editor, the example a new file starts
// from, and the icon and store images once they exist. The bundle is not minified, as Orca's
// listing policy wants a readable plugin, and ships no sourcemap, which would take it past Orca's
// size review. Of zod's error messages it bundles only the English ones, the only ones the editor
// shows.
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorBundle } from '@miragon/__NOTATION__-ide-editor/esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, 'plugin');

let zodLocalesRedirected = false;
/** @type {import('esbuild').Plugin} */
const englishZodMessagesOnly = {
  name: 'english-zod-messages-only',
  setup(build) {
    build.onResolve({ filter: /^\.\.\/locales\/index\.js$/ }, ({ importer, resolveDir }) => {
      if (!/[\\/]node_modules[\\/]zod[\\/]/.test(importer)) return undefined;
      zodLocalesRedirected = true;
      return {
        path: resolve(resolveDir, '../locales/index.js'),
        namespace: 'english-zod-messages',
      };
    });
    build.onLoad({ filter: /.*/, namespace: 'english-zod-messages' }, ({ path }) => ({
      contents: 'export { default as en } from "./en.js";',
      resolveDir: dirname(path),
    }));
  },
};

await rm(plugin, { recursive: true, force: true });
await esbuild.build({
  ...editorBundle,
  plugins: [...editorBundle.plugins, englishZodMessagesOnly],
  entryPoints: [resolve(here, 'src/main.ts')],
  outfile: resolve(plugin, 'editor/dist/main.js'),
  format: 'esm',
  sourcemap: false,
  minify: false,
  logLevel: 'warning',
});
if (!zodLocalesRedirected) {
  throw new Error('zod no longer imports ../locales/index.js: update englishZodMessagesOnly');
}
await cp(resolve(here, 'editor/index.html'), resolve(plugin, 'editor/index.html'));
for (const folder of ['assets', 'images']) {
  if (existsSync(resolve(here, folder))) {
    await cp(resolve(here, folder), resolve(plugin, folder), { recursive: true });
  }
}
const manifest = JSON.parse(await readFile(resolve(here, 'orca-plugin.json'), 'utf8'));
await writeFile(resolve(plugin, 'orca-plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(resolve(here, 'CHANGELOG.md'), resolve(plugin, 'CHANGELOG.md')).catch(() => undefined);
await mkdir(resolve(plugin, 'templates'), { recursive: true });
await cp(
  resolve(here, '../../example/order-fulfilment.__EXT__'),
  resolve(plugin, 'templates/example.__EXT__'),
);
console.log(`[__NOTATION__-orca] built ${plugin}`);
