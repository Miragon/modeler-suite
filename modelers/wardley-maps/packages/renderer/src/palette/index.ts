import type { ModuleDeclaration } from "didi";
import PaletteModule from "diagram-js/lib/features/palette";
import WardleyPaletteProvider from "./WardleyPaletteProvider.js";
import WardleyPaletteKeyboard from "./WardleyPaletteKeyboard.js";
import WardleyPaletteArmedTool from "./WardleyPaletteArmedTool.js";
import WardleyPaletteTooltip from "./WardleyPaletteTooltip.js";
import WardleyPaletteReadOnly from "./WardleyPaletteReadOnly.js";
import { wardleyHoverTooltipTeardownModule } from "./WardleyHoverTooltipTeardown.js";

/**
 * Tool palette (drag-to-create, keyboard-operable toolbar). `paletteTooltip` overrides the
 * diagram-js service of that name; diagram-js's palette module is a dependency, so it loads first
 * even where a host lists it after this one, and cannot put its own tooltip back.
 */
export const wardleyPaletteModule: ModuleDeclaration = {
  __depends__: [PaletteModule, wardleyHoverTooltipTeardownModule],
  __init__: [
    "wardleyPaletteProvider",
    "wardleyPaletteKeyboard",
    "wardleyPaletteArmedTool",
    "wardleyPaletteReadOnly",
    "paletteTooltip",
  ],
  wardleyPaletteProvider: ["type", WardleyPaletteProvider],
  wardleyPaletteKeyboard: ["type", WardleyPaletteKeyboard],
  wardleyPaletteArmedTool: ["type", WardleyPaletteArmedTool],
  wardleyPaletteReadOnly: ["type", WardleyPaletteReadOnly],
  paletteTooltip: ["type", WardleyPaletteTooltip],
};

export { default as WardleyPaletteProvider } from "./WardleyPaletteProvider.js";
export { default as WardleyPaletteKeyboard } from "./WardleyPaletteKeyboard.js";
export { default as WardleyPaletteArmedTool } from "./WardleyPaletteArmedTool.js";
export { default as WardleyPaletteTooltip } from "./WardleyPaletteTooltip.js";
export { default as WardleyPaletteReadOnly } from "./WardleyPaletteReadOnly.js";
