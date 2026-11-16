import { esbuildAlias } from "./aliases.mjs";
import { cssBaseOnce } from "./css-base.mjs";

/**
 * The options of a page that esbuild bundles into one script and one sheet with the board and
 * the suite's editors in it, the VS Code webview: every package of the suite from its source, so
 * that no modeler is built first, and the base every renderer sheet brings along emptied there
 * (the page loads it once, `board-suite-editors/base`). The caller adds its entry, its output
 * and the format; `minify` and `sourcemap` are its own as well.
 *
 * There is no `tsconfigRaw` on purpose: esbuild then reads the tsconfig next to each source file,
 * so every modeler's sources are compiled as in that modeler's own bundle, in strict mode, as
 * the modules they are in the board's browser tests.
 *
 * @type {import("esbuild").BuildOptions}
 */
export const webviewBundle = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  alias: esbuildAlias,
  plugins: [cssBaseOnce],
  // The board's renderer is TSX on the automatic runtime. Said here as well, so that it does not
  // hang on which tsconfig esbuild finds next to a source file.
  jsx: "automatic",
  // React's production build in a watch build too: esbuild's own default follows `minify`, and
  // the development build is one nobody ran under a webview's policy.
  define: { "process.env.NODE_ENV": '"production"' },
  // Font files next to the bundle, not inlined: as separate files the browser fetches only the
  // subsets a page's unicode-range needs.
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  assetNames: "fonts/[name]-[hash]",
};
