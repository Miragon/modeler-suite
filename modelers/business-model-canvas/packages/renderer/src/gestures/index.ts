import type { ModuleDeclaration } from "didi";
import DraggingModule from "diagram-js/lib/features/dragging";
import Gestures from "./Gestures.js";

export const gesturesModule: ModuleDeclaration = {
  __depends__: [DraggingModule],
  __init__: ["gestures"],
  gestures: ["type", Gestures],
};

export { default as Gestures, type GestureListener } from "./Gestures.js";
