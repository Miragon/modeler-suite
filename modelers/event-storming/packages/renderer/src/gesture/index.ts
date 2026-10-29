import type { ModuleDeclaration } from "didi";
import DraggingModule from "diagram-js/lib/features/dragging";
import EventStormingGestures from "./EventStormingGestures.js";

/** The gesture the user holds and the drop that applies it, for imports and the contract. */
export const eventStormingGestureModule: ModuleDeclaration = {
  __depends__: [DraggingModule],
  __init__: ["eventStormingGestures"],
  eventStormingGestures: ["type", EventStormingGestures],
};

export {
  default as EventStormingGestures,
  ARMED_TOOL_PREFIXES,
  type DragContext,
  type GestureListener,
} from "./EventStormingGestures.js";
