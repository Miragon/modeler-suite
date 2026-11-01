import type BendpointMove from "diagram-js/lib/features/bendpoints/BendpointMove";
import type { Connection } from "diagram-js/lib/model/Types";

/**
 * diagram-js's `connectionSegmentMove`, replaced: a press on the middle of a straight segment
 * inserts one bendpoint there, as a press anywhere else on the line does. diagram-js's own segment
 * move keeps the segment axis-parallel and builds a U-shaped detour out of a C4 relationship's
 * straight line. BendpointMove asks the `connection.updateWaypoints` rule itself, so the press
 * starts nothing under the read-only lock or in a view that is not editable.
 */
export default class C4SegmentInsert {
  static $inject = ["bendpointMove"];

  constructor(private readonly bendpointMove: BendpointMove) {}

  start(event: MouseEvent, connection: Connection, segmentIndex: number): unknown {
    return this.bendpointMove.start(event, connection, segmentIndex, true);
  }
}
