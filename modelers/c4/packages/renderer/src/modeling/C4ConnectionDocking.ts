import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type { Point } from "@miragon/c4-schema-model";
import { boxOf, endOfShape } from "./C4Layouter.js";
import { centreOf, dockOn } from "./geometry.js";

interface Bounded {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DockedConnection {
  waypoints: Point[];
  source?: Bounded | null;
  target?: Bounded | null;
}

/**
 * diagram-js's `connectionDocking` for the previews of a connect and a bendpoint move: the ends
 * cropped at the drawn outline (diagram-js's `CroppingConnectionDocking` on the renderer's
 * `getShapePath`), as the reconciler docks them.
 */
export default class C4ConnectionDocking {
  static $inject = ["graphicsFactory"];

  constructor(private readonly graphicsFactory: GraphicsFactory) {}

  getCroppedWaypoints(
    connection: DockedConnection,
    source?: Bounded | null,
    target?: Bounded | null,
  ): Point[] {
    const start = source ?? connection.source;
    const end = target ?? connection.target;
    const points = [...connection.waypoints];
    if (start && points.length >= 2) {
      points[0] = this.dock(start, points[1] ?? centreOf(boxOf(start)));
    }
    if (end && points.length >= 2) {
      points[points.length - 1] = this.dock(end, points[points.length - 2] ?? centreOf(boxOf(end)));
    }
    return points;
  }

  getDockingPoint(
    connection: DockedConnection,
    shape: Bounded,
    dockStart: boolean,
  ): { point: Point; actual: Point; idx: number } {
    const waypoints = connection.waypoints;
    const index = dockStart ? 0 : waypoints.length - 1;
    const neighbour = waypoints[dockStart ? 1 : waypoints.length - 2] ?? centreOf(boxOf(shape));
    const point = waypoints[index] ?? centreOf(boxOf(shape));
    return { point, actual: this.dock(shape, neighbour), idx: index };
  }

  private dock(shape: Bounded, toward: Point): Point {
    return dockOn(endOfShape(this.graphicsFactory, shape), toward);
  }
}
