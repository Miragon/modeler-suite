import type { ModuleDeclaration } from "didi";
import PaletteModule from "diagram-js/lib/features/palette";
import CreateModule from "diagram-js/lib/features/create";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import TtPaletteProvider from "./TtPaletteProvider.js";
import TtPaletteToolbar from "./TtPaletteToolbar.js";
import TtPaletteTooltip from "./TtPaletteTooltip.js";
import { ttHoverTooltipTeardownModule } from "./TtHoverTooltipTeardown.js";

/**
 * Tool palette (lasso, drag-to-create teams, interactions, flows and annotations), and for a host
 * without the modeler shell its toolbar keys, semantics and read-only marks (`ttPaletteToolbar`)
 * and a tooltip below it. `paletteTooltip` overrides the diagram-js service of that name; the
 * shell's `shellModule`, loaded after this one, overrides it again with its own.
 */
export const ttPaletteModule: ModuleDeclaration = {
  __depends__: [PaletteModule, ttHoverTooltipTeardownModule, CreateModule, LassoToolModule],
  __init__: ["ttPaletteProvider", "ttPaletteToolbar", "paletteTooltip"],
  ttPaletteProvider: ["type", TtPaletteProvider],
  ttPaletteToolbar: ["type", TtPaletteToolbar],
  paletteTooltip: ["type", TtPaletteTooltip],
};

export { default as TtPaletteProvider } from "./TtPaletteProvider.js";
