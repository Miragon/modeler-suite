import type { AppearanceTheme } from "@miragon/modeler-api";

/**
 * The themes a Wardley map can be drawn in (`appearance.themes` of `@miragon/modeler-api`): light
 * only until the Miragon modelers turn dark together (guide §13.5). Both apps and the VS Code theme
 * bridge read this one list, so the web app, the webview and an embedding host draw the same modes.
 * The module touches no DOM, for hosts that read it outside the browser
 * (`@miragon/wardley-renderer/themes`).
 */
export const WARDLEY_THEMES: readonly [AppearanceTheme, ...AppearanceTheme[]] = Object.freeze([
  "light",
] as const);
