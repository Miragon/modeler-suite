import type { AppearanceTheme } from "@miragon/modeler-api";

/**
 * The themes the diagram can be drawn in, the one to fall back to first (guide §13.5): the
 * contract's `appearance.themes`, the shell's `themes` in both apps and the theme bridge of the
 * extension host. Light only until the joint dark-mode release moves every Miragon modeler to
 * `['light', 'dark']` at once. A module of its own without the diagram, so Node code reads it: the
 * extension host, the VS Code smoke test and the e2e specs as
 * `@miragon/c4-renderer/themes`, the web app's Vite config from this file.
 */
export const THEMES: readonly AppearanceTheme[] = Object.freeze(["light"] as const);
