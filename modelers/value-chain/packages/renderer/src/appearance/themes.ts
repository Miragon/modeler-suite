import type { AppearanceTheme } from "@miragon/modeler-api";

const LIGHT_ONLY: AppearanceTheme[] = ["light"];

/**
 * The themes the value chain canvas draws, the first its fallback (contract 1.5
 * `appearance.themes`, guide §13.5): light only, until the Miragon modelers move to
 * `["light", "dark"]` together. The collaborative modeler and viewer report it, and both apps and
 * the VS Code theme bridge read it, so every host asks for the same modes. This module imports
 * nothing at runtime, so the extension host and build configs can read it without the canvas.
 */
export const VALUE_CHAIN_THEMES: readonly AppearanceTheme[] = Object.freeze(LIGHT_ONLY);
