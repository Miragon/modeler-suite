import { resolve } from "node:path";
import { webHeadMarkup } from "@miragon/modeler-shell/core";
import { defineConfig, type Plugin } from "vite";
import { THEMES } from "../../packages/renderer/src/themes.ts";
import tokens from "../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };

// The web app bundles the @miragon/business-model-canvas-* packages from their source, which is
// all they publish: no build of them comes first.
const r = (p: string): string => resolve(import.meta.dirname, p);

/**
 * The web app's mode before the first paint (guide §13.3): a light-only diagram writes
 * `data-cd-theme="light"` statically in index.html, one theme-color and the contrast line of the
 * guide's script. With the joint dark-mode release the renderer's THEMES gains "dark"
 * and the same call writes the whole script with both theme-colors (index.html then says
 * `data-cd-theme="system"`).
 */
const modeMarkup = (): Plugin => ({
  name: "miragon-mode",
  transformIndexHtml: (html) =>
    html.replace(
      "<!-- miragon-mode -->",
      webHeadMarkup({
        themes: THEMES,
        themeColors: { light: tokens.fest["--cd-blau"], dark: tokens.dunkel["--cd-ui-grund"] },
      }),
    ),
});

export default defineConfig({
  resolve: {
    alias: [
      // The stylesheet before the package: Rollup leaves out the barrel's own CSS import, since the
      // package marks only its CSS as having side effects.
      {
        find: "@miragon/business-model-canvas-renderer/assets/business-model-canvas.css",
        replacement: r("../../packages/renderer/src/assets/business-model-canvas.css"),
      },
      {
        find: "@miragon/business-model-canvas-renderer",
        replacement: r("../../packages/renderer/src/index.ts"),
      },
      {
        find: "@miragon/business-model-canvas-schema-model",
        replacement: r("../../packages/schema-model/src/index.ts"),
      },
      {
        find: "@miragon/business-model-canvas-dsl",
        replacement: r("../../packages/dsl/src/index.ts"),
      },
    ],
  },
  plugins: [modeMarkup()],
  server: { port: 5183, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: true,
    // The shell and the renderer inline Lucide's icon geometry (ISC, partly Feather, MIT) and name
    // both licences in a legal comment; the bundle keeps it, as their notices ask.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
});
