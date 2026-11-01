import type { ElementId } from "@miragon/c4-schema-model";
import type { C4Engine } from "../engine/C4Engine.js";
import { membersOf, workspaceOf } from "./access.js";
import { confirmDestructive, focusCanvas } from "./dialog.js";
import {
  deleteImpactOf,
  deleteQuestion,
  reachesBeyondSelection,
  type DeleteImpact,
} from "./impact.js";
import type { C4DialogModeler, DialogTarget } from "./types.js";

export interface DeleteSelection {
  readonly ids: readonly ElementId[];
  /** Canvas keys of explicit relationships; implied ones have no statement to delete. */
  readonly relationships: readonly string[];
}

export function deleteImpactIn(modeler: C4DialogModeler, selection: DeleteSelection): DeleteImpact {
  const workspace = workspaceOf(modeler);
  const engine = modeler.diagram.get<C4Engine>("c4Engine");
  return deleteImpactOf({
    workspace,
    catalog: engine.catalog(workspace),
    members: (view) => membersOf(modeler, view),
    ids: selection.ids,
    relationships: selection.relationships,
    currentView: modeler.views.active().key,
  });
}

/**
 * Asks before "Delete from model…" when the delete reaches beyond the selection (descendants,
 * other views, dynamic steps, instances; SPEC 5.4), and resolves true at once when it does not.
 * The caller runs `deleteFromModel` on true.
 */
export function confirmDeleteFromModel(target: DialogTarget & DeleteSelection): Promise<boolean> {
  const impact = deleteImpactIn(target.modeler, target);
  if (!reachesBeyondSelection(impact)) return Promise.resolve(true);
  const question = deleteQuestion(
    workspaceOf(target.modeler),
    target.ids,
    target.relationships,
    impact,
  );
  return confirmDestructive(target, { ...question, confirmLabel: "Delete from model" }, () =>
    focusCanvas(target),
  );
}
