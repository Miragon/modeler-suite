import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type { Injector } from "didi";
import type { Point } from "@miragon/c4-schema-model";
import type SceneLookup from "../draw/SceneLookup.js";
import type { SceneRelationship } from "../scene/types.js";
import { boxOf, endOfShape } from "./C4Layouter.js";
import { centreOf, dockOn, verticesOutside, withoutFanBend } from "./geometry.js";

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
 * `getShapePath`), as the reconciler docks them, and without the vertices inside an end or the
 * bend that fans a line out, as `C4Modeling.updateWaypoints` writes them.
 */
export default class C4ConnectionDocking {
  static $inject = ["graphicsFactory", "injector"];

  constructor(
    private readonly graphicsFactory: GraphicsFactory,
    private readonly injector: Injector,
  ) {}

  getCroppedWaypoints(
    connection: DockedConnection,
    source?: Bounded | null,
    target?: Bounded | null,
  ): Point[] {
    const start = source ?? connection.source;
    const end = target ?? connection.target;
    const waypoints = connection.waypoints;
    const first = waypoints[0];
    const last = waypoints.at(-1);
    if (first === undefined || last === undefined || waypoints.length < 2) return [...waypoints];
    const ends = [start, end].filter((shape): shape is Bounded => !!shape).map(boxOf);
    const vertices = withoutFanBend(
      verticesOutside(waypoints.slice(1, -1), ends),
      this.relationshipOf(connection),
    );
    // Docked as the reconciler's `dockedPath` docks the written relationship: towards the
    // nearest vertex, else the other end's centre.
    const towardEnd = vertices[0] ?? (end ? centreOf(boxOf(end)) : last);
    const towardStart = vertices.at(-1) ?? (start ? centreOf(boxOf(start)) : first);
    return [
      start ? this.dock(start, towardEnd) : first,
      ...vertices,
      end ? this.dock(end, towardStart) : last,
    ];
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

  /** The scene's relationship a bendpoint drag moves; a connect's preview has none. */
  private relationshipOf(connection: DockedConnection): SceneRelationship | undefined {
    return this.injector.get<SceneLookup>("c4SceneLookup", false)?.relationship(connection);
  }

  private dock(shape: Bounded, toward: Point): Point {
    return dockOn(endOfShape(this.graphicsFactory, shape), toward);
  }
}
