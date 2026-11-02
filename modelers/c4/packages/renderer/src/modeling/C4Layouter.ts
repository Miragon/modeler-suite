import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type { ShapeLike } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { Box, Point } from "@miragon/c4-schema-model";
import { dockedPath, dockOn, type DockTarget } from "./geometry.js";

interface Bounded {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LaidOutConnection {
  source?: Bounded | null;
  target?: Bounded | null;
  waypoints?: Point[] | null;
}

interface LayoutHints {
  source?: Bounded | null;
  target?: Bounded | null;
  connectionStart?: Point;
  connectionEnd?: Point;
  waypoints?: Point[] | null;
}

/**
 * diagram-js's `layouter` and the reconciler's `c4Layouter`: straight segments through the
 * relationship's vertices, docked on the drawn outlines (SPEC 1.3, 5.7). The scene owns every
 * stored vertex, so laying a connection out never invents a bend.
 */
export default class C4Layouter {
  static $inject = ["injector"];

  constructor(private readonly injector: Injector) {}

  layoutConnection(connection: LaidOutConnection, hints: LayoutHints = {}): Point[] {
    const source = hints.source ?? connection.source;
    const target = hints.target ?? connection.target;
    const vertices = (hints.waypoints ?? connection.waypoints ?? []).slice(1, -1);
    if (source && target) {
      return dockedPath(this.endOf(source), this.endOf(target), vertices);
    }
    const start = source ? undefined : hints.connectionStart;
    const end = target ? undefined : hints.connectionEnd;
    const points = [start, ...vertices, end].filter((point): point is Point => point !== undefined);
    const first = points[0];
    const last = points.at(-1);
    if (source && first) return [dockOn(this.endOf(source), first), ...points];
    if (target && last) return [...points, dockOn(this.endOf(target), last)];
    return points;
  }

  /** The waypoints the canvas draws for a relationship of the scene. */
  waypoints(source: DockTarget, target: DockTarget, vertices: readonly Point[]): Point[] {
    return dockedPath(source, target, vertices);
  }

  /** A shape of the canvas as an end to dock on: its box and the outline the renderer draws. */
  endOf(shape: Bounded): DockTarget {
    return endOfShape(this.injector.get<GraphicsFactory>("graphicsFactory", false), shape);
  }
}

export function endOfShape(
  graphicsFactory: GraphicsFactory | null | undefined,
  shape: Bounded,
): DockTarget {
  let outline: string | undefined;
  try {
    outline = graphicsFactory?.getShapePath(shape as ShapeLike) ?? undefined;
  } catch {
    // A shape no renderer draws yet (diagram-js's own connect hover) docks on its box.
    outline = undefined;
  }
  return { box: boxOf(shape), outline };
}

export function boxOf({ x, y, width, height }: Bounded): Box {
  return { x, y, width, height };
}
