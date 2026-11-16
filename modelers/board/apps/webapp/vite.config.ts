import { webHeadMarkup } from "@miragon/modeler-shell/core";
import { sourceAliases } from "board-suite-editors/build/aliases.mjs";
import { cssBaseAliases } from "board-suite-editors/build/css-base.mjs";
import { bpmnSheetScopeVite } from "board-suite-editors/build/css-scope.mjs";
import { noticesPlugin } from "board-suite-editors/build/notices-build.mjs";
import { prebundle } from "board-suite-editors/build/prebundle.mjs";
import { defineConfig, type Plugin } from "vite";
import tokens from "../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };

/**
 * The page's mode before the first paint (guide §13.3). The board draws light only: index.html
 * says `data-cd-theme="light"` itself, and this writes the one theme-color and the contrast line
 * of the guide's script in the place of the marker.
 */
const modeMarkup = (): Plugin => ({
  name: "miragon-mode",
  transformIndexHtml: (html) =>
    html.replace(
      "<!-- miragon-mode -->",
      webHeadMarkup({
        themes: ["light"],
        themeColors: { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] },
      }),
    ),
});

export default defineConfig({
  // Every package of the suite from its source, so that no modeler is built first, and the base
  // every renderer sheet brings along emptied there: the page loads it once
  // (board-suite-editors/base), before any of them.
  resolve: { alias: [...cssBaseAliases, ...sourceAliases] },
  // A production build writes its third-party notices from what it bundled and fails when they are
  // not whole; the check reads the source maps for what is in the build.
  // The BPMN modeler's sheet is held to its editors (`css-scope.mjs`).
  plugins: [
    modeMarkup(),
    bpmnSheetScopeVite,
    noticesPlugin({ product: "The Modeler Board web app" }),
  ],
  // A notation loads when a node first shows it. What its renderer imports is bundled up front:
  // met only then, the dev server would bundle it and reload the page under an open board.
  optimizeDeps: { include: prebundle },
  server: { port: 5184, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // The board's icons are Lucide's (ISC), and the shell and the renderers inline Lucide
    // geometry under a legal comment of their own; the bundle keeps them, as their notices ask.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
});
