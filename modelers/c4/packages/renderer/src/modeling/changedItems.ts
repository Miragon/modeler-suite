import type { IdChange } from "@miragon/c4-dsl";
import { relationshipCanvasId } from "../reconcile/Reconciler.js";
import type { Scene, SceneElement, SceneRelationship } from "../scene/types.js";

/**
 * What a change shows differently in one view: the elements and relationships it added, moved,
 * resized, restyled or wrote into, as canvas ids of the scene after it. Side effects drawn on
 * items the change did not touch stay out: a drill badge's count, a label box that moved because
 * its line's end moved.
 */
export function changedItems(
  before: Scene,
  after: Scene,
  idChanges: readonly IdChange[],
): string[] {
  const formerId = new Map(
    idChanges.filter(({ kind }) => kind === "element").map(({ from, to }) => [to, from]),
  );
  const formerKey = new Map(
    idChanges.filter(({ kind }) => kind === "relationship").map(({ from, to }) => [to, from]),
  );
  const elementsBefore = new Map(before.elements.map((element) => [element.id, element]));
  const relationshipsBefore = new Map(
    before.relationships.map((relationship) => [relationship.canvasKey, relationship]),
  );
  const changed: string[] = [];
  for (const element of after.elements) {
    const earlier = elementsBefore.get(formerId.get(element.id) ?? element.id);
    if (!earlier || elementLook(earlier) !== elementLook(element)) changed.push(element.id);
  }
  for (const relationship of after.relationships) {
    const key = relationship.canvasKey;
    const earlier = relationshipsBefore.get(formerKey.get(key) ?? key);
    if (!earlier || relationshipLook(earlier) !== relationshipLook(relationship)) {
      changed.push(relationshipCanvasId(key));
    }
  }
  return changed;
}

function elementLook(element: SceneElement): string {
  return JSON.stringify([
    element.box,
    element.kind,
    element.shape,
    element.name,
    element.typeLine,
    element.description,
    element.technology,
    element.style,
  ]);
}

function relationshipLook(relationship: SceneRelationship): string {
  return JSON.stringify([
    relationship.sourceId,
    relationship.destinationId,
    relationship.description,
    relationship.technology,
    relationship.implied,
    relationship.style,
    relationship.vertices,
  ]);
}
