import type { ModuleDeclaration } from "didi";
import RulesModule from "diagram-js/lib/features/rules";
import DiagramRules from "./DiagramRules.js";

export const rulesModule: ModuleDeclaration = {
  __depends__: [RulesModule],
  __init__: ["diagramRules"],
  diagramRules: ["type", DiagramRules],
};
