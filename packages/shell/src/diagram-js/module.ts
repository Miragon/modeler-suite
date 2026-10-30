import { SHELL_SERVICE, ShellDiagramService } from "./service.js";
import type { ModuleDeclarationLike } from "./types.js";

/**
 * Add to the modeler's modules (`additionalModules`, after the renderer's own modules):
 * - `paletteTooltip: ["value", null]` removes diagram-js's (or the renderer's) palette tooltip; the
 *   chrome tooltip takes over;
 * - the palette skin: on `palette.create` it sets `data-chrome="palette"` and moves the palette
 *   before the canvas `<svg>`; after every `palette.changed` it re-applies `role="toolbar"`,
 *   `aria-label`, roving `tabindex` and `aria-pressed` (from `tool-manager.update`), and it puts
 *   down a tool whose armed drag a cancel ended without arming another (Escape before a move);
 * - `keyboard.addListener(2000, …)` returning `true` for every chrome key, so `KeyboardBindings` and
 *   the modeler's keyboard modules (priority 1000) never act on them.
 * It buffers the palette until `connectDiagramJs` hands it to a shell, so the diagram may be
 * constructed before `mountShell`.
 */
export const shellModule: ModuleDeclarationLike = {
  __init__: [SHELL_SERVICE],
  [SHELL_SERVICE]: ["type", ShellDiagramService],
  paletteTooltip: ["value", null],
};
