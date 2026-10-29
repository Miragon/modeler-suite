import type { ModuleDeclaration } from "didi";
import DirectEditingModule from "diagram-js-direct-editing";
import SelectionModule from "diagram-js/lib/features/selection";
import { cmModelingModule } from "../modeling/index.js";
import { cmReadOnlyModule } from "../read-only/index.js";
import CmLabelEditing from "./CmLabelEditing.js";

/** In-place name editing (double-click / context pad), bpmn.io style. */
export const cmLabelEditingModule: ModuleDeclaration = {
  __depends__: [DirectEditingModule, SelectionModule, cmModelingModule, cmReadOnlyModule],
  __init__: ["cmLabelEditing"],
  cmLabelEditing: ["type", CmLabelEditing],
};

export { default as CmLabelEditing } from "./CmLabelEditing.js";
