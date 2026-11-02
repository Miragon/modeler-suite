import type {
  ElementId,
  ElementKind,
  ViewCatalog,
  ViewEntry,
  ViewKey,
  ViewMembers,
  ViewType,
  Workspace,
} from "@miragon/c4-schema-model";

/** What "Delete from model…" takes along beyond the selection (SPEC 5.4). */
export interface DeleteImpact {
  /** Nested elements that go with the selection, per kind. */
  readonly descendants: Readonly<Partial<Record<ElementKind, number>>>;
  /** Written views other than the current one that show or scope what goes. */
  readonly views: readonly ViewKey[];
  /** Dynamic views with a step that names what goes. */
  readonly dynamicViews: number;
  readonly instances: number;
}

export interface DeleteImpactInput {
  readonly workspace: Workspace;
  readonly catalog: ViewCatalog;
  members(view: ViewEntry): ViewMembers;
  readonly ids: readonly ElementId[];
  /** Canvas keys of explicit relationships. */
  readonly relationships: readonly string[];
  readonly currentView: ViewKey;
}

/** The views whose membership the modeler computes; dynamic views count by their steps. */
const STATIC_TYPES: ReadonlySet<ViewType> = new Set<ViewType>([
  "systemLandscape",
  "systemContext",
  "container",
  "component",
]);

/** The selection and every element nested in it. */
function withDescendants(workspace: Workspace, ids: readonly ElementId[]): Set<ElementId> {
  const all = new Set(ids);
  for (const element of workspace.elements) {
    if (element.parentId !== undefined && all.has(element.parentId)) all.add(element.id);
  }
  return all;
}

/** Computed from the semantic model, through the engine's catalog and membership. */
export function deleteImpactOf(input: DeleteImpactInput): DeleteImpact {
  const { workspace, ids, relationships } = input;
  const doomed = withDescendants(workspace, ids);
  const doomedRelationships = new Set([
    ...relationships,
    ...workspace.relationships
      .filter(
        (relationship) =>
          doomed.has(relationship.sourceId) || doomed.has(relationship.destinationId),
      )
      .map((relationship) => relationship.canvasKey),
  ]);
  const descendants: Partial<Record<ElementKind, number>> = {};
  for (const element of workspace.elements) {
    if (!doomed.has(element.id) || ids.includes(element.id)) continue;
    descendants[element.kind] = (descendants[element.kind] ?? 0) + 1;
  }
  const views = input.catalog
    .list()
    .filter((entry) => entry.state === "written" && entry.key !== input.currentView)
    .filter((entry) => STATIC_TYPES.has(entry.type))
    .filter((entry) => {
      if (entry.scopeId !== undefined && doomed.has(entry.scopeId)) return true;
      if (!entry.editable) return false;
      const members = input.members(entry);
      return (
        members.elements.some((id) => doomed.has(id)) ||
        members.relationships.some((key) => relationships.includes(key))
      );
    })
    .map((entry) => entry.key);
  let dynamicViews = 0;
  for (const [key, references] of workspace.dynamicReferences) {
    const scope = workspace.views.find((view) => view.key === key)?.scopeId;
    const named =
      (scope !== undefined && doomed.has(scope)) ||
      references.elements.some((id) => doomed.has(id)) ||
      references.relationships.some((relationship) => doomedRelationships.has(relationship));
    if (named) dynamicViews += 1;
  }
  let instances = 0;
  for (const id of doomed) instances += workspace.instances.get(id)?.length ?? 0;
  return { descendants, views, dynamicViews, instances };
}

/** Whether the delete reaches beyond the selection, so the user confirms it first. */
export function reachesBeyondSelection(impact: DeleteImpact): boolean {
  return (
    Object.values(impact.descendants).some((count) => count > 0) ||
    impact.views.length > 0 ||
    impact.dynamicViews > 0 ||
    impact.instances > 0
  );
}

const CHILD_WORDS: Readonly<Record<ElementKind, readonly [string, string]>> = {
  person: ["person", "people"],
  softwareSystem: ["software system", "software systems"],
  container: ["container", "containers"],
  component: ["component", "components"],
  custom: ["element", "elements"],
};

function counted(count: number, [one, many]: readonly [string, string]): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export interface DeleteQuestion {
  readonly title: string;
  readonly message: string;
}

/**
 * The confirmation's wording (guide §9 "Destruktiv"): "Delete Internet Banking System?" and what
 * goes with it, "It has 5 containers and appears in 3 other views."
 */
export function deleteQuestion(
  workspace: Workspace,
  ids: readonly ElementId[],
  relationships: readonly string[],
  impact: DeleteImpact,
): DeleteQuestion {
  const total = ids.length + relationships.length;
  const single = total === 1;
  const name =
    ids.length === 1 && relationships.length === 0
      ? workspace.elements.find((element) => element.id === ids[0])?.name
      : undefined;
  const title = single
    ? `Delete ${name ?? "this relationship"}?`
    : `Delete ${total} ${ids.length === 0 ? "relationships" : "items"}?`;
  const nested = (Object.entries(impact.descendants) as [ElementKind, number][])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => counted(count, CHILD_WORDS[kind]));
  const parts: string[] = [];
  if (nested.length > 0) parts.push(`${single ? "has" : "have"} ${listed(nested)}`);
  if (impact.views.length > 0) {
    parts.push(
      `${single ? "appears" : "appear"} in ${counted(impact.views.length, ["other view", "other views"])}`,
    );
  }
  if (impact.dynamicViews > 0) {
    parts.push(
      `${single ? "is" : "are"} a step in ${counted(impact.dynamicViews, ["dynamic view", "dynamic views"])}`,
    );
  }
  if (impact.instances > 0) {
    parts.push(
      `${single ? "has" : "have"} ${counted(impact.instances, ["deployment instance", "deployment instances"])}`,
    );
  }
  const subject = single ? "It" : "They";
  const message =
    parts.length > 0
      ? `${subject} ${listed(parts)}. Everything goes from the model and from every view.`
      : "It goes from the model and from every view.";
  return { title, message };
}
