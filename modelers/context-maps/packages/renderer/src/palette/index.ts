import type { ModuleDeclaration } from "didi";
import PaletteModule from "diagram-js/lib/features/palette";
import CreateModule from "diagram-js/lib/features/create";
import ConnectModule from "diagram-js/lib/features/connect";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import ModelingModule from "diagram-js/lib/features/modeling";
import SelectionModule from "diagram-js/lib/features/selection";
import { cmLabelEditingModule } from "../label-editing/index.js";
import { cmReadOnlyModule } from "../read-only/index.js";
import CmPaletteProvider from "./CmPaletteProvider.js";
import { cmPaletteHoverTooltipTeardownModule } from "./CmPaletteHoverTooltipTeardown.js";

/** Tool palette: lasso tool + create contexts (drag, click or Enter/Space). */
export const cmPaletteModule: ModuleDeclaration = {
  __depends__: [
    PaletteModule,
    cmPaletteHoverTooltipTeardownModule,
    CreateModule,
    ConnectModule,
    LassoToolModule,
    ModelingModule,
    SelectionModule,
    cmLabelEditingModule,
    cmReadOnlyModule,
  ],
  __init__: ["cmPaletteProvider"],
  cmPaletteProvider: ["type", CmPaletteProvider],
};

export { default as CmPaletteProvider } from "./CmPaletteProvider.js";
export type { CmPaletteConfig } from "./CmPaletteProvider.js";
