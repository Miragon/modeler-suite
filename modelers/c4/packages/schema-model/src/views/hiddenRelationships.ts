/*
 * Relationships a level down cannot draw (SPEC 4.1): Structurizr implies a relationship upward,
 * never downward, so one written on a software system itself (`bookshop -> crm`) shows in the
 * landscape and the context view, but its container view cannot tell which container makes or
 * takes the call and leaves it out; so does a component view with one on its container.
 */
import type {
  ElementId,
  ModelElement,
  Relationship,
  ViewEntry,
  ViewMembers,
  Workspace,
} from "../types.js";
import { viewMembers } from "./membership.js";
import { modelIndex } from "./modelIndex.js";

/** One end of an explicit relationship that could move to a child of its element. */
export interface RelationshipEnd {
  readonly relationship: Relationship;
  readonly end: "source" | "destination";
  /** The element at that end, whose children it could move to. */
  readonly elementId: ElementId;
  /** The element at the other end. */
  readonly otherId: ElementId;
}

/** The elements whose parent `id` is, in document order. */
export function childElements(workspace: Workspace, id: ElementId): readonly ModelElement[] {
  return modelIndex(workspace).children.get(id) ?? [];
}

function within(workspace: Workspace, id: ElementId, ancestorId: ElementId): boolean {
  return id === ancestorId || modelIndex(workspace).ancestors(id).includes(ancestorId);
}

function endsOf(relationship: Relationship, elementId: ElementId): RelationshipEnd[] {
  const ends: RelationshipEnd[] = [];
  if (relationship.sourceId === elementId) {
    ends.push({ relationship, end: "source", elementId, otherId: relationship.destinationId });
  }
  if (relationship.destinationId === elementId) {
    ends.push({ relationship, end: "destination", elementId, otherId: relationship.sourceId });
  }
  return ends;
}

/**
 * In a container or component view, the explicit relationships written on the view's scope
 * itself whose other end lies outside it, unless the view already draws the same direction
 * between an element inside the scope and that end (or an element inside it), explicit or
 * implied. Empty for every other view.
 */
export function hiddenScopeRelationships(
  workspace: Workspace,
  view: ViewEntry,
  members: ViewMembers = viewMembers(workspace, view),
): RelationshipEnd[] {
  const scopeId = view.scopeId;
  if ((view.type !== "container" && view.type !== "component") || scopeId === undefined) {
    return [];
  }
  const byKey = new Map(
    workspace.relationships.map((relationship) => [relationship.canvasKey, relationship]),
  );
  const drawn = members.relationships.flatMap((key) => byKey.get(key) ?? []);
  const inside = (id: ElementId) => id !== scopeId && within(workspace, id, scopeId);
  const shownInDetail = ({ end, otherId }: RelationshipEnd) =>
    drawn.some((relationship) => {
      const [scopeSide, otherSide] =
        end === "source"
          ? [relationship.sourceId, relationship.destinationId]
          : [relationship.destinationId, relationship.sourceId];
      return inside(scopeSide) && within(workspace, otherSide, otherId);
    });
  return workspace.relationships
    .filter((relationship) => !relationship.implied)
    .flatMap((relationship) => endsOf(relationship, scopeId))
    .filter((candidate) => !within(workspace, candidate.otherId, scopeId))
    .filter((candidate) => !shownInDetail(candidate));
}

/**
 * The ends of an explicit relationship that could move one level down from where `view` draws
 * it: a software system with containers in a landscape or context view, a container with
 * components in a container or component view.
 */
export function endsWithChildren(
  workspace: Workspace,
  relationship: Relationship,
  view: ViewEntry,
): RelationshipEnd[] {
  if (relationship.implied || relationship.bulk) return [];
  const kind =
    view.type === "systemLandscape" || view.type === "systemContext"
      ? "softwareSystem"
      : view.type === "container" || view.type === "component"
        ? "container"
        : undefined;
  if (kind === undefined) return [];
  const index = modelIndex(workspace);
  const ids = [...new Set([relationship.sourceId, relationship.destinationId])];
  return ids
    .filter((id) => index.byId.get(id)?.kind === kind && childElements(workspace, id).length > 0)
    .flatMap((id) => endsOf(relationship, id));
}
