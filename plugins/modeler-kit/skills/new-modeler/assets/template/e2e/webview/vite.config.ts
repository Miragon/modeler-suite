import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const fromRoot = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** The extension's esbuild build inlines `?dataurl` imports; Vite's `?inline` does the same. */
const dataUrlImports: Plugin = {
  name: 'dataurl-imports',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (!source.endsWith('?dataurl')) return null;
    const resolved = await this.resolve(source.slice(0, -'?dataurl'.length), importer, {
      skipSelf: true,
    });
    return resolved ? `${resolved.id}?inline` : null;
  },
};

/** The VS Code webview test page: apps/vscode/src/webview/main.ts inside the shell's VS Code stub. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [dataUrlImports],
  resolve: {
    alias: [
      {
        find: '@miragon/__NOTATION__-renderer/assets/__NOTATION__.css',
        replacement: fromRoot('packages/renderer/src/assets/__NOTATION__.css'),
      },
      {
        find: '@miragon/__NOTATION__-renderer/themes',
        replacement: fromRoot('packages/renderer/src/themes.ts'),
      },
      {
        find: '@miragon/__NOTATION__-renderer',
        replacement: fromRoot('packages/renderer/src/index.ts'),
      },
      {
        find: '@miragon/__NOTATION__-schema-model',
        replacement: fromRoot('packages/schema-model/src/index.ts'),
      },
      { find: '@miragon/__NOTATION__-dsl', replacement: fromRoot('packages/dsl/src/index.ts') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.E2E_WEBVIEW_PORT ?? 5190),
    strictPort: true,
    fs: { allow: [fromRoot('')] },
  },
});
