import type { AppearanceTheme } from "@miragon/modeler-api";

/**
 * The modes Event Storming draws, the one it falls back to first: light only until the Miragon
 * modelers move to dark together (guide §13.5). The contract's `appearance.themes`, the chrome of
 * both apps and the VS Code theme bridge read this one constant, so they cannot disagree.
 */
export const EVENT_STORMING_THEMES: readonly AppearanceTheme[] = Object.freeze(["light"]);
