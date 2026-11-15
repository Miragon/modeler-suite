import { fileURLToPath } from "node:url";

/**
 * The base every renderer sheet of the suite brings along, once per page. Each sheet imports
 * diagram-js's own sheet and the vendored canvas mapping after its tokens. With several renderers
 * on one page every later copy of that base comes after an earlier renderer's own rules and
 * overrides them at equal weight: Context Maps' open context pad lost its `display: flex` to the
 * copy another renderer brought. So both imports are emptied wherever they are written, which is
 * in the renderer sheets alone, and the page loads the base once, before any of them
 * (`board-suite-editors/base`), through specifiers these helpers do not catch.
 */

const BASE_IMPORT = /^(diagram-js\/assets\/diagram-js\.css|\.\.\/theme\/cd-canvas\.css)$/;

const EMPTY_SHEET = fileURLToPath(new URL("./empty.css", import.meta.url));

/**
 * For Vite and Vitest (`resolve.alias`): an alias reaches a sheet's `@import`, which a plugin's
 * `resolveId` does not.
 *
 * @type {Array<{ find: RegExp, replacement: string }>}
 */
export const cssBaseAliases = [{ find: BASE_IMPORT, replacement: EMPTY_SHEET }];

/**
 * What the plugin below uses of esbuild's `PluginBuild`, written out because this workspace does
 * not depend on esbuild: the app that bundles with it does.
 *
 * @typedef {{
 *   onResolve(
 *     options: { filter: RegExp },
 *     callback: (args: { path: string }) => { path: string, namespace: string },
 *   ): void,
 *   onLoad(
 *     options: { filter: RegExp, namespace: string },
 *     callback: () => { contents: string, loader: "css" },
 *   ): void,
 * }} PluginBuild
 */

const EMPTY_NAMESPACE = "css-base-empty";

/**
 * For esbuild (`plugins`), to the same effect.
 *
 * @type {{ name: string, setup(build: PluginBuild): void }}
 */
export const cssBaseOnce = {
  name: "css-base-once",
  setup(build) {
    build.onResolve({ filter: BASE_IMPORT }, ({ path }) => ({ path, namespace: EMPTY_NAMESPACE }));
    build.onLoad({ filter: /.*/, namespace: EMPTY_NAMESPACE }, () => ({
      contents: "",
      loader: "css",
    }));
  },
};
