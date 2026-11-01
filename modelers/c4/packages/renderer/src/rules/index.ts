import type { ModuleDeclaration } from "didi";
import RulesModule from "diagram-js/lib/features/rules";
import C4Rules from "./C4Rules.js";

export const rulesModule: ModuleDeclaration = {
  __depends__: [RulesModule],
  __init__: ["c4Rules"],
  c4Rules: ["type", C4Rules],
};

export { default as C4Rules } from "./C4Rules.js";
