import type { ModuleDeclaration } from "didi";
import { wardleyInteractionModule } from "../interaction/index.js";
import { livePreviewModule } from "../live-preview/index.js";
import WardleyLabelDragging from "./WardleyLabelDragging.js";

/** OWM-style draggable labels persisted as `label [dx, dy]` (undoable). */
export const wardleyLabelDragModule: ModuleDeclaration = {
  __depends__: [wardleyInteractionModule, livePreviewModule],
  __init__: ["wardleyLabelDragging"],
  wardleyLabelDragging: ["type", WardleyLabelDragging],
};

export { default as WardleyLabelDragging, type LabelRole } from "./WardleyLabelDragging.js";
