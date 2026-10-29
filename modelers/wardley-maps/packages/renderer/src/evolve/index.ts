import type { ModuleDeclaration } from "didi";
import { wardleyInteractionModule } from "../interaction/index.js";
import { livePreviewModule } from "../live-preview/index.js";
import WardleyEvolveDragging from "./WardleyEvolveDragging.js";

export const wardleyEvolveModule: ModuleDeclaration = {
  __depends__: [wardleyInteractionModule, livePreviewModule],
  __init__: ["wardleyEvolveDragging"],
  wardleyEvolveDragging: ["type", WardleyEvolveDragging],
};

export { default as WardleyEvolveDragging } from "./WardleyEvolveDragging.js";
export { MIN_EVOLVE_DELTA } from "./constants.js";
