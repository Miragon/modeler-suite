import type { ModuleDeclaration } from "didi";
import LabelEditing from "./LabelEditing.js";

export const labelEditingModule: ModuleDeclaration = {
  __init__: ["labelEditing"],
  labelEditing: ["type", LabelEditing],
};

export { default as LabelEditing, type OpenLabelEdit } from "./LabelEditing.js";
