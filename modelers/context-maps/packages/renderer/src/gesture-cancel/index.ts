import type { ModuleDeclaration } from "didi";
import DraggingModule from "diagram-js/lib/features/dragging";
import CmGestureCancel from "./CmGestureCancel.js";

/**
 * The user's gestures: whether one runs, its end before an import or a clear replaces the elements
 * it holds, and the end of a drop an import waits for.
 */
export const cmGestureCancelModule: ModuleDeclaration = {
  __depends__: [DraggingModule],
  __init__: ["cmGestureCancel"],
  cmGestureCancel: ["type", CmGestureCancel],
};

export { default as CmGestureCancel } from "./CmGestureCancel.js";
