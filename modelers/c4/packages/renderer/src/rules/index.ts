import type { ModuleDeclaration } from "didi";
import RulesModule from "diagram-js/lib/features/rules";
import C4BendpointEnds from "./C4BendpointEnds.js";
import C4Connect from "./C4Connect.js";
import C4Rules from "./C4Rules.js";
import C4SegmentInsert from "./C4SegmentInsert.js";

/**
 * The rules and how the gestures they answer behave. `connectionSegmentMove` replaces
 * diagram-js's: the Modeler loads this module after BendpointsModule, and a later module's
 * service wins.
 */
export const rulesModule: ModuleDeclaration = {
  __depends__: [RulesModule],
  __init__: ["c4Rules", "c4Connect", "c4BendpointEnds"],
  c4Rules: ["type", C4Rules],
  c4Connect: ["type", C4Connect],
  c4BendpointEnds: ["type", C4BendpointEnds],
  connectionSegmentMove: ["type", C4SegmentInsert],
};

export { default as C4Rules } from "./C4Rules.js";
