import type { ModuleDeclaration } from "didi";
import DraggingModule from "diagram-js/lib/features/dragging";
import CmGestureCancel from "./CmGestureCancel.js";

/** Ends a running gesture before an import replaces the elements it holds. */
export const cmGestureCancelModule: ModuleDeclaration = {
  __depends__: [DraggingModule],
  __init__: ["cmGestureCancel"],
  cmGestureCancel: ["type", CmGestureCancel],
};

export { default as CmGestureCancel } from "./CmGestureCancel.js";
