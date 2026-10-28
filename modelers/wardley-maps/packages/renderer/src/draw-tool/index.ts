import type { ModuleDeclaration } from "didi";
import { wardleyInteractionModule } from "../interaction/index.js";
import WardleyDrawTool from "./WardleyDrawTool.js";
import WardleyDrawingHandles from "./WardleyDrawingHandles.js";
import WardleyDrawingHitProvider from "./WardleyDrawingHitProvider.js";

export const wardleyDrawToolModule: ModuleDeclaration = {
  __depends__: [wardleyInteractionModule],
  __init__: ["wardleyDrawTool", "wardleyDrawingHandles", "wardleyDrawingHitProvider"],
  wardleyDrawTool: ["type", WardleyDrawTool],
  wardleyDrawingHandles: ["type", WardleyDrawingHandles],
  wardleyDrawingHitProvider: ["type", WardleyDrawingHitProvider],
};

export { default as WardleyDrawTool } from "./WardleyDrawTool.js";
export { default as WardleyDrawingHandles } from "./WardleyDrawingHandles.js";
export { default as WardleyDrawingHitProvider } from "./WardleyDrawingHitProvider.js";
