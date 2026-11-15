import { sourceAliases } from "board-suite-editors/build/aliases.mjs";
import { cssBaseAliases } from "board-suite-editors/build/css-base.mjs";
import { prebundle } from "board-suite-editors/build/prebundle.mjs";
import { defineConfig } from "vite";

export default defineConfig({
  // Every package of the suite from its source, so that no modeler is built first, and the base
  // every renderer sheet brings along emptied there: the page loads it once
  // (board-suite-editors/base), before any of them.
  resolve: { alias: [...cssBaseAliases, ...sourceAliases] },
  // A notation loads when a node first shows it. What its renderer imports is bundled up front:
  // met only then, the dev server would bundle it and reload the page under an open board.
  optimizeDeps: { include: prebundle },
  server: { port: 5184, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // The board's icons are Lucide's (ISC) and the renderers inline Lucide geometry under a legal
    // comment of their own; the bundle keeps both, as their notices ask.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
});
