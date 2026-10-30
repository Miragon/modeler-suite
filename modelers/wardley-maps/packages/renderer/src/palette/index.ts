import type { ModuleDeclaration } from "didi";
import WardleyPaletteProvider from "./WardleyPaletteProvider.js";
import WardleyPaletteKeyboard from "./WardleyPaletteKeyboard.js";
import { wardleyHoverTooltipTeardownModule } from "./WardleyHoverTooltipTeardown.js";

/** Tool palette (drag-to-create, keyboard-operable toolbar). */
export const wardleyPaletteModule: ModuleDeclaration = {
  __depends__: [wardleyHoverTooltipTeardownModule],
  __init__: ["wardleyPaletteProvider", "wardleyPaletteKeyboard"],
  wardleyPaletteProvider: ["type", WardleyPaletteProvider],
  wardleyPaletteKeyboard: ["type", WardleyPaletteKeyboard],
};

export { default as WardleyPaletteProvider } from "./WardleyPaletteProvider.js";
export { default as WardleyPaletteKeyboard } from "./WardleyPaletteKeyboard.js";
