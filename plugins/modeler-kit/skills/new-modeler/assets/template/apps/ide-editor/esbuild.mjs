// The browser bundle options of the editor, shared by the VS Code webview and the Orca plugin: the
// workspace packages from source, font files next to the bundle, and the `?dataurl` imports the
// PNG export needs.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fromRoot = (path) => resolve(dirname(fileURLToPath(import.meta.url)), '../..', path);

export const alias = {
  '@miragon/__NOTATION__-renderer/themes': fromRoot('packages/renderer/src/themes.ts'),
  '@miragon/__NOTATION__-renderer': fromRoot('packages/renderer/src/index.ts'),
  '@miragon/__NOTATION__-schema-model': fromRoot('packages/schema-model/src/index.ts'),
  '@miragon/__NOTATION__-dsl': fromRoot('packages/dsl/src/index.ts'),
};

/**
 * `import url from 'file?dataurl'` inlines that one file as a data: URL, while every other import
 * of the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an
 * image cannot load the frame's font files.
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

/** @type {import('esbuild').BuildOptions} */
export const editorBundle = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  alias,
  // Fonts as files next to the bundle: the frame's CSP allows them, and the browser loads only the
  // subsets a page's unicode-range needs.
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  plugins: [dataUrlImports],
};
