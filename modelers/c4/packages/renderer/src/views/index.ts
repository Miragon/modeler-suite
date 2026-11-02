import type { ModuleDeclaration } from "didi";
import ViewService from "./ViewService.js";

export const viewsModule: ModuleDeclaration = {
  __init__: ["c4Views"],
  c4Views: ["type", ViewService],
};

export { default as ViewService } from "./ViewService.js";
