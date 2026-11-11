import type { ModuleDeclaration } from "didi";
import CanvasModeling from "./CanvasModeling.js";
import StickyBehavior from "./StickyBehavior.js";

export const canvasModelingModule: ModuleDeclaration = {
  __init__: ["canvasModeling", "stickyBehavior"],
  canvasModeling: ["type", CanvasModeling],
  stickyBehavior: ["type", StickyBehavior],
};

export { default as CanvasModeling } from "./CanvasModeling.js";
