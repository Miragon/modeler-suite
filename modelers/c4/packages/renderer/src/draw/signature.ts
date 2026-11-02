import type { SceneBoundary, SceneElement, SceneRelationship } from "../scene/types.js";

type Drawable = SceneElement | SceneBoundary | SceneRelationship;

function isRelationship(item: Drawable): item is SceneRelationship {
  return "canvasKey" in item;
}

function isElement(item: Drawable): item is SceneElement {
  return "kind" in item && "shape" in item;
}

/**
 * Everything the drawing of `item` depends on besides its position (SPEC 1.5 step 4): the
 * reconciler redraws a kept shape when its geometry or this string changed. A relationship's label
 * box is part of it, since the label is drawn in diagram coordinates; its waypoints are geometry.
 */
export function drawSignature(item: Drawable): string {
  if (isRelationship(item)) {
    return JSON.stringify([
      "relationship",
      item.key,
      item.sourceId,
      item.destinationId,
      item.description,
      item.technology,
      item.implied,
      item.labelBox,
      item.style,
    ]);
  }
  if (isElement(item)) {
    return JSON.stringify([
      "element",
      item.kind,
      item.shape,
      item.box.width,
      item.box.height,
      item.name,
      item.typeLine,
      item.description,
      item.technology,
      item.style,
      item.drill ?? null,
    ]);
  }
  return JSON.stringify([
    "boundary",
    item.box.width,
    item.box.height,
    item.name,
    item.typeLine,
    item.depth,
    item.style,
  ]);
}
