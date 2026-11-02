/*
 * The part of the frame condition (SPEC 3.4 step 4) for what the modeler keeps but doesn't draw:
 * deployment environments, dynamic-view steps, animation steps and `!docs`, `!adrs`,
 * `!decisions`. Each statement (and each animation term) is read with its references written as
 * the ids they resolve to, so a rename changes nothing, and in document order with its depth, so
 * a statement moved into another block shows. After the edit the same entries must be there,
 * except those that name something the edit removed (they must go) and those the cascade may
 * remove once the relationship they name by its ends is gone.
 *
 * Animation steps the builder couldn't evaluate get a second guard: the edit is refused when it
 * changes anything their result may depend on.
 */
import type { ElementId, ViewKey, Workspace } from "@miragon/c4-schema-model";
import {
  semanticSources,
  type ReferenceTarget,
  type ResolvedReference,
  type SemanticSources,
} from "../semantic/index.js";
import type { IdChange, ParseResult, Statement, Token } from "../types.js";
import { operandEdits } from "./operands.js";
import { refuse } from "./refusal.js";
import { applyTextEdits } from "./textEdits.js";

/** What the edit means to remove (the verifier's `Intent`), by the ids before it. */
export interface Removals {
  readonly removedElements: ReadonlySet<ElementId>;
  readonly removedRelationships: ReadonlySet<string>;
  readonly removedViews: ReadonlySet<ViewKey>;
  readonly droppedAnimationTerms: ReadonlyMap<ViewKey, ReadonlySet<ElementId>>;
}

function statementChildren(statement: Statement | undefined): Statement[] {
  return (statement?.block?.children ?? []).filter(
    (child): child is Statement => child.kind === "statement",
  );
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (
    let index = text.indexOf("\n");
    index !== -1 && index < offset;
    index = text.indexOf("\n", index + 1)
  )
    line += 1;
  return line;
}

interface Entry {
  readonly text: string;
  /** It names something the edit removed, or sits in a block that goes. */
  readonly must: boolean;
  /** The cascade may remove it (or it must go). */
  readonly may: boolean;
}

interface Reading {
  readonly sources: SemanticSources;
  readonly workspace: Workspace;
  readonly references: ReadonlyMap<Statement, ReadonlyMap<number, readonly ResolvedReference[]>>;
  readonly element: (id: ElementId) => ElementId;
  readonly relationship: (key: string) => string;
  readonly group: (identifier: string) => string;
}

/** What the edit removed, by the ids before it; nothing when reading the result. */
interface Removed {
  readonly elements: ReadonlySet<ElementId>;
  readonly relationships: ReadonlySet<string>;
  readonly views: ReadonlySet<ViewKey>;
  /** Ancestors-or-self of the ends of every removed relationship, per end. */
  readonly ends: readonly {
    readonly sources: ReadonlySet<ElementId>;
    readonly destinations: ReadonlySet<ElementId>;
  }[];
  /** Per view, elements whose animation terms a remove from the view may drop. */
  readonly dropped: ReadonlyMap<ViewKey, ReadonlySet<ElementId>>;
}

const NOTHING: Removed = {
  elements: new Set(),
  relationships: new Set(),
  views: new Set(),
  ends: [],
  dropped: new Map(),
};

function sourcesOf(parse: ParseResult): SemanticSources | undefined {
  return semanticSources(parse.sources);
}

function referenceMap(sources: SemanticSources): Map<Statement, Map<number, ResolvedReference[]>> {
  const map = new Map<Statement, Map<number, ResolvedReference[]>>();
  for (const reference of sources.allReferences()) {
    const tokens = map.get(reference.statement) ?? new Map<number, ResolvedReference[]>();
    tokens.set(reference.token, [...(tokens.get(reference.token) ?? []), reference]);
    map.set(reference.statement, tokens);
  }
  return map;
}

function reading(parse: ParseResult, changes: readonly IdChange[]): Reading | undefined {
  const sources = sourcesOf(parse);
  if (sources === undefined) return undefined;
  const elements = new Map<string, string>();
  for (const change of changes) if (change.kind === "element") elements.set(change.from, change.to);
  return {
    sources,
    workspace: parse.workspace,
    references: referenceMap(sources),
    element: (id) => elements.get(id) ?? id,
    relationship: (key) => {
      let current = key;
      for (const change of changes)
        if (change.kind === "relationship" && change.from === current) current = change.to;
      return current;
    },
    // A hierarchical group identifier starts with the id of the element whose block holds it.
    group: (identifier) => {
      let owner: IdChange | undefined;
      for (const change of changes) {
        if (change.kind !== "element" || !identifier.startsWith(`${change.from}.`)) continue;
        if (owner === undefined || change.from.length > owner.from.length) owner = change;
      }
      return owner === undefined ? identifier : `${owner.to}${identifier.slice(owner.from.length)}`;
    },
  };
}

function canonical(read: Reading, target: ReferenceTarget): string {
  switch (target.kind) {
    case "element":
      return `⟨e:${read.element(target.id)}⟩`;
    case "relationship":
      return `⟨r:${read.relationship(target.key)}⟩`;
    case "deployment":
      return `⟨d:${target.identifier ?? ""}⟩`;
    case "group":
      return `⟨g:${target.identifier === undefined ? target.path : read.group(target.identifier)}⟩`;
    case "view":
      return `⟨v:${target.key}⟩`;
  }
}

/** A reference as the id it resolves to; an expression term with each operand replaced that way. */
function renderToken(
  read: Reading,
  token: Token,
  references: readonly ResolvedReference[],
): string {
  if (references.length === 0) return token.raw;
  const exact = references.find((reference) => reference.exact);
  if (exact) return canonical(read, exact.target);
  const edits = references
    .flatMap((reference) =>
      operandEdits(token.raw, 0, reference.written, canonical(read, reference.target)),
    )
    .sort((left, right) => left.start - right.start);
  const separate = edits.filter(
    (edit, index) => index === 0 || edit.start >= (edits[index - 1]?.end ?? 0),
  );
  return applyTextEdits(token.raw, separate);
}

function renderTokens(read: Reading, statement: Statement, from = 0): string[] {
  const references = read.references.get(statement);
  return statement.tokens
    .slice(from)
    .map((token, index) => renderToken(read, token, references?.get(index + from) ?? []));
}

function renderHead(read: Reading, statement: Statement): string {
  const assignee = statement.assignee === undefined ? "" : `${statement.assignee.raw} = `;
  return `${assignee}${renderTokens(read, statement).join(" ")}${statement.block ? " {" : ""}`;
}

/** Whether a statement names something removed, and the deployment identifiers it defines. */
function namesRemoved(
  read: Reading,
  statement: Statement,
  removed: Removed,
  goneDeployment: ReadonlySet<string>,
  tokens?: readonly number[],
): boolean {
  const references = read.references.get(statement);
  if (references === undefined) return false;
  for (const [token, list] of references) {
    if (tokens !== undefined && !tokens.includes(token)) continue;
    for (const reference of list) {
      const target = reference.target;
      if (target.kind === "element" && removed.elements.has(target.id)) return true;
      if (target.kind === "relationship" && removed.relationships.has(target.key)) return true;
      if (
        target.kind === "deployment" &&
        target.identifier !== undefined &&
        goneDeployment.has(target.identifier.toLowerCase())
      )
        return true;
    }
  }
  return false;
}

function namesOneOf(
  read: Reading,
  statement: Statement,
  token: number,
  ids: ReadonlySet<ElementId>,
): boolean {
  return (read.references.get(statement)?.get(token) ?? []).some(
    (reference) =>
      reference.exact && reference.target.kind === "element" && ids.has(reference.target.id),
  );
}

function namesGroup(read: Reading, statement: Statement, token: number): boolean {
  return (read.references.get(statement)?.get(token) ?? []).some(
    (reference) => reference.target.kind === "group",
  );
}

/** Deployment environments: every statement below each, with its depth. */
/** Returns the identifiers of the deployment items that go. */
function deployment(read: Reading, removed: Removed, entries: Entry[]): Set<string> {
  const gone = new Set<string>();
  const anyRemoved = removed.elements.size > 0 || removed.relationships.size > 0;
  const visit = (statement: Statement, depth: number, must: boolean, may: boolean) => {
    const own = must || namesRemoved(read, statement, removed, gone);
    const mayOwn =
      own || may || (anyRemoved && read.sources.roleOf(statement) === "noRelationship");
    if (own && statement.assignee !== undefined) gone.add(statement.assignee.value.toLowerCase());
    entries.push({
      text: `deployment ${depth} ${renderHead(read, statement)}`,
      must: own,
      may: mayOwn,
    });
    for (const child of statementChildren(statement)) visit(child, depth + 1, own, mayOwn);
  };
  for (const environment of read.sources.deploymentEnvironments())
    visit(environment, 0, false, false);
  return gone;
}

function viewStatementOf(read: Reading, key: ViewKey): Statement | undefined {
  return read.sources.viewSite(key)?.statement;
}

/** A dynamic step the cascade drops once no relationship is left between its ends. */
function stepMayGo(read: Reading, statement: Statement, removed: Removed): boolean {
  if (removed.ends.length === 0) return false;
  const step = read.sources.dynamicSteps().find((candidate) => candidate.statement === statement);
  const [source, destination] = step?.elements ?? [];
  if (source === undefined || destination === undefined) return false;
  return removed.ends.some(
    (ends) => ends.sources.has(source) && ends.destinations.has(destination),
  );
}

/** Dynamic views: their steps and parallel blocks, with their depth. */
function dynamic(read: Reading, removed: Removed, entries: Entry[]): void {
  for (const view of read.workspace.views) {
    if (view.type !== "dynamic") continue;
    const viewGone = removed.views.has(view.key);
    const visit = (statement: Statement, depth: number, must: boolean, may: boolean) => {
      const role = read.sources.roleOf(statement);
      if (role !== "dynamicStep" && role !== "parallel") return;
      const own = must || namesRemoved(read, statement, removed, new Set());
      const mayOwn = own || may || stepMayGo(read, statement, removed);
      entries.push({
        text: `dynamic ${view.key} ${depth} ${renderHead(read, statement)}`,
        must: own,
        may: mayOwn,
      });
      for (const child of statementChildren(statement)) visit(child, depth + 1, own, mayOwn);
    };
    for (const child of statementChildren(viewStatementOf(read, view.key)))
      visit(child, 0, viewGone, viewGone);
  }
}

/** One step's line: a marker that goes with its last term, then its terms. */
function animationLine(
  read: Reading,
  key: ViewKey,
  statement: Statement,
  from: number,
  removed: Removed,
  gone: ReadonlySet<string>,
  viewGone: boolean,
): Entry[] {
  const anyRemoved = removed.elements.size > 0;
  const dropped = removed.dropped.get(key);
  const terms = renderTokens(read, statement, from).map((text, index): Entry => {
    const token = index + from;
    const must = viewGone || namesRemoved(read, statement, removed, gone, [token]);
    const may =
      must ||
      (anyRemoved && namesGroup(read, statement, token)) ||
      (dropped !== undefined && namesOneOf(read, statement, token, dropped));
    return { text: `animation ${key} term ${text}`, must, may };
  });
  return [
    {
      text: `animation ${key} ${from === 1 ? "animationStep" : "step"}`,
      must: terms.every((term) => term.must),
      may: terms.every((term) => term.may),
    },
    ...terms,
  ];
}

function animations(
  read: Reading,
  removed: Removed,
  gone: ReadonlySet<string>,
  entries: Entry[],
): void {
  for (const view of read.workspace.views) {
    const viewGone = removed.views.has(view.key);
    for (const statement of read.sources.viewSite(view.key)?.animations ?? []) {
      if (read.sources.roleOf(statement) === "animationStep") {
        entries.push(...animationLine(read, view.key, statement, 1, removed, gone, viewGone));
        continue;
      }
      const lines = statementChildren(statement).map((line) =>
        animationLine(read, view.key, line, 0, removed, gone, viewGone),
      );
      const markers = lines.map((line) => line[0] as Entry);
      entries.push({
        text: `animation ${view.key} block`,
        must: viewGone || (markers.length > 0 && markers.every((marker) => marker.must)),
        may: viewGone || (markers.length > 0 && markers.every((marker) => marker.may)),
      });
      for (const line of lines) entries.push(...line);
    }
  }
}

/** `!docs`, `!adrs` and `!decisions`: they go with the element whose block holds them. */
function documentation(read: Reading, removed: Removed, entries: Entry[]): void {
  const definitions = new Map<Statement, ElementId>();
  for (const element of read.workspace.elements) {
    const site = read.sources.elementSite(element.id);
    if (site) definitions.set(site.definition, element.id);
  }
  for (const statement of read.sources.statements) {
    if (read.sources.roleOf(statement) !== "docs") continue;
    let must = false;
    for (
      let node: Statement | undefined = read.sources.parentOf(statement);
      node !== undefined;
      node = read.sources.parentOf(node)
    ) {
      const id = definitions.get(node);
      if (id !== undefined && removed.elements.has(id)) must = true;
    }
    entries.push({ text: `docs ${renderHead(read, statement)}`, must, may: must });
  }
}

function entriesOf(read: Reading, removed: Removed): Entry[] {
  const entries: Entry[] = [];
  const gone = deployment(read, removed, entries);
  dynamic(read, removed, entries);
  animations(read, removed, gone, entries);
  documentation(read, removed, entries);
  return entries;
}

function selfAndAncestors(workspace: Workspace, id: ElementId): Set<ElementId> {
  const parents = new Map(workspace.elements.map((element) => [element.id, element.parentId]));
  const result = new Set<ElementId>([id]);
  for (let current = parents.get(id); current !== undefined; current = parents.get(current))
    result.add(current);
  return result;
}

function removedBy(before: ParseResult, intent: Removals): Removed {
  const ends = before.workspace.relationships
    .filter((relationship) => intent.removedRelationships.has(relationship.canvasKey))
    .map((relationship) => ({
      sources: selfAndAncestors(before.workspace, relationship.sourceId),
      destinations: selfAndAncestors(before.workspace, relationship.destinationId),
    }));
  return {
    elements: intent.removedElements,
    relationships: intent.removedRelationships,
    views: intent.removedViews,
    ends,
    dropped: intent.droppedAnimationTerms,
  };
}

/** Undefined when the content the modeler keeps unread came out as expected, else what differs. */
export function uninterpretedDifference(
  before: ParseResult,
  after: ParseResult,
  intent: Removals,
  changes: readonly IdChange[],
): string | undefined {
  const previous = reading(before, changes);
  const next = reading(after, []);
  if (previous === undefined || next === undefined) return undefined;
  const expected = entriesOf(previous, removedBy(before, intent)).filter((entry) => !entry.must);
  const actual = entriesOf(next, NOTHING).map((entry) => entry.text);
  if (matches(expected, actual)) return undefined;
  const index = expected.findIndex((entry, position) => entry.text !== actual[position]);
  const entry = expected[index];
  return entry === undefined
    ? `unexpected: ${actual[expected.length] ?? ""}`
    : `missing or changed: ${entry.text}`;
}

/**
 * Whether dropping some of the optional expected entries gives the actual ones. Equal texts
 * repeat (every animation step's marker reads the same), so a greedy walk could pair an
 * optional entry with a later one's twin: the match runs over every split instead.
 */
function matches(expected: readonly Entry[], actual: readonly string[]): boolean {
  let next: boolean[] = actual.map(() => false).concat(true);
  for (let index = expected.length - 1; index >= 0; index -= 1) {
    const entry = expected[index] as Entry;
    const current = new Array<boolean>(actual.length + 1).fill(false);
    for (let position = actual.length; position >= 0; position -= 1) {
      current[position] =
        (entry.may && next[position] === true) ||
        (position < actual.length &&
          actual[position] === entry.text &&
          next[position + 1] === true);
    }
    next = current;
  }
  return next[0] === true;
}

/** What an animation step's result may depend on: elements, their relationships, instances. */
function dependencies(
  workspace: Workspace,
  rename: (id: ElementId) => ElementId,
  deploymentOnly: boolean,
): string {
  const instanced = new Set([...workspace.instances.keys()].map(rename));
  const inScope = (id: ElementId) => !deploymentOnly || instanced.has(rename(id));
  const elements = workspace.elements
    .filter((element) => inScope(element.id))
    .map((element) =>
      JSON.stringify([
        rename(element.id),
        element.kind,
        element.parentId === undefined ? null : rename(element.parentId),
        element.tags,
        element.technology,
        Object.entries(element.properties).sort(),
        element.group ?? null,
      ]),
    );
  const relationships = workspace.relationships
    .filter((relationship) => inScope(relationship.sourceId) || inScope(relationship.destinationId))
    .map((relationship) =>
      JSON.stringify([
        rename(relationship.sourceId),
        rename(relationship.destinationId),
        relationship.tags,
      ]),
    );
  const instances = [...workspace.instances].map(([id, names]) =>
    JSON.stringify([rename(id), names]),
  );
  return JSON.stringify([elements.sort(), relationships.sort(), instances.sort()]);
}

/**
 * Animation steps the builder couldn't evaluate (an expression in a deployment view, a term or a
 * view statement it doesn't read): refused when the edit changes the elements, relationships or
 * instances their result may depend on, since Structurizr refuses a step that no longer adds an
 * element. For deployment views only elements with instances count.
 */
export function checkUncheckedAnimations(
  before: ParseResult,
  after: ParseResult,
  intent: Removals,
  changes: readonly IdChange[],
): void {
  const sources = sourcesOf(before);
  if (sources === undefined) return;
  const steps = sources
    .uncheckedAnimationSteps()
    .filter((step) => !intent.removedViews.has(step.view));
  const first = steps[0];
  if (first === undefined) return;
  const types = new Map(before.workspace.views.map((view) => [view.key, view.type]));
  const deploymentOnly = steps.every((step) => types.get(step.view) === "deployment");
  const renamed = new Map<string, string>();
  for (const change of changes) if (change.kind === "element") renamed.set(change.from, change.to);
  const was = dependencies(before.workspace, (id) => renamed.get(id) ?? id, deploymentOnly);
  const now = dependencies(after.workspace, (id) => id, deploymentOnly);
  if (was === now) return;
  refuse(
    "referenced-by-opaque",
    `The animation step on line ${lineOf(before.text, first.statement.range.start)} may stop adding an element, and the modeler can't check it. Edit the text instead.`,
  );
}
