import type { ModuleDeclaration } from "didi";
import PaletteModule from "diagram-js/lib/features/palette";
import CreateModule from "diagram-js/lib/features/create";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import TtPaletteProvider from "./TtPaletteProvider.js";
import TtPaletteTooltip from "./TtPaletteTooltip.js";
import { ttHoverTooltipTeardownModule } from "./TtHoverTooltipTeardown.js";

/**
 * Tool palette (lasso, drag-to-create teams, interactions, flows and annotations). `paletteTooltip`
 * overrides the diagram-js service of that name.
 */
export const ttPaletteModule: ModuleDeclaration = {
  __depends__: [PaletteModule, ttHoverTooltipTeardownModule, CreateModule, LassoToolModule],
  __init__: ["ttPaletteProvider", "paletteTooltip"],
  ttPaletteProvider: ["type", TtPaletteProvider],
  paletteTooltip: ["type", TtPaletteTooltip],
};

export { default as TtPaletteProvider } from "./TtPaletteProvider.js";
