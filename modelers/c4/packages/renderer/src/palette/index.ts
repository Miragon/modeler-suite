import type { ModuleDeclaration } from "didi";
import CreateModule from "diagram-js/lib/features/create";
import GlobalConnectModule from "diagram-js/lib/features/global-connect";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import PaletteModule from "diagram-js/lib/features/palette";
import { contextPadModule } from "../context-pad/index.js";
import CreateNameEditor from "./CreateNameEditor.js";
import { hoverTooltipTeardownModule } from "./HoverTooltipTeardown.js";
import PaletteProvider from "./PaletteProvider.js";

/**
 * The palette and, with it, the context pad: the two islands of tools on the canvas, which share
 * the connect gesture.
 */
export const paletteModule: ModuleDeclaration = {
  __depends__: [
    PaletteModule,
    hoverTooltipTeardownModule,
    CreateModule,
    HandToolModule,
    LassoToolModule,
    GlobalConnectModule,
    contextPadModule,
  ],
  __init__: ["paletteProvider", "c4CreateNameEditor"],
  paletteProvider: ["type", PaletteProvider],
  c4CreateNameEditor: ["type", CreateNameEditor],
};

export type { PaletteConfig } from "./PaletteProvider.js";
export { default as CreateNameEditor } from "./CreateNameEditor.js";
