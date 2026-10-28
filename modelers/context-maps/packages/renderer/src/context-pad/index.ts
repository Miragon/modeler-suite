import type { ModuleDeclaration } from "didi";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import PopupMenuModule from "diagram-js/lib/features/popup-menu";
import ConnectModule from "diagram-js/lib/features/connect";
import CreateModule from "diagram-js/lib/features/create";
import AutoPlaceModule from "diagram-js/lib/features/auto-place";
import SelectionModule from "diagram-js/lib/features/selection";
import ModelingModule from "diagram-js/lib/features/modeling";
import { cmModelingModule } from "../modeling/index.js";
import { cmRulesModule } from "../rules/index.js";
import { cmLabelEditingModule } from "../label-editing/index.js";
import { cmReadOnlyModule } from "../read-only/index.js";
import { cmGestureCancelModule } from "../gesture-cancel/index.js";
import CmContextPadProvider from "./CmContextPadProvider.js";

export const cmContextPadModule: ModuleDeclaration = {
  __depends__: [
    ContextPadModule,
    PopupMenuModule,
    ConnectModule,
    CreateModule,
    AutoPlaceModule,
    SelectionModule,
    ModelingModule,
    cmModelingModule,
    // The connect action needs CmRules: only its connection.create rule stamps
    // the new connection as a relationship (cmKind + default pattern).
    cmRulesModule,
    cmLabelEditingModule,
    cmReadOnlyModule,
    cmGestureCancelModule,
  ],
  __init__: ["cmContextPadProvider"],
  cmContextPadProvider: ["type", CmContextPadProvider],
};

export { default as CmContextPadProvider } from "./CmContextPadProvider.js";
