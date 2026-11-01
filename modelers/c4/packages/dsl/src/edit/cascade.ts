/*
 * Delete from the model (SPEC 3.5 "Delete from the model"): the closure of the selection with its
 * descendants, every relationship and re-open that names it, deployment instances, views scoped
 * on it and filtered views based on those, view terms and dynamic steps, layout keys; refused
 * when an opaque text may use it or an image view renders a removed view.
 */
import {
  elementLayoutKey,
  parseExpression,
  relationshipLayoutKey,
  type ElementId,
  type ViewKey,
} from "@miragon/c4-schema-model";
import type { GroupSite, ResolvedReference } from "../semantic/index.js";
import type { ParseResult, Statement, TextEdit, TextRange } from "../types.js";
import { bulkSelectionEmptied } from "./bulkSelection.js";
import type { Draft } from "./draft.js";
import { lineOf, opaqueMention } from "./elements.js";
import { removals, removeTokens, statementChildren } from "./place.js";
import { refuse } from "./refusal.js";
import { setViewProperties, termStart, viewKeyOf, writeGeneratedKey } from "./views.js";

export interface Removed {
  readonly elements: ReadonlySet<ElementId>;
  /** Canvas keys of the explicit relationships removed. */
  readonly relationships: ReadonlySet<string>;
  readonly views: ReadonlySet<ViewKey>;
}

/** The selection and every element below it. */
export function closureOf(draft: Draft, ids: readonly ElementId[]): Set<ElementId> {
  const closure = new Set(ids);
  for (const element of draft.workspace.elements) {
    for (
      let parent = element.parentId;
      parent !== undefined;
      parent = draft.element(parent)?.parentId
    ) {
      if (closure.has(parent)) {
        closure.add(element.id);
        break;
      }
    }
  }
  return closure;
}

/** Structurizr's canonical names (`.` and `/` dropped from names), which `!element` and scripts may use. */
function canonicalName(draft: Draft, id: ElementId): string {
  const element = draft.element(id);
  if (element === undefined) return "";
  const clean = (name: string) => name.replace(/[./]/g, "");
  const chain: string[] = [];
  for (
    let current = draft.element(id);
    current !== undefined;
    current = current.parentId === undefined ? undefined : draft.element(current.parentId)
  ) {
    chain.unshift(clean(current.name));
  }
  const prefix: Record<string, string> = {
    person: "Person",
    softwareSystem: "SoftwareSystem",
    container: "Container",
    component: "Component",
    custom: "Custom",
  };
  return `${prefix[element.kind] ?? "Custom"}://${chain.join(".")}`;
}

/** A term the cascade may remove: one of the forms SPEC 3.5 step 5 names, about a removed item. */
function removableTerm(text: string, gone: (identifier: string) => boolean): boolean {
  const expression = parseExpression(text);
  if (expression === undefined) return false;
  switch (expression.kind) {
    case "reference":
      return gone(expression.identifier);
    case "coupling":
      return expression.operand.kind === "reference" && gone(expression.operand.identifier);
    case "elementParent":
      return gone(expression.parent);
    case "relationship":
      return gone(expression.source) || gone(expression.destination);
    default:
      return false;
  }
}

interface Selection {
  readonly closure: ReadonlySet<ElementId>;
  /** Canvas keys of the explicit relationships that go. */
  readonly relationships: ReadonlySet<string>;
}

/** The closure and every explicit relationship that goes with it; refused when an opaque text may use one. */
function selectionOf(draft: Draft, ids: readonly ElementId[], keys: readonly string[]): Selection {
  for (const id of ids) draft.requireElement(id);
  const closure = closureOf(draft, ids);
  const relationships = new Set<string>();
  for (const key of keys) {
    const relationship = draft.relationship(key);
    if (relationship === undefined)
      refuse("not-allowed", "There is no such relationship in the model.");
    if (relationship.implied) {
      refuse(
        "not-allowed",
        "An implied relationship comes from another one. Delete that relationship instead.",
      );
    }
    relationships.add(relationship.canvasKey);
  }
  for (const relationship of draft.workspace.relationships) {
    const touches = closure.has(relationship.sourceId) || closure.has(relationship.destinationId);
    if (!relationship.implied && touches) relationships.add(relationship.canvasKey);
  }
  for (const key of relationships) {
    if (draft.relationship(key)?.bulk) {
      refuse(
        "referenced-by-opaque",
        "A !relationships statement makes this relationship. Edit the text instead.",
      );
    }
  }
  const identifiers = [
    ...closure,
    ...relationshipIdentifiers(draft, relationships),
    ...emptiedGroups(draft, closure).flatMap((group) => group.identifier ?? []),
  ];
  const line = opaqueMention(
    draft,
    identifiers,
    [...closure].map((id) => canonicalName(draft, id)),
  );
  if (line !== undefined) {
    const first = ids[0] ?? identifiers[0] ?? "";
    refuse(
      "referenced-by-opaque",
      `A script or bulk statement on line ${line} may use ${first}. Edit the text instead.`,
    );
  }
  const emptied = bulkSelectionEmptied(draft, closure, relationships);
  if (emptied !== undefined) {
    refuse(
      "referenced-by-opaque",
      `The bulk statement on line ${emptied} may select nothing once this is deleted, and Structurizr refuses the file then. Edit the text instead.`,
    );
  }
  return { closure, relationships };
}

/**
 * Groups the closure leaves without an element: Structurizr refuses a view term or an
 * `!elements` expression naming one. A nested group's elements count for its outer groups too
 * (`ElementGroup.addElement` adds them to the parent group).
 */
function emptiedGroups(draft: Draft, closure: ReadonlySet<ElementId>): GroupSite[] {
  const sites = draft.sources.groups();
  const inside = (outer: GroupSite, inner: GroupSite) =>
    outer.statement !== undefined &&
    inner.statement !== undefined &&
    inner.statement.range.start >= outer.statement.range.start &&
    inner.statement.range.end <= outer.statement.range.end;
  return sites.filter((group) => {
    const members = sites
      .filter((other) => other === group || inside(group, other))
      .flatMap((other) => other.members);
    return members.length > 0 && members.every((member) => closure.has(member));
  });
}

function relationshipIdentifiers(draft: Draft, keys: Iterable<string>): string[] {
  return [...keys].flatMap((key) => draft.relationship(key)?.identifier ?? []);
}

function within(draft: Draft, statement: Statement, outer: ReadonlySet<Statement>): boolean {
  for (
    let node: Statement | undefined = statement;
    node !== undefined;
    node = draft.sources.parentOf(node)
  ) {
    if (outer.has(node)) return true;
  }
  return false;
}

interface Collected {
  readonly nodes: Set<Statement>;
  readonly terms: { readonly statement: Statement; readonly token: number }[];
}

/** Every statement that goes and every view term to remove (SPEC 3.5 steps 1-6). */
function collect(
  draft: Draft,
  selection: Selection,
  removedViews: ReadonlySet<ViewKey>,
): Collected {
  const { closure, relationships } = selection;
  const nodes: Statement[] = [];
  const terms: { statement: Statement; token: number }[] = [];
  const gone = new Set(
    [...closure, ...relationshipIdentifiers(draft, relationships)].map((id) => id.toLowerCase()),
  );
  const groups = emptiedGroups(draft, closure);
  for (const group of groups)
    if (group.identifier !== undefined) gone.add(group.identifier.toLowerCase());
  const viewStatements = new Set(
    [...removedViews].flatMap((key) => draft.sources.viewSite(key)?.statement ?? []),
  );
  const handle = (reference: ResolvedReference) => {
    if (
      reference.kind === "view-scope" ||
      reference.kind === "view-base" ||
      reference.kind === "image-source"
    )
      return;
    if (reference.kind !== "view-term" && reference.kind !== "animation-term") {
      nodes.push(reference.statement);
      return;
    }
    if (within(draft, reference.statement, viewStatements)) return;
    const token = reference.statement.tokens[reference.token];
    if (token === undefined) return;
    if (
      reference.exact ||
      removableTerm(token.value, (identifier) => gone.has(identifier.toLowerCase()))
    ) {
      terms.push({ statement: reference.statement, token: reference.token });
      return;
    }
    refuse(
      "not-allowed",
      `An expression on line ${lineOf(draft.text, token.range.start)} uses ${reference.written}. Edit the text instead.`,
    );
  };
  for (const id of closure) {
    const site = draft.sources.elementSite(id);
    if (site === undefined) continue;
    const parent = draft.element(id)?.parentId;
    if (parent === undefined || !closure.has(parent)) nodes.push(site.definition);
    nodes.push(...site.reopens);
    draft.sources.references(id).forEach(handle);
    for (const instance of draft.workspace.instances.get(id) ?? []) {
      if (instance !== "")
        draft.sources.referencesTo({ kind: "deployment", identifier: instance }).forEach(handle);
    }
  }
  for (const key of relationships) {
    const site = draft.sources.relationshipSite(key);
    if (site !== undefined) nodes.push(site.statement, ...site.reopens);
    draft.sources.referencesTo({ kind: "relationship", key }).forEach(handle);
  }
  for (const group of groups) {
    draft.sources
      .referencesTo({ kind: "group", path: group.path, identifier: group.identifier })
      .forEach(handle);
  }
  for (const step of draft.sources.dynamicSteps()) {
    const named =
      step.elements.some((element) => closure.has(element)) ||
      (step.relationship !== undefined && relationships.has(step.relationship));
    if (named && !within(draft, step.statement, viewStatements)) nodes.push(step.statement);
  }
  nodes.push(...viewStatements);
  return { nodes: new Set(nodes), terms };
}

/** Token removals, and the statements and `animation` blocks left without a term. */
function termEdits(
  draft: Draft,
  collected: Collected,
  removedViews: ReadonlySet<ViewKey>,
): { readonly edits: TextEdit[]; readonly emptied: Statement[] } {
  const byStatement = new Map<Statement, Set<number>>();
  for (const term of collected.terms) {
    if (within(draft, term.statement, collected.nodes)) continue;
    byStatement.set(
      term.statement,
      new Set([...(byStatement.get(term.statement) ?? []), term.token]),
    );
  }
  const edits: TextEdit[] = [];
  const emptied: Statement[] = [];
  for (const [statement, tokens] of byStatement) {
    const view = viewKeyOf(draft, statement);
    if (view !== undefined) draft.touch(view);
    if (tokens.size >= statement.tokens.length - termStart(statement)) {
      emptied.push(statement);
      continue;
    }
    edits.push(...removeTokens(draft.text, statement, tokens));
  }
  for (const view of draft.workspace.views) {
    if (removedViews.has(view.key)) continue;
    for (const animation of draft.sources.viewSite(view.key)?.animations ?? []) {
      const lines = statementChildren(animation);
      const empty =
        lines.length > 0 &&
        lines.every((line) => emptied.includes(line) || collected.nodes.has(line));
      if (animation.block !== undefined && empty) emptied.push(animation);
    }
  }
  return { edits, emptied };
}

/** Layout keys of the closure, of the removed relationships and of the implied ones that go with them (step 7). */
function layoutKeysToDrop(
  draft: Draft,
  selection: Selection,
  removedViews: ReadonlySet<ViewKey>,
): Map<ViewKey, string[]> {
  const { closure, relationships } = selection;
  const removedKeys = new Set(
    [...relationships].flatMap((key) => draft.relationship(key)?.key ?? []),
  );
  const goneImplied = draft.workspace.relationships.filter(
    (relationship) =>
      relationship.implied &&
      relationship.key !== undefined &&
      (closure.has(relationship.sourceId) ||
        closure.has(relationship.destinationId) ||
        (relationship.impliedBy !== undefined && removedKeys.has(relationship.impliedBy))),
  );
  const names = [
    ...[...closure].map(elementLayoutKey),
    ...[...removedKeys].map(relationshipLayoutKey),
    ...goneImplied.map((relationship) => relationshipLayoutKey(relationship.key as string)),
  ];
  const result = new Map<ViewKey, string[]>();
  for (const view of draft.workspace.views) {
    if (removedViews.has(view.key)) continue;
    const present = names.filter((name) => view.properties[name] !== undefined);
    if (present.length > 0) result.set(view.key, present);
  }
  return result;
}

export function deleteFromModel(
  draft: Draft,
  ids: readonly ElementId[],
  relationshipKeys: readonly string[],
): Removed {
  const selection = selectionOf(draft, ids, relationshipKeys);
  if (draft.workspace.openWorld) draft.notices.add("include-not-updated");
  const removedViews = viewsToRemove(draft, selection.closure);
  for (const key of removedViews) writeLaterKeys(draft, key, removedViews);
  const collected = collect(draft, selection, removedViews);
  const terms = termEdits(draft, collected, removedViews);
  const layoutKeys = layoutKeysToDrop(draft, selection, removedViews);
  const before = draft.parse;
  draft.apply([...terms.edits, ...removals(draft.text, [...collected.nodes, ...terms.emptied])]);
  for (const [key, names] of layoutKeys) {
    if (draft.sources.viewSite(key) === undefined) continue;
    setViewProperties(draft, key, new Map(names.map((name) => [name, null])));
  }
  dropBrokenStatements(draft, before);
  for (const id of selection.closure) {
    draft.fresh.delete(id);
    draft.intent.removedElements.add(id);
  }
  for (const key of selection.relationships) draft.intent.removedRelationships.add(key);
  for (const key of removedViews) draft.intent.removedViews.add(key);
  return {
    elements: selection.closure,
    relationships: selection.relationships,
    views: removedViews,
  };
}

/**
 * Statements that name a relationship by its ends: a dynamic step written as `a -> b`, and a
 * `-/>` in a deployment environment, which Structurizr refuses once no relationship is left to
 * remove. When the cascade removed the last relationship between the ends, they go too (SPEC 3.5
 * steps 2 and 6).
 */
function dropBrokenStatements(draft: Draft, before: ParseResult): void {
  const known = (code: string) =>
    new Set(
      before.diagnostics
        .filter((diagnostic) => diagnostic.code === code)
        .map((diagnostic) => diagnostic.anchor),
    );
  const knownUnresolved = known("unresolved-reference");
  const knownInvalid = known("invalid-statement");
  const newlyBroken = (range: TextRange, code: string, seen: ReadonlySet<string>) =>
    draft.parse.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === code &&
        !seen.has(diagnostic.anchor) &&
        diagnostic.range.start >= range.start &&
        diagnostic.range.end <= range.end,
    );
  const steps = draft.sources
    .dynamicSteps()
    .map((step) => step.statement)
    .filter((statement) => newlyBroken(statement.range, "unresolved-reference", knownUnresolved));
  const exclusions = draft.sources.statements.filter(
    (statement) =>
      draft.sources.roleOf(statement) === "noRelationship" &&
      newlyBroken(statement.head, "invalid-statement", knownInvalid),
  );
  if (steps.length === 0 && exclusions.length === 0) return;
  for (const statement of steps) {
    const view = viewKeyOf(draft, statement);
    if (view !== undefined) draft.touch(view);
  }
  draft.apply(removals(draft.text, [...steps, ...exclusions]));
}

/** Views scoped on the closure, then filtered views based on a removed view (SPEC 3.5 step 4). */
function viewsToRemove(draft: Draft, closure: ReadonlySet<ElementId>): Set<ViewKey> {
  const removed = new Set<ViewKey>();
  for (const view of draft.workspace.views) {
    if (view.scopeId !== undefined && closure.has(view.scopeId)) removed.add(view.key);
  }
  for (const id of closure) {
    for (const reference of draft.sources.references(id)) {
      if (reference.kind !== "view-scope") continue;
      const key = draft.workspace.views.find(
        (view) => draft.sources.viewSite(view.key)?.statement === reference.statement,
      )?.key;
      if (key !== undefined) removed.add(key);
    }
  }
  addDependentViews(draft, removed);
  return removed;
}

/** Filtered views on a removed base go too; an image view that renders one refuses (`view-in-use`). */
export function addDependentViews(draft: Draft, removed: Set<ViewKey>): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const view of draft.workspace.views) {
      if (removed.has(view.key) || view.type !== "filtered" || view.baseKey === undefined) continue;
      if (removed.has(view.baseKey)) {
        removed.add(view.key);
        grew = true;
      }
    }
  }
  for (const key of removed) {
    for (const reference of draft.sources.referencesTo({ kind: "view", key })) {
      if (reference.kind !== "image-source") continue;
      const owner = draft.workspace.views.find((view) => {
        const statement = draft.sources.viewSite(view.key)?.statement;
        for (
          let node: Statement | undefined = reference.statement;
          node !== undefined;
          node = draft.sources.parentOf(node)
        ) {
          if (node === statement) return true;
        }
        return false;
      });
      if (owner !== undefined && removed.has(owner.key)) continue;
      refuse(
        "view-in-use",
        `The image view ${owner?.key ?? ""} renders the view ${key}. Edit the text instead.`.replace(
          "  ",
          " ",
        ),
      );
    }
  }
}

/**
 * Before a view whose key has Structurizr's generated form goes, the later keyless views with
 * that prefix get their generated keys written, so they don't renumber (SPEC 3.5 step 4,
 * `ViewSet.generateViewKey` hands out the first unused `<Prefix>-NNN`).
 */
export function writeLaterKeys(draft: Draft, key: ViewKey, removed: ReadonlySet<ViewKey>): void {
  const prefix = /^([A-Za-z]+)-\d{3,}$/.exec(key)?.[1];
  if (prefix === undefined) return;
  const views = draft.workspace.views;
  const index = views.findIndex((view) => view.key === key);
  for (const later of views.slice(index + 1)) {
    if (later.keyGenerated && later.key.startsWith(`${prefix}-`) && !removed.has(later.key)) {
      writeGeneratedKey(draft, later.key);
    }
  }
}
