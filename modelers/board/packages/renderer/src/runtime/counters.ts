import type { ArmCounters } from "../arming/arming-api.js";

/** what a board counts about itself, for a script that measures it */
export interface BoardCounters {
  nodeChanges: number;
  edgeChanges: number;
  viewportChanges: number;
  /** editor mounts per node id: 1 unless something remounted it */
  mounts: Record<string, number>;
  /** what the arm rules did */
  arm: ArmCounters;
}
