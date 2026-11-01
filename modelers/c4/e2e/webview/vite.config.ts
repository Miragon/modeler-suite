import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const fromRoot = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** The extension's esbuild build inlines `?dataurl` imports; Vite's `?inline` does the same. */
const dataUrlImports: Plugin = {
  name: "dataurl-imports",
  enforce: "pre",
  async resolveId(source, importer) {
    if (!source.endsWith("?dataurl")) return null;
    const resolved = await this.resolve(source.slice(0, -"?dataurl".length), importer, {
      skipSelf: true,
    });
    return resolved ? `${resolved.id}?inline` : null;
  },
};

/** The VS Code webview test page: apps/vscode/src/webview/main.ts inside the shell's VS Code stub. */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [dataUrlImports],
  resolve: {
    alias: [
      {
        find: "@miragon/c4-renderer/assets/c4.css",
        replacement: fromRoot("packages/renderer/src/assets/c4.css"),
      },
      {
        find: "@miragon/c4-renderer/themes",
        replacement: fromRoot("packages/renderer/src/themes.ts"),
      },
      {
        find: "@miragon/c4-renderer",
        replacement: fromRoot("packages/renderer/src/index.ts"),
      },
      {
        find: "@miragon/c4-schema-model",
        replacement: fromRoot("packages/schema-model/src/index.ts"),
      },
      { find: "@miragon/c4-dsl", replacement: fromRoot("packages/dsl/src/index.ts") },
      { find: "@miragon/c4-layout", replacement: fromRoot("packages/layout/src/index.ts") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_WEBVIEW_PORT ?? 5192),
    strictPort: true,
    // the suite hoists node_modules (fonts, the shell's styles) to its root, outside this modeler
    fs: {
      allow: [fromRoot(""), fileURLToPath(new URL("../../../../node_modules", import.meta.url))],
    },
  },
});
