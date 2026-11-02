/*
 * Verification of an edit before it is offered (SPEC 3.4 step 4): the result is importable, has
 * no new error, its primary digest equals the expected transformation of the digest before (the
 * frame condition, the lesson of Wardley's `patchDSL`), and so does the content the modeler keeps
 * unread (`uninterpreted.ts`), implied relationships change only around what the edit added or
 * removed, and the operation's own postconditions hold.
 */
import {
  sameDigest,
  semanticDigest,
  type Diagnostic,
  type ElementDigest,
  type ElementId,
  type RelationshipDigest,
  type SemanticDigest,
  type ViewDigest,
  type ViewKey,
  type Workspace,
} from "@miragon/c4-schema-model";
import { semanticSources } from "../semantic/index.js";
import type { IdChange, ParseResult, TextEdit } from "../types.js";
import { EditRefused } from "./refusal.js";
import { checkUncheckedAnimations, uninterpretedDifference } from "./uninterpreted.js";

/** What an operation intends to change; everything else must stay as it was. */
export class Intent {
  readonly removedElements = new Set<ElementId>();
  /** Keyed by the id before the edit. */
  readonly elementFields = new Map<ElementId, Partial<ElementDigest>>();
  /** Canvas keys before the edit. */
  readonly removedRelationships = new Set<string>();
  readonly relationshipFields = new Map<string, Partial<RelationshipDigest>>();
  /** Keys of relationships the edit kept whose implied relationships may appear without a notice. */
  readonly impliedFrom = new Set<string>();
  /** Written views the edit wrote into: they may differ, but must still exist. */
  readonly touchedViews = new Set<ViewKey>();
  readonly removedViews = new Set<ViewKey>();
  /** Per view, elements whose animation terms the edit dropped because the view no longer shows them. */
  readonly droppedAnimationTerms = new Map<ViewKey, Set<ElementId>>();
  workspaceName: string | undefined;
  workspaceDescription: string | undefined;
  stylesMayChange = false;
  opaqueMayChange = false;
  /** Insert example: the text is replaced as a whole. */
  replacesEverything = false;
  readonly checks: ((after: ParseResult) => string | undefined)[] = [];
}

export interface Verified {
  readonly appeared: boolean;
}

function failure(detail: string): never {
  const error = new EditRefused(
    "verification-failed",
    "Couldn't write this change into the DSL. Edit the text instead.",
  );
  (error as EditRefused & { detail?: string }).detail = detail;
  throw error;
}

function renameAnchor(anchor: string, renames: readonly IdChange[]): string {
  let result = anchor;
  for (const change of renames) {
    if (change.kind !== "element") continue;
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_.-])${change.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z0-9_])`,
      "g",
    );
    result = result.replace(pattern, `$1${change.to}`);
  }
  return result;
}

/** Whether a compatibility error sits on the head of a statement with this role. */
function onStatement(
  parse: ParseResult,
  diagnostic: Diagnostic,
  role: "animationStep" | "noRelationship" | "dynamicStep",
): boolean {
  const sources = semanticSources(parse.sources);
  const code = role === "dynamicStep" ? "unresolved-reference" : "invalid-statement";
  if (sources === undefined || diagnostic.code !== code) return false;
  return sources.statements.some(
    (statement) =>
      sources.roleOf(statement) === role &&
      statement.head.start <= diagnostic.range.start &&
      diagnostic.range.end <= statement.head.end,
  );
}

/** The ranges of the result that the edits wrote, against the text before them. */
function writtenRanges(edits: readonly TextEdit[]): { start: number; end: number }[] {
  let shift = 0;
  return [...edits]
    .sort((left, right) => left.start - right.start)
    .map((edit) => {
      const start = edit.start + shift;
      shift += edit.insert.length - (edit.end - edit.start);
      return { start, end: start + edit.insert.length };
    });
}

/**
 * No error whose code and statement identity the input lacked (compared per code, never by
 * offset). An edit that rewrites a statement changes the identity of an error on it, so such an
 * error passes while its code doesn't occur more often than before; an error on a statement the
 * edit didn't write is new.
 */
function checkNoNewError(
  before: ParseResult,
  after: ParseResult,
  renames: readonly IdChange[],
  edits: readonly TextEdit[] | undefined,
): void {
  const written = edits === undefined ? undefined : writtenRanges(edits);
  const rewritten = (diagnostic: Diagnostic) =>
    written === undefined ||
    written.some(
      (range) => range.start <= diagnostic.range.end && diagnostic.range.start <= range.end,
    );
  const errors = (diagnostics: readonly Diagnostic[]) =>
    diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const beforeByCode = new Map<string, string[]>();
  for (const diagnostic of errors(before.diagnostics)) {
    beforeByCode.set(diagnostic.code, [
      ...(beforeByCode.get(diagnostic.code) ?? []),
      renameAnchor(diagnostic.anchor, renames),
    ]);
  }
  const afterByCode = new Map<string, Diagnostic[]>();
  for (const diagnostic of errors(after.diagnostics)) {
    afterByCode.set(diagnostic.code, [...(afterByCode.get(diagnostic.code) ?? []), diagnostic]);
  }
  for (const [code, diagnostics] of afterByCode) {
    const known = [...(beforeByCode.get(code) ?? [])];
    const fresh = diagnostics.filter((diagnostic) => {
      const index = known.indexOf(diagnostic.anchor);
      if (index === -1) return true;
      known.splice(index, 1);
      return false;
    });
    if (
      fresh.length === 0 ||
      (diagnostics.length <= (beforeByCode.get(code)?.length ?? 0) && fresh.every(rewritten))
    )
      continue;
    const first = fresh[0] as Diagnostic;
    if (code === "relationship-exists") {
      throw new EditRefused(
        "relationship-exists",
        "An implied relationship already connects these. Give the new one a description.",
      );
    }
    const step = fresh.find((diagnostic) => onStatement(after, diagnostic, "animationStep"));
    if (step !== undefined) {
      throw new EditRefused(
        "not-allowed",
        `The animation step on line ${step.line} would no longer add an element, and Structurizr refuses such a step. Edit the text instead.`,
      );
    }
    const exclusion = fresh.find((diagnostic) => onStatement(after, diagnostic, "noRelationship"));
    if (exclusion !== undefined) {
      throw new EditRefused(
        "not-allowed",
        `The “-/>” on line ${exclusion.line} would no longer find a relationship to remove, and Structurizr refuses it then. Edit the text instead.`,
      );
    }
    const dynamicStep = fresh.find((diagnostic) => onStatement(after, diagnostic, "dynamicStep"));
    if (dynamicStep !== undefined) {
      throw new EditRefused(
        "not-allowed",
        `The dynamic step on line ${dynamicStep.line} would no longer find the relationship it shows, and Structurizr refuses it then. Edit the text instead.`,
      );
    }
    failure(`new error ${code}: ${first.message} (${first.anchor})`);
  }
  const unresolved = (parse: ParseResult) =>
    parse.diagnostics.filter((diagnostic) => diagnostic.code === "unresolved-reference").length;
  if (unresolved(after) > unresolved(before)) failure("a reference no longer resolves");
}

function renamer(
  changes: readonly IdChange[],
): (id: ElementId | undefined) => ElementId | undefined {
  const map = new Map<ElementId, ElementId>();
  for (const change of changes) if (change.kind === "element") map.set(change.from, change.to);
  return (id) => (id === undefined ? undefined : (map.get(id) ?? id));
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Map) {
    return `{${[...(value as Map<unknown, unknown>)]
      .map(([key, entry]) => `${JSON.stringify(String(key))}:${canonical(entry)}`)
      .sort()
      .join(",")}}`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

/** The expected digest: the one before with the intended changes; created items as they came out. */
function expectedDigest(
  before: ParseResult,
  after: ParseResult,
  intent: Intent,
  changes: readonly IdChange[],
  created: { readonly elements: readonly ElementId[]; readonly relationships: readonly string[] },
): SemanticDigest {
  const previous = semanticDigest(before.workspace);
  const next = semanticDigest(after.workspace);
  const rename = renamer(changes);
  const elements = new Map<ElementId, ElementDigest>();
  for (const [id, digest] of previous.elements) {
    if (intent.removedElements.has(id)) continue;
    elements.set(rename(id) as ElementId, {
      ...digest,
      parentId: rename(digest.parentId),
      ...intent.elementFields.get(id),
    });
  }
  for (const id of created.elements) {
    const digest = next.elements.get(id);
    if (digest === undefined) failure(`the created element ${id} is missing`);
    elements.set(id, digest);
  }
  const identifiersAfter = new Set(
    after.workspace.relationships.flatMap((relationship) => relationship.identifier ?? []),
  );
  const finalKey = (canvasKey: string) => {
    let current = canvasKey;
    for (const change of changes)
      if (change.kind === "relationship" && change.from === current) current = change.to;
    return current;
  };
  const relationships: RelationshipDigest[] = [];
  const explicitBefore = before.workspace.relationships.filter(
    (relationship) => !relationship.implied,
  );
  explicitBefore.forEach((relationship, index) => {
    if (intent.removedRelationships.has(relationship.canvasKey)) return;
    const digest = previous.relationships[index] as RelationshipDigest;
    relationships.push({
      ...digest,
      identifier: identifiersAfter.has(finalKey(relationship.canvasKey))
        ? finalKey(relationship.canvasKey)
        : digest.identifier,
      sourceId: rename(digest.sourceId) as ElementId,
      destinationId: rename(digest.destinationId) as ElementId,
      ...intent.relationshipFields.get(relationship.canvasKey),
    });
  });
  const explicitAfter = after.workspace.relationships.filter(
    (relationship) => !relationship.implied,
  );
  for (const key of created.relationships) {
    const index = explicitAfter.findIndex((relationship) => relationship.canvasKey === key);
    const digest = next.relationships[index];
    if (digest === undefined) failure(`the created relationship ${key} is missing`);
    relationships.push(digest);
  }
  const views = new Map<ViewKey, ViewDigest>();
  for (const [key, digest] of previous.views) {
    if (intent.removedViews.has(key)) continue;
    if (intent.touchedViews.has(key)) continue;
    views.set(key, { ...digest, scopeId: rename(digest.scopeId) });
  }
  for (const [key, digest] of next.views) {
    if (intent.touchedViews.has(key) || !previous.views.has(key)) views.set(key, digest);
  }
  for (const key of intent.touchedViews) {
    if (!intent.removedViews.has(key) && previous.views.has(key) && !next.views.has(key)) {
      failure(`the view ${key} went missing`);
    }
  }
  return {
    name: intent.workspaceName ?? previous.name,
    description: intent.workspaceDescription ?? previous.description,
    elements,
    relationships,
    views,
    styles: intent.stylesMayChange ? next.styles : previous.styles,
    opaque:
      intent.opaqueMayChange ||
      intent.removedElements.size > 0 ||
      intent.removedRelationships.size > 0
        ? next.opaque
        : previous.opaque,
  };
}

function describeDifference(expected: SemanticDigest, actual: SemanticDigest): string {
  if (expected.name !== actual.name || expected.description !== actual.description)
    return "workspace name or description";
  if (expected.styles !== actual.styles) return "styles";
  for (const [id, digest] of expected.elements) {
    if (canonical(digest) !== canonical(actual.elements.get(id))) return `element ${id}`;
  }
  for (const id of actual.elements.keys())
    if (!expected.elements.has(id)) return `unexpected element ${id}`;
  for (const [key, digest] of expected.views) {
    if (canonical(digest) !== canonical(actual.views.get(key))) return `view ${key}`;
  }
  for (const key of actual.views.keys())
    if (!expected.views.has(key)) return `unexpected view ${key}`;
  if (canonical(expected.opaque) !== canonical(actual.opaque))
    return "content the modeler doesn't read";
  return "relationships";
}

type Pair = {
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
  readonly description: string;
  readonly impliedBy: string | undefined;
};

function implied(
  workspace: Workspace,
  rename: (id: ElementId | undefined) => ElementId | undefined,
): Pair[] {
  return workspace.relationships
    .filter((relationship) => relationship.implied)
    .map((relationship) => ({
      sourceId: rename(relationship.sourceId) as ElementId,
      destinationId: rename(relationship.destinationId) as ElementId,
      description: relationship.description,
      impliedBy: relationship.impliedBy,
    }));
}

function selfAndAncestors(workspace: Workspace, id: ElementId): Set<ElementId> {
  const result = new Set<ElementId>([id]);
  const parents = new Map(workspace.elements.map((element) => [element.id, element.parentId]));
  for (let current = parents.get(id); current !== undefined; current = parents.get(current))
    result.add(current);
  return result;
}

/**
 * Implied relationships may differ only for pairs around an end of a relationship the edit
 * added, removed or changed (SPEC 3.4 step 4); returns whether one appeared that none of
 * `origins` (the created relationships, and those the edit moved) implies.
 */
function checkImpliedFrame(
  before: ParseResult,
  after: ParseResult,
  changes: readonly IdChange[],
  origins: readonly string[],
): boolean {
  const rename = renamer(changes);
  const key = (pair: Pair) =>
    `${pair.sourceId}\u0000${pair.destinationId}\u0000${pair.description}`;
  const previous = implied(before.workspace, rename);
  const next = implied(after.workspace, (id) => id);
  const previousKeys = new Set(previous.map(key));
  const nextKeys = new Set(next.map(key));
  const explicitKey = (
    relationship: Workspace["relationships"][number],
    map: (id: ElementId | undefined) => ElementId | undefined,
  ) =>
    canonical({
      s: map(relationship.sourceId),
      d: map(relationship.destinationId),
      x: relationship.description,
      t: relationship.technology,
    });
  const explicitBefore = before.workspace.relationships.filter(
    (relationship) => !relationship.implied,
  );
  const explicitAfter = after.workspace.relationships.filter(
    (relationship) => !relationship.implied,
  );
  const beforeSet = new Set(
    explicitBefore.map((relationship) => explicitKey(relationship, rename)),
  );
  const afterSet = new Set(
    explicitAfter.map((relationship) => explicitKey(relationship, (id) => id)),
  );
  const changed = [
    ...explicitBefore
      .filter((relationship) => !afterSet.has(explicitKey(relationship, rename)))
      .map((relationship) => ({
        sourceId: rename(relationship.sourceId) as ElementId,
        destinationId: rename(relationship.destinationId) as ElementId,
        workspace: before.workspace,
        map: rename,
      })),
    ...explicitAfter
      .filter((relationship) => !beforeSet.has(explicitKey(relationship, (id) => id)))
      .map((relationship) => ({
        sourceId: relationship.sourceId,
        destinationId: relationship.destinationId,
        workspace: after.workspace,
        map: (id: ElementId | undefined) => id,
      })),
  ];
  const existing = new Set(after.workspace.elements.map((element) => element.id));
  const allowed = (pair: Pair) =>
    !existing.has(pair.sourceId) ||
    !existing.has(pair.destinationId) ||
    changed.some((relationship) => {
      const sources = new Set([
        ...selfAndAncestors(after.workspace, relationship.sourceId),
        ...[...selfAndAncestors(before.workspace, relationship.sourceId)].map(
          (id) => rename(id) as ElementId,
        ),
      ]);
      const destinations = new Set([
        ...selfAndAncestors(after.workspace, relationship.destinationId),
        ...[...selfAndAncestors(before.workspace, relationship.destinationId)].map(
          (id) => rename(id) as ElementId,
        ),
      ]);
      return (
        (sources.has(pair.sourceId) && destinations.has(pair.destinationId)) ||
        (sources.has(pair.destinationId) && destinations.has(pair.sourceId))
      );
    });
  for (const pair of previous) {
    if (!nextKeys.has(key(pair)) && !allowed(pair))
      failure(`the implied relationship ${pair.sourceId} -> ${pair.destinationId} went`);
  }
  let appeared = false;
  for (const pair of next) {
    if (previousKeys.has(key(pair))) continue;
    if (!allowed(pair))
      failure(`the implied relationship ${pair.sourceId} -> ${pair.destinationId} appeared`);
    if (pair.impliedBy === undefined || !origins.includes(pair.impliedBy)) appeared = true;
  }
  return appeared;
}

/** Throws `EditRefused` when the result fails a check; tells whether an implied relationship appeared. */
export function verify(
  before: ParseResult,
  after: ParseResult,
  intent: Intent,
  changes: readonly IdChange[],
  created: { readonly elements: readonly ElementId[]; readonly relationships: readonly string[] },
  edits?: readonly TextEdit[],
): Verified {
  if (!after.ok) {
    const reason = after.diagnostics.find((diagnostic) => diagnostic.rejects);
    failure(`the result doesn't import: ${reason?.code ?? ""} ${reason?.message ?? ""}`);
  }
  checkNoNewError(before, after, changes, edits);
  if (intent.replacesEverything) {
    for (const check of intent.checks) {
      const problem = check(after);
      if (problem !== undefined) failure(problem);
    }
    return { appeared: false };
  }
  const expected = expectedDigest(before, after, intent, changes, created);
  const actual = semanticDigest(after.workspace);
  if (!sameDigest(expected, actual))
    failure(`frame condition: ${describeDifference(expected, actual)}`);
  const unread = uninterpretedDifference(before, after, intent, changes);
  if (unread !== undefined) failure(`frame condition: ${unread}`);
  const appeared = checkImpliedFrame(before, after, changes, [
    ...created.relationships,
    ...intent.impliedFrom,
  ]);
  checkUncheckedAnimations(before, after, intent, changes);
  for (const check of intent.checks) {
    const problem = check(after);
    if (problem !== undefined) failure(problem);
  }
  return { appeared };
}
