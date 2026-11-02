import { resolve } from "node:path";
import { webHeadMarkup } from "@miragon/modeler-shell/core";
import { defineConfig, type Plugin } from "vite";
import tokens from "../../packages/renderer/src/theme/cd-tokens.generated.json" with { type: "json" };
import { THEMES } from "../../packages/renderer/src/themes.ts";

const fromRoot = (path: string): string => resolve(import.meta.dirname, "../..", path);

/**
 * The mode before the first paint (guide §13.3): a light-only modeler keeps `data-cd-theme="light"`
 * static in index.html and gets one theme-color and the contrast line; with "dark" in THEMES the
 * same call writes the whole mode script.
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

// The workspace packages from source: the dev server and e2e run without a prior build.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@miragon/c4-renderer/assets/c4.css",
        replacement: fromRoot("packages/renderer/src/assets/c4.css"),
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
  plugins: [modeMarkup()],
  server: { port: 5182, strictPort: true, allowedHosts: [".localhost"] },
  build: {
    target: "es2022",
    sourcemap: true,
    // The shell inlines Lucide icon geometry (ISC, partly Feather, MIT) under a legal comment that
    // the bundle must keep.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
});
