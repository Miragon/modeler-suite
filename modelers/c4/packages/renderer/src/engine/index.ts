import type { ModuleDeclaration } from "didi";
import { createC4Engine } from "./C4Engine.js";

export const engineModule: ModuleDeclaration = {
  c4Engine: ["value", createC4Engine()],
};

export { createC4Engine, type C4Engine } from "./C4Engine.js";
