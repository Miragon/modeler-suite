import type { ModuleDeclaration } from "didi";
import { wardleyInteractionModule } from "../interaction/index.js";
import WardleyLabelDragging from "./WardleyLabelDragging.js";

/** OWM-style draggable labels persisted as `label [dx, dy]` (undoable). */
export const wardleyLabelDragModule: ModuleDeclaration = {
  __depends__: [wardleyInteractionModule],
  __init__: ["wardleyLabelDragging"],
  wardleyLabelDragging: ["type", WardleyLabelDragging],
};

export { default as WardleyLabelDragging, type LabelRole } from "./WardleyLabelDragging.js";
