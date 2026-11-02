import type { CreatableKind } from "@miragon/c4-dsl";
import type { ElementId, ViewEntry, ViewMembers, Workspace } from "@miragon/c4-schema-model";

/**
 * The parent a create of `kind` gets in `view`: the view's scope, never the drop position (SPEC
 * 5.1), as the edit layer's `parentInView` picks it. People and software systems sit at model
 * level.
 */
export function createdParentId(
  kind: CreatableKind,
  view: Pick<ViewEntry, "type" | "scopeId">,
  workspace: Pick<Workspace, "elements">,
): ElementId | undefined {
  if (kind === "person" || kind === "softwareSystem") return undefined;
  if (kind === "component" || view.type === "container") return view.scopeId;
  if (view.scopeId === undefined) return undefined;
  return workspace.elements.find((element) => element.id === view.scopeId)?.parentId;
}

/** `members` with the element a create adds under `id`: drawn in the view, framed by its parent. */
export function membersWithCreated(
  members: ViewMembers,
  id: ElementId,
  parentId: ElementId | undefined,
): ViewMembers {
  return {
    ...members,
    elements: [...members.elements, id],
    boundaries: members.boundaries.map((boundary) =>
      boundary.elementId === parentId
        ? { ...boundary, members: [...boundary.members, id] }
        : boundary,
    ),
  };
}

/** The boundaries that will frame the created element: its parent's and every one around it. */
export function framingBoundaries(
  members: ViewMembers,
  parentId: ElementId | undefined,
): Set<ElementId> {
  const framing = new Set<ElementId>();
  const byId = new Map(members.boundaries.map((boundary) => [boundary.elementId, boundary]));
  let current = parentId === undefined ? undefined : byId.get(parentId);
  while (current && !framing.has(current.elementId)) {
    framing.add(current.elementId);
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }
  return framing;
}
