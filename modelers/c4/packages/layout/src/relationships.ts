import type { Box, ElementId, Point } from "@miragon/c4-schema-model";
import { LABEL_SIZE } from "./autoLayout.js";
import { centre, dockOnBox, pointAlong, right, roundHalfAwayFromZero } from "./geometry.js";

export interface DrawnRelationship {
  readonly key: string;
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
}

export interface RelationshipGeometry {
  readonly vertices: Map<string, readonly Point[]>;
  readonly labelBoxes: Map<string, Box>;
}

/**
 * The user's vertices in every mode, so pinning an auto-laid-out view changes no line; dagre's bend
 * points are never used (SPEC 4.3). The label box sits halfway along the line between the docked
 * ends, where the renderer draws a label at its default position.
 */
export function relationshipGeometry(
  relationships: readonly DrawnRelationship[],
  boxes: ReadonlyMap<string, Box>,
  stored: ReadonlyMap<string, readonly Point[]>,
): RelationshipGeometry {
  const vertices = new Map<string, readonly Point[]>();
  const labelBoxes = new Map<string, Box>();
  for (const relationship of relationships) {
    if (vertices.has(relationship.key)) continue;
    const source = boxes.get(relationship.sourceId);
    const destination = boxes.get(relationship.destinationId);
    if (!source || !destination) continue;
    const own = stored.get(relationship.key) ?? [];
    vertices.set(relationship.key, own);
    labelBoxes.set(
      relationship.key,
      labelBoxAt(labelAnchor(source, destination, own, relationship)),
    );
  }
  return { vertices, labelBoxes };
}

function labelAnchor(
  source: Box,
  destination: Box,
  vertices: readonly Point[],
  relationship: DrawnRelationship,
): Point {
  if (relationship.sourceId === relationship.destinationId && vertices.length === 0) {
    return { x: right(source) + LABEL_SIZE.width / 2, y: centre(source).y };
  }
  const first = vertices[0] ?? centre(destination);
  const last = vertices[vertices.length - 1] ?? centre(source);
  return pointAlong([dockOnBox(source, first), ...vertices, dockOnBox(destination, last)], 0.5);
}

function labelBoxAt(anchor: Point): Box {
  return {
    x: roundHalfAwayFromZero(anchor.x - LABEL_SIZE.width / 2),
    y: roundHalfAwayFromZero(anchor.y - LABEL_SIZE.height / 2),
    width: LABEL_SIZE.width,
    height: LABEL_SIZE.height,
  };
}
