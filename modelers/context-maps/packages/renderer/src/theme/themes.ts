import type { AppearanceTheme } from "@miragon/modeler-api";

/**
 * The modes the map can be drawn in, the fallback first: the contract's `appearance.themes`, and
 * what both apps and the VS Code theme bridge pass to the shell. Light only until the Miragon
 * modelers switch to dark together (guide §13.3, §13.5). This file imports nothing at runtime, so
 * the web app's Vite config and the extension host read it without the renderer's entry, which
 * brings diagram-js and its stylesheet.
 */
export const CONTEXT_MAPS_THEMES: readonly AppearanceTheme[] = Object.freeze<AppearanceTheme[]>([
  "light",
]);
