import type { ModuleDeclaration } from "didi";
import WardleyInteraction from "./WardleyInteraction.js";

/** Whether the user holds a gesture on the canvas, and when the user's action has finished. */
export const wardleyInteractionModule: ModuleDeclaration = {
  __init__: ["wardleyInteraction"],
  wardleyInteraction: ["type", WardleyInteraction],
};

export {
  default as WardleyInteraction,
  ARMED_TOOL_PREFIXES,
  DROP_MARK_PRIORITY,
  INTERACTION_CHANGED,
  type InteractionChangedEvent,
} from "./WardleyInteraction.js";
