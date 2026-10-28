import type { ModuleDeclaration } from "didi";
import DraggingModule from "diagram-js/lib/features/dragging";
import ToolManagerModule from "diagram-js/lib/features/tool-manager";
import VcGestures from "./VcGestures.js";

export const vcGestureModule: ModuleDeclaration = {
  __depends__: [DraggingModule, ToolManagerModule],
  __init__: ["vcGestures"],
  vcGestures: ["type", VcGestures],
};

export { default as VcGestures, GESTURE_CHANGED_EVENT } from "./VcGestures.js";
