import type { ModuleDeclaration } from "didi";
import AutoScrollModule from "diagram-js/lib/features/auto-scroll";
import DraggingModule from "diagram-js/lib/features/dragging";
import Gestures from "./Gestures.js";
import PanAwareAutoScroll from "./PanAwareAutoScroll.js";

export const gesturesModule: ModuleDeclaration = {
  __depends__: [DraggingModule],
  __init__: ["gestures"],
  gestures: ["type", Gestures],
};

/** Replaces diagram-js AutoScroll: only the drags that carry something scroll at the edge. */
export const panAwareAutoScrollModule: ModuleDeclaration = {
  __depends__: [AutoScrollModule],
  autoScroll: ["type", PanAwareAutoScroll],
};

export { C4CreateMoveSnapping, C4ResizeSnapping, snappingModule } from "./C4Snapping.js";
export { default as Gestures, type GestureListener } from "./Gestures.js";
export { default as PanAwareAutoScroll } from "./PanAwareAutoScroll.js";
