import type { ModuleDeclaration } from "didi";
import AutoScrollModule from "diagram-js/lib/features/auto-scroll";
import DraggingModule from "diagram-js/lib/features/dragging";
import ToolManagerModule from "diagram-js/lib/features/tool-manager";
import PanAwareAutoScroll from "./PanAwareAutoScroll.js";
import VcGestures from "./VcGestures.js";

export const vcGestureModule: ModuleDeclaration = {
  __depends__: [DraggingModule, ToolManagerModule],
  __init__: ["vcGestures"],
  vcGestures: ["type", VcGestures],
};

/** Replaces diagram-js AutoScroll: no scrolling under a pan. */
export const vcPanAwareAutoScrollModule: ModuleDeclaration = {
  __depends__: [AutoScrollModule],
  autoScroll: ["type", PanAwareAutoScroll],
};

export { default as VcGestures, GESTURE_CHANGED_EVENT } from "./VcGestures.js";
