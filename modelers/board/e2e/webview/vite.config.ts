import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sourceAliases } from "../../apps/editors/build/aliases.mjs";
import { cssBaseAliases } from "../../apps/editors/build/css-base.mjs";
import { prebundle } from "../../apps/editors/build/prebundle.mjs";

/**
 * The VS Code webview test page: apps/vscode/src/webview/main.ts inside the shell's VS Code
 * stub. Like apps/webapp/vite.config.ts it takes every package of the suite from its source, so
 * the suite runs without a prior build, and empties the base every renderer sheet brings along:
 * the webview loads it once (board-suite-editors/base).
 */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: [...cssBaseAliases, ...sourceAliases] },
  // A notation loads when a node first shows it. What its renderer imports is bundled up front:
  // met only then, the dev server would bundle it and reload the page under a running test.
  optimizeDeps: { include: prebundle },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.E2E_WEBVIEW_PORT ?? 5194),
    strictPort: true,
    // The page reads the sources of every modeler and the suite's hoisted node_modules, all
    // outside this folder.
    fs: { allow: [fileURLToPath(new URL("../../../../", import.meta.url))] },
  },
});
