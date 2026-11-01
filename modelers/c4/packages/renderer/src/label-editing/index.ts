import type { ModuleDeclaration } from "didi";
import ConnectLabelEditor from "./ConnectLabelEditor.js";
import LabelEditing from "./LabelEditing.js";

export const labelEditingModule: ModuleDeclaration = {
  __init__: ["labelEditing", "c4ConnectLabelEditor"],
  labelEditing: ["type", LabelEditing],
  c4ConnectLabelEditor: ["type", ConnectLabelEditor],
};

export { default as ConnectLabelEditor } from "./ConnectLabelEditor.js";
export {
  default as LabelEditing,
  type LabelField,
  type LabelTarget,
  type OpenLabelEdit,
} from "./LabelEditing.js";
export { editAtField, type FieldEdit } from "./fieldRefusal.js";
