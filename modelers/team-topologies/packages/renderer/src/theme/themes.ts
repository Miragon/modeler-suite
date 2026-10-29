import type { AppearanceTheme } from "@miragon/modeler-api";

/**
 * The modes Team Topologies draws, the one it falls back to first: `themes` of the contract's
 * `appearance` surface. Light only until the Miragon modelers move to dark together (guide §13.5),
 * so the web app writes `data-cd-theme="light"` statically and the VS Code webview stays light in
 * every VS Code theme, high contrast still passing through.
 *
 * Both apps, the VS Code extension's theme bridge and the renderer read this one constant. The
 * module has no runtime imports, so the extension host and the web app's Vite config take it from
 * the source without the renderer's stylesheet or diagram-js.
 */
export const TEAM_TOPOLOGIES_THEMES: readonly [AppearanceTheme, ...AppearanceTheme[]] =
  Object.freeze(["light"] as const);
