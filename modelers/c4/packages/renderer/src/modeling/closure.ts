import type { ElementId, ViewMembers } from "@miragon/c4-schema-model";

/**
 * What moving the boundaries `boundaryIds` takes along (SPEC 5.2): the elements they frame and
 * the boundaries nested in them, with what those frame in turn. Boundaries are never parents, so
 * this is the only way a frame carries its content.
 */
export function framedClosure(
  members: ViewMembers,
  boundaryIds: Iterable<ElementId>,
): { readonly elements: ReadonlySet<ElementId>; readonly boundaries: ReadonlySet<ElementId> } {
  const boundaries = new Set<ElementId>();
  const elements = new Set<ElementId>();
  const pending = [...boundaryIds];
  while (pending.length > 0) {
    const id = pending.pop() as ElementId;
    if (boundaries.has(id)) continue;
    boundaries.add(id);
    for (const boundary of members.boundaries) {
      if (boundary.elementId === id) for (const member of boundary.members) elements.add(member);
      else if (boundary.parentId === id) pending.push(boundary.elementId);
    }
  }
  return { elements, boundaries };
}
