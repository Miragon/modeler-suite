/*
 * The modeler doesn't evaluate `!elements` and `!relationships` (SPEC 3.7), but Structurizr
 * evaluates each at its line and refuses one that selects nothing. So a delete that may take the
 * last item such an expression selects is refused rather than guessed (SPEC 3.4): the expression
 * is judged per item as surely selected, surely not or maybe, from what no bulk statement can
 * change (kind, parent, identifiers, groups, ends, and tags while nothing but the text sets them),
 * and the delete goes ahead only when it removes nothing the expression may select, or an item
 * that stays is surely selected.
 */
import {
  parseExpression,
  type ElementId,
  type Expression,
  type ModelElement,
  type Relationship,
} from "@miragon/c4-schema-model";
import type { Statement, TextRange } from "../types.js";
import type { Draft } from "./draft.js";
import { lineOf } from "./elements.js";

type Verdict = "yes" | "no" | "maybe";

/** What an identifier in an expression may name, resolved once per edit. */
interface Names {
  element(id: ElementId): ModelElement | undefined;
  /** The elements whose key is the identifier or ends in it; undefined when it may name something else. */
  elementsNamed(identifier: string): ReadonlySet<ModelElement> | undefined;
  /** The members of the one group the identifier names, its nested groups' included. */
  groupMembers(identifier: string): ReadonlySet<ElementId> | undefined;
  relationshipNamed(identifier: string): boolean;
  /**
   * An element's tags in the model hold every tag it has at any line, as tags only accumulate:
   * no `!elements` block sets tags, and no script, plugin, include or constant can.
   */
  readonly elementTagsKnown: boolean;
}

/** The line of the first bulk statement the delete may leave selecting nothing. */
export function bulkSelectionEmptied(
  draft: Draft,
  closure: ReadonlySet<ElementId>,
  relationships: ReadonlySet<string>,
): number | undefined {
  const statements = bulkStatements(draft);
  const names = namesOf(draft, statements);
  for (const statement of statements) {
    if (removedWith(draft, closure, statement)) continue;
    const token = statement.tokens[1];
    if (token === undefined) continue;
    const expression = token.substitutes ? undefined : parseExpression(token.value);
    // The expression's tag lists are trimmed the JavaScript way, Structurizr's the Java way.
    const plain = /^[\x20-\x7e]*$/.test(token.value);
    const facts = plain || !names.elementTagsKnown ? names : { ...names, elementTagsKnown: false };
    const at = statement.range.start;
    const emptied =
      statement.tokens[0]?.value.toLowerCase() === "!elements"
        ? elementsEmptied(draft, facts, expression, at, closure)
        : relationshipsEmptied(draft, facts, expression, at, closure, relationships);
    if (emptied) return lineOf(draft.text, at);
  }
  return undefined;
}

function bulkStatements(draft: Draft): Statement[] {
  return draft.sources
    .opaque()
    .flatMap(({ node }) =>
      node.kind === "statement" && draft.sources.roleOf(node) === "bulk" ? [node] : [],
    );
}

/** A bulk statement in the block of a deleted element, or of its re-open, goes with it. */
function removedWith(draft: Draft, closure: ReadonlySet<ElementId>, statement: Statement): boolean {
  for (const id of closure) {
    const site = draft.sources.elementSite(id);
    if (site === undefined) continue;
    if ([site.definition, ...site.reopens].some((holder) => holds(holder.range, statement.range)))
      return true;
  }
  return false;
}

function holds(outer: TextRange, inner: TextRange): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * Structurizr resolves an identifier to the element whose key it is or, in hierarchical mode,
 * whose key ends in it; a group's or a relationship's identifier, or `this`, names something else.
 */
function namesOf(draft: Draft, statements: readonly Statement[]): Names {
  const elements = draft.workspace.elements;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const relationshipIdentifiers = new Set(
    draft.workspace.relationships.flatMap(
      (relationship) => relationship.identifier?.toLowerCase() ?? [],
    ),
  );
  const groups = groupsByIdentifier(draft);
  const others = new Set(["this", ...relationshipIdentifiers, ...groups.keys()]);
  const resolved = new Map<string, ReadonlySet<ModelElement> | undefined>();
  const elementsNamed = (identifier: string) => {
    const lower = identifier.toLowerCase();
    if (!resolved.has(lower)) {
      const named = elements.filter((candidate) => {
        const id = candidate.id.toLowerCase();
        return id === lower || id.endsWith(`.${lower}`);
      });
      resolved.set(lower, others.has(lower) ? undefined : new Set(named));
    }
    return resolved.get(lower);
  };
  return {
    element: (id) => byId.get(id),
    elementsNamed,
    groupMembers: (identifier) => {
      const lower = identifier.toLowerCase();
      const sites = groups.get(lower);
      const members = sites?.length === 1 ? sites[0] : undefined;
      if (members === undefined || lower === "this" || relationshipIdentifiers.has(lower)) {
        return undefined;
      }
      const named = elements.some((candidate) => {
        const id = candidate.id.toLowerCase();
        return id === lower || id.endsWith(`.${lower}`);
      });
      return named ? undefined : members;
    },
    relationshipNamed: (identifier) => relationshipIdentifiers.has(identifier.toLowerCase()),
    elementTagsKnown: tagsOnlyFromTheText(draft, statements),
  };
}

/**
 * A nested group's elements count for its outer groups too (`ElementGroup.addElement`), and an
 * element joins its group where it is defined, so no later statement changes the members. A
 * group without a statement of its own has members the text doesn't show: undefined.
 */
function groupsByIdentifier(draft: Draft): Map<string, (ReadonlySet<ElementId> | undefined)[]> {
  const sites = draft.sources.groups();
  const groups = new Map<string, (ReadonlySet<ElementId> | undefined)[]>();
  for (const group of sites) {
    if (group.identifier === undefined) continue;
    const outer = group.statement?.range;
    const members =
      outer &&
      new Set(
        sites
          .filter(
            (other) =>
              other === group ||
              (other.statement !== undefined && holds(outer, other.statement.range)),
          )
          .flatMap((other) => other.members),
      );
    const key = group.identifier.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), members]);
  }
  return groups;
}

function tagsOnlyFromTheText(draft: Draft, statements: readonly Statement[]): boolean {
  if (draft.workspace.openWorld || draft.text.includes("${")) return false;
  const opaque = draft.sources.opaque();
  if (opaque.some(({ node }) => node.kind !== "statement" || !statements.includes(node))) {
    return false;
  }
  return !statements.some(
    (statement) =>
      statement.tokens[0]?.value.toLowerCase() === "!elements" &&
      (statement.block?.children ?? []).some(
        (child) => child.kind === "statement" && draft.sources.roleOf(child) === "tags",
      ),
  );
}

function elementsEmptied(
  draft: Draft,
  names: Names,
  expression: Expression | undefined,
  evaluatedAt: number,
  closure: ReadonlySet<ElementId>,
): boolean {
  const start = (id: ElementId) => draft.sources.elementSite(id)?.definition.range.start;
  const mayGo = draft.workspace.elements.some(
    (element) =>
      closure.has(element.id) &&
      (start(element.id) ?? 0) < evaluatedAt &&
      selectsElement(names, expression, element) !== "no",
  );
  if (!mayGo) return false;
  return !draft.workspace.elements.some(
    (element) =>
      !closure.has(element.id) &&
      (start(element.id) ?? evaluatedAt) < evaluatedAt &&
      selectsElement(names, expression, element) === "yes",
  );
}

function relationshipsEmptied(
  draft: Draft,
  names: Names,
  expression: Expression | undefined,
  evaluatedAt: number,
  closure: ReadonlySet<ElementId>,
  removedKeys: ReadonlySet<string>,
): boolean {
  const all = draft.workspace.relationships;
  const start = (relationship: Relationship) =>
    draft.sources.relationshipSite(relationship.canvasKey)?.statement.range.start;
  const explicitByKey = new Map(
    all.flatMap((relationship) =>
      !relationship.implied && relationship.key !== undefined
        ? [[relationship.key, relationship] as const]
        : [],
    ),
  );
  const removedOrigins = new Set(
    all.flatMap((relationship) =>
      removedKeys.has(relationship.canvasKey) && relationship.key !== undefined
        ? [relationship.key]
        : [],
    ),
  );
  // An implied relationship whose origin has no key may come from any removed one.
  const originRemoved = (relationship: Relationship) =>
    relationship.impliedBy === undefined
      ? removedKeys.size > 0
      : removedOrigins.has(relationship.impliedBy);
  const removed = (relationship: Relationship) =>
    removedKeys.has(relationship.canvasKey) ||
    closure.has(relationship.sourceId) ||
    closure.has(relationship.destinationId) ||
    (relationship.implied && originRemoved(relationship));
  const writtenAt = (relationship: Relationship) => {
    const written = relationship.implied
      ? relationship.impliedBy === undefined
        ? undefined
        : explicitByKey.get(relationship.impliedBy)
      : relationship;
    return written === undefined ? undefined : start(written);
  };
  const mayGo = all.some(
    (relationship) =>
      removed(relationship) &&
      (writtenAt(relationship) ?? 0) < evaluatedAt &&
      selectsRelationship(names, expression, relationship) !== "no",
  );
  if (!mayGo) return false;
  // An implied relationship may lose its origin with the delete, so only explicit ones stay surely.
  return !all.some(
    (relationship) =>
      !relationship.implied &&
      !removed(relationship) &&
      (start(relationship) ?? evaluatedAt) < evaluatedAt &&
      selectsRelationship(names, expression, relationship) === "yes",
  );
}

function selectsElement(
  names: Names,
  expression: Expression | undefined,
  element: ModelElement,
): Verdict {
  if (expression === undefined) return "maybe";
  switch (expression.kind) {
    case "reference": {
      const members = names.groupMembers(expression.identifier);
      if (members !== undefined) return members.has(element.id) ? "yes" : "no";
      return namesElement(names, expression.identifier, element);
    }
    case "not":
      return not(selectsElement(names, expression.operand, element));
    case "and":
      return and(
        selectsElement(names, expression.left, element),
        selectsElement(names, expression.right, element),
      );
    case "or":
      return or(
        selectsElement(names, expression.left, element),
        selectsElement(names, expression.right, element),
      );
    case "elementType":
      return element.kind === expression.elementKind ? "yes" : "no";
    case "elementParent": {
      const parent = element.parentId === undefined ? undefined : names.element(element.parentId);
      return parent === undefined ? "no" : namesElement(names, expression.parent, parent);
    }
    case "elementTag":
      // A tag the element lacks in the model it lacks at every line; one it has may come later.
      if (!names.elementTagsKnown || hasAllTags(element.tags, expression.tags)) return "maybe";
      return expression.equals ? "no" : "yes";
    case "elementTechnology":
      // Structurizr compares the technology of containers and components only.
      return element.kind === "container" || element.kind === "component" ? "maybe" : "no";
    default:
      // Properties a later statement or a bulk block may still change, couplings and `*` (which
      // selects nothing here) are left undecided.
      return "maybe";
  }
}

function selectsRelationship(
  names: Names,
  expression: Expression | undefined,
  relationship: Relationship,
): Verdict {
  if (expression === undefined) return "maybe";
  switch (expression.kind) {
    case "relationship":
      return and(
        endNamed(names, expression.source, relationship.sourceId),
        endNamed(names, expression.destination, relationship.destinationId),
      );
    case "relationshipEnd": {
      const end = names.element(
        expression.end === "source" ? relationship.sourceId : relationship.destinationId,
      );
      return end === undefined ? "maybe" : selectsElement(names, expression.operand, end);
    }
    case "reference":
      if (relationship.identifier?.toLowerCase() === expression.identifier.toLowerCase())
        return "yes";
      return names.relationshipNamed(expression.identifier) ? "no" : "maybe";
    case "and":
      return and(
        selectsRelationship(names, expression.left, relationship),
        selectsRelationship(names, expression.right, relationship),
      );
    case "or":
      return or(
        selectsRelationship(names, expression.left, relationship),
        selectsRelationship(names, expression.right, relationship),
      );
    default:
      return "maybe";
  }
}

function endNamed(names: Names, identifier: string, id: ElementId): Verdict {
  if (identifier === "*") return "yes";
  const element = names.element(id);
  return element === undefined ? "maybe" : namesElement(names, identifier, element);
}

function namesElement(names: Names, identifier: string, element: ModelElement): Verdict {
  const named = names.elementsNamed(identifier);
  if (named === undefined) return "maybe";
  if (!named.has(element)) return "no";
  return named.size === 1 ? "yes" : "maybe";
}

function hasAllTags(tags: readonly string[], wanted: readonly string[]): boolean {
  return wanted.every((tag) => tags.includes(tag));
}

function not(verdict: Verdict): Verdict {
  if (verdict === "maybe") return verdict;
  return verdict === "yes" ? "no" : "yes";
}

function and(left: Verdict, right: Verdict): Verdict {
  if (left === "no" || right === "no") return "no";
  return left === "yes" && right === "yes" ? "yes" : "maybe";
}

function or(left: Verdict, right: Verdict): Verdict {
  if (left === "yes" || right === "yes") return "yes";
  return left === "no" && right === "no" ? "no" : "maybe";
}
