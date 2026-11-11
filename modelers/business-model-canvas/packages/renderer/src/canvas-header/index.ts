import type { ModuleDeclaration } from "didi";
import HeaderEditing from "./HeaderEditing.js";

export const headerEditingModule: ModuleDeclaration = {
  __init__: ["headerEditing"],
  headerEditing: ["type", HeaderEditing],
};
