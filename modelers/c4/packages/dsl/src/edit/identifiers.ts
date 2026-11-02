/*
 * Identifiers the edit layer writes (SPEC 3.3): the implicit identifier of an anonymous element
 * the first time a statement needs it (in hierarchical mode its anonymous ancestors' too, which
 * Structurizr would otherwise key under a UUID), and the register new identifiers are derived
 * against.
 */
import {
  deriveIdentifier,
  type ElementId,
  type ElementKind,
  type IdentifierRegister,
} from "@miragon/c4-schema-model";
import { walkCst } from "../syntax/index.js";
import type { TextEdit } from "../types.js";
import type { Draft } from "./draft.js";

/** Every identifier the text holds, lower case: elements (implicit ones too), groups, relationships, deployment items, archetypes. */
export function identifierRegister(draft: Draft): IdentifierRegister {
  const taken = new Set<string>();
  const archetypes = new Set<string>();
  const { workspace, sources } = draft;
  for (const element of workspace.elements) taken.add(element.id.toLowerCase());
  for (const relationship of workspace.relationships) {
    if (relationship.identifier !== undefined) taken.add(relationship.identifier.toLowerCase());
  }
  for (const group of workspace.groups) {
    if (group.identifier !== undefined) taken.add(group.identifier.toLowerCase());
  }
  for (const instances of workspace.instances.values()) {
    for (const instance of instances) taken.add(instance.toLowerCase());
  }
  walkCst(draft.parse.cst.nodes, (node) => {
    if (node.kind !== "statement" || node.assignee === undefined) return;
    const value = node.assignee.value.toLowerCase();
    taken.add(value);
    if (sources.roleOf(node) === "archetype") archetypes.add(value);
  });
  return { taken, archetypes };
}

/** A new identifier for `name` and the element id it gives, in the identifier mode at `offset`. */
export function newIdentifier(
  draft: Draft,
  name: string,
  kind: ElementKind,
  offset: number,
  parentId: ElementId | undefined,
): { readonly local: string; readonly id: ElementId } {
  const mode = draft.sources.identifierModeAt(offset);
  const local = deriveIdentifier(name, kind, identifierRegister(draft), mode, parentId);
  if (draft.workspace.openWorld) draft.notices.add("identifier-may-collide");
  return { local, id: elementIdOf(local, mode, parentId) };
}

export function elementIdOf(
  local: string,
  mode: "flat" | "hierarchical",
  parentId: ElementId | undefined,
): ElementId {
  return mode === "hierarchical" && parentId !== undefined ? `${parentId}.${local}` : local;
}

/** Whether a lower-case identifier is free in the register. */
export function isFree(draft: Draft, identifier: string): boolean {
  return !identifierRegister(draft).taken.has(identifier.toLowerCase());
}

/** The anonymous elements among `ids`, with their anonymous ancestors in hierarchical mode. */
function anonymousOf(draft: Draft, ids: Iterable<ElementId>): Set<ElementId> {
  const result = new Set<ElementId>();
  const visit = (id: ElementId | undefined) => {
    if (id === undefined || result.has(id)) return;
    const site = draft.sources.elementSite(id);
    if (site === undefined) return;
    if (site.anonymous) result.add(id);
    if (site.mode === "hierarchical") visit(draft.element(id)?.parentId);
  };
  for (const id of ids) visit(id);
  return result;
}

/** The text edits that write the implicit identifiers of the anonymous elements among `ids`. */
export function identifierEdits(draft: Draft, ids: Iterable<ElementId>): TextEdit[] {
  const edits: TextEdit[] = [];
  for (const id of anonymousOf(draft, ids)) {
    const site = draft.sources.elementSite(id);
    const element = draft.element(id);
    const keyword = site?.definition.tokens[0];
    if (site === undefined || element === undefined || keyword === undefined) continue;
    const parentId = element.parentId;
    const local =
      site.mode === "hierarchical" && parentId !== undefined && id.startsWith(`${parentId}.`)
        ? id.slice(parentId.length + 1)
        : id;
    edits.push({ start: keyword.range.start, end: keyword.range.start, insert: `${local} = ` });
  }
  return edits;
}

/** Writes the implicit identifiers of the anonymous elements among `ids` (SPEC 3.3). */
export function ensureIdentifiers(draft: Draft, ids: Iterable<ElementId>): void {
  draft.apply(identifierEdits(draft, ids));
}
