import type { ModuleDeclaration } from "didi";
import RulesModule from "diagram-js/lib/features/rules";
import CmReadOnly from "./CmReadOnly.js";

/** The canvas edit lock (an invalid file in an IDE host). */
export const cmReadOnlyModule: ModuleDeclaration = {
  __depends__: [RulesModule],
  __init__: ["cmReadOnly"],
  cmReadOnly: ["type", CmReadOnly],
};

export {
  default as CmReadOnly,
  READ_ONLY_CHANGED_EVENT,
  type CmReadOnlyOptions,
} from "./CmReadOnly.js";
