import type { ModuleDeclaration } from "didi";
import PaletteModule from "diagram-js/lib/features/palette";
import CreateModule from "diagram-js/lib/features/create";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import SpaceToolModule from "diagram-js/lib/features/space-tool";
import GlobalConnectModule from "diagram-js/lib/features/global-connect";
import VcPaletteProvider from "./VcPaletteProvider.js";
import VcPaletteToolbar from "./VcPaletteToolbar.js";
import VcPaletteTooltip from "./VcPaletteTooltip.js";

/**
 * The palette's entries, and for a host without the modeler shell its toolbar keys and semantics
 * (`vcPaletteToolbar`) and a tooltip below it. `paletteTooltip` overrides the diagram-js service of
 * that name; the shell's `shellModule`, loaded after this one, overrides it again with its own.
 */
export const vcPaletteModule: ModuleDeclaration = {
  __depends__: [
    PaletteModule,
    CreateModule,
    HandToolModule,
    LassoToolModule,
    SpaceToolModule,
    GlobalConnectModule,
  ],
  __init__: ["vcPaletteProvider", "vcPaletteToolbar", "paletteTooltip"],
  vcPaletteProvider: ["type", VcPaletteProvider],
  vcPaletteToolbar: ["type", VcPaletteToolbar],
  paletteTooltip: ["type", VcPaletteTooltip],
};

export { default as VcPaletteProvider, type VcPaletteConfig } from "./VcPaletteProvider.js";
