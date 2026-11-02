/*
 * Delete and Backspace (SPEC 5.4): an element or explicit relationship that no other written view
 * shows (and nothing else depends on) goes from the model; anything else, and every implied
 * relationship, only leaves the current view. Pure, DOM-free, unit-tested.
 */
import {
  viewCatalog,
  viewMembers,
  type ElementId,
  type Relationship,
  type ViewEntry,
  type ViewKey,
  type ViewMembers,
  type Workspace,
} from "@miragon/c4-schema-model";
import { semanticSources, type DynamicStep } from "../semantic/index.js";
import type { DeleteImpact, ParseResult, SmartDeletePlan } from "../types.js";

const STATIC_TYPES: ReadonlySet<string> = new Set([
  "systemLandscape",
  "systemContext",
  "container",
  "component",
]);

function descendantsOf(workspace: Workspace, ids: Iterable<ElementId>): Set<ElementId> {
  const closure = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of workspace.elements) {
      if (
        element.parentId !== undefined &&
        closure.has(element.parentId) &&
        !closure.has(element.id)
      ) {
        closure.add(element.id);
        grew = true;
      }
    }
  }
  return closure;
}

/** The written static views other than `view`, with their members. */
function otherViews(
  workspace: Workspace,
  view: ViewKey,
): { readonly entry: ViewEntry; readonly members: ViewMembers }[] {
  return viewCatalog(workspace)
    .list()
    .filter(
      (entry) => entry.state === "written" && entry.key !== view && STATIC_TYPES.has(entry.type),
    )
    .map((entry) => ({ entry, members: viewMembers(workspace, entry) }));
}

/**
 * Whether a dynamic step uses an explicit relationship: names it, or shows it or a relationship
 * it implies. A step whose relationship the builder couldn't resolve (an open world) counts when
 * it names both ends.
 */
function stepUses(workspace: Workspace, step: DynamicStep, relationship: Relationship): boolean {
  if (step.relationship === undefined) {
    return (
      step.elements.includes(relationship.sourceId) &&
      step.elements.includes(relationship.destinationId)
    );
  }
  if (step.relationship === relationship.canvasKey) return true;
  const shown = workspace.relationships.find(
    (candidate) => candidate.canvasKey === step.relationship,
  );
  return (
    shown?.implied === true &&
    relationship.key !== undefined &&
    shown.impliedBy === relationship.key
  );
}

/** Which of the selected items Delete removes from the model and which only from the view (SPEC 5.4). */
export function planSmartDelete(
  document: ParseResult,
  view: ViewKey,
  ids: readonly ElementId[],
  relationships: readonly string[],
): SmartDeletePlan {
  const workspace = document.workspace;
  const others = otherViews(workspace, view);
  const dynamic = [...workspace.dynamicReferences.values()];
  const steps = semanticSources(document.sources)?.dynamicSteps();
  const plan: SmartDeletePlan = {
    fromModel: { ids: [], relationships: [] },
    fromView: { ids: [], relationships: [] },
  };
  for (const id of ids) {
    if (!workspace.elements.some((element) => element.id === id)) continue;
    const closure = descendantsOf(workspace, [id]);
    const shownElsewhere = others.some(({ members }) =>
      members.elements.some((member) => closure.has(member)),
    );
    const inDynamic = dynamic.some((references) =>
      references.elements.some((member) => closure.has(member)),
    );
    const deployed = [...closure].some(
      (member) => (workspace.instances.get(member)?.length ?? 0) > 0,
    );
    const scopes = workspace.views.some(
      (definition) => definition.scopeId !== undefined && closure.has(definition.scopeId),
    );
    if (shownElsewhere || inDynamic || deployed || scopes) plan.fromView.ids.push(id);
    else plan.fromModel.ids.push(id);
  }
  for (const key of relationships) {
    const relationship = workspace.relationships.find((candidate) => candidate.canvasKey === key);
    if (relationship === undefined) continue;
    if (relationship.implied) {
      plan.fromView.relationships.push(key);
      continue;
    }
    const shownElsewhere = others.some(({ members }) => members.relationships.includes(key));
    const inDynamic =
      steps === undefined
        ? dynamic.some(
            (references) =>
              (relationship.key !== undefined &&
                references.relationships.includes(relationship.key)) ||
              (references.elements.includes(relationship.sourceId) &&
                references.elements.includes(relationship.destinationId)),
          )
        : steps.some((step) => stepUses(workspace, step, relationship));
    if (shownElsewhere || inDynamic) plan.fromView.relationships.push(key);
    else plan.fromModel.relationships.push(key);
  }
  return plan;
}

/** What "Delete from model…" names in its confirmation (SPEC 5.4). */
export function deleteImpact(
  document: ParseResult,
  ids: readonly ElementId[],
  relationships: readonly string[],
): DeleteImpact {
  const workspace = document.workspace;
  const selected = ids.filter((id) => workspace.elements.some((element) => element.id === id));
  const closure = descendantsOf(workspace, selected);
  const keys = new Set(relationships);
  for (const relationship of workspace.relationships) {
    if (closure.has(relationship.sourceId) || closure.has(relationship.destinationId))
      keys.add(relationship.canvasKey);
  }
  const views: ViewKey[] = [];
  for (const { entry, members } of otherViews(workspace, "")) {
    const scoped = entry.scopeId !== undefined && closure.has(entry.scopeId);
    const shows =
      members.elements.some((member) => closure.has(member)) ||
      members.relationships.some((key) => relationships.includes(key));
    if (scoped || shows) views.push(entry.key);
  }
  for (const definition of workspace.views) {
    if (
      !STATIC_TYPES.has(definition.type) &&
      definition.scopeId !== undefined &&
      closure.has(definition.scopeId) &&
      !views.includes(definition.key)
    ) {
      views.push(definition.key);
    }
  }
  const removed = workspace.relationships.filter((relationship) =>
    keys.has(relationship.canvasKey),
  );
  const steps = semanticSources(document.sources)?.dynamicSteps() ?? [];
  const dynamicSteps = steps.filter(
    (step) =>
      step.elements.some((member) => closure.has(member)) ||
      removed.some((relationship) => stepUses(workspace, step, relationship)),
  ).length;
  let instances = 0;
  for (const member of closure) instances += workspace.instances.get(member)?.length ?? 0;
  return { descendants: closure.size - selected.length, views, dynamicSteps, instances };
}
