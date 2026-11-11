import type { ModuleDeclaration } from "didi";
import CanvasFrame from "./CanvasFrame.js";

export const canvasFrameModule: ModuleDeclaration = {
  __init__: ["canvasFrame"],
  canvasFrame: ["type", CanvasFrame],
};

export { ATTRIBUTION } from "./CanvasFrame.js";
