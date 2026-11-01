import type { IdChange } from "@miragon/c4-dsl";
import type { ElementId, ViewKey, Workspace } from "@miragon/c4-schema-model";
import type { DeleteDoneEvent, DeletedItems } from "../services.js";

interface MutableItems {
  elements: string[];
  relationships: string[];
}

function renamed(changes: readonly IdChange[], kind: IdChange["kind"], from: string): string {
  let current = from;
  for (const change of changes) {
    if (change.kind === kind && change.from === current) current = change.to;
  }
  return current;
}

function nameOf(workspace: Workspace, id: ElementId): string {
  return workspace.elements.find((element) => element.id === id)?.name || id;
}

/**
 * What the smart delete did with each selected item, read from the model before and after it
 * rather than from its plan, so a relationship that went with a deleted end counts as deleted.
 * An item still in the model after the edit (under its new id, if the edit renamed it) went only
 * from the view.
 */
export function deleteSummary(input: {
  readonly view: ViewKey;
  readonly before: Workspace;
  readonly after: Workspace;
  readonly idChanges: readonly IdChange[];
  readonly ids: readonly ElementId[];
  readonly relationships: readonly string[];
}): DeleteDoneEvent {
  const { before, after, idChanges } = input;
  const fromModel: MutableItems = { elements: [], relationships: [] };
  const fromView: MutableItems = { elements: [], relationships: [] };
  for (const id of input.ids) {
    const element = before.elements.find((candidate) => candidate.id === id);
    if (!element) continue;
    const now = renamed(idChanges, "element", id);
    const kept = after.elements.some((candidate) => candidate.id === now);
    (kept ? fromView : fromModel).elements.push(element.name || id);
  }
  for (const key of input.relationships) {
    const relationship = before.relationships.find((candidate) => candidate.canvasKey === key);
    if (!relationship) continue;
    const now = renamed(idChanges, "relationship", key);
    const kept = after.relationships.some((candidate) => candidate.canvasKey === now);
    const label = `${nameOf(before, relationship.sourceId)} → ${nameOf(before, relationship.destinationId)}`;
    (kept ? fromView : fromModel).relationships.push(label);
  }
  return {
    view: input.view,
    fromModel: fromModel satisfies DeletedItems,
    fromView: fromView satisfies DeletedItems,
  };
}
