import type { ModuleDeclaration } from "didi";
import ReadOnly from "./ReadOnly.js";

export const readOnlyModule: ModuleDeclaration = {
  __init__: ["readOnly"],
  readOnly: ["type", ReadOnly],
};

export { default as ReadOnly, READ_ONLY_CHANGED_EVENT } from "./ReadOnly.js";
