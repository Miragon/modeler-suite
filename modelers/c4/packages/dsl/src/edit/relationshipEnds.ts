/*
 * Moving one end of an explicit relationship one level down, from a software system to one of its
 * containers or from a container to one of its components: Structurizr implies relationships
 * upward only, so one written on the element itself never shows in the views inside it. The end's
 * token is rewritten in place (an implicit `-> x` in the element's block gains the child as its
 * source), so the identifier, the values and the block of the statement stay byte for byte.
 */
import {
  elementLayoutKey,
  relationshipLayoutKey,
  type Box,
  type ElementId,
  type Relationship,
} from "@miragon/c4-schema-model";
import type { C4Edit, Statement } from "../types.js";
import type { Draft } from "./draft.js";
import { KIND_WORDS, lineOf } from "./elements.js";
import { ensureIdentifiers } from "./identifiers.js";
import { replaceToken } from "./place.js";
import { refuse } from "./refusal.js";
import {
  encodeBox,
  isPinned,
  nameRelationship,
  pin,
  prepareView,
  renameViewProperties,
  setViewProperties,
} from "./views.js";

type MoveEdit = Extract<C4Edit, { type: "moveRelationshipEnd" }>;

function nameOf(draft: Draft, id: ElementId): string {
  return draft.element(id)?.name ?? id;
}

function unnamedBetween(draft: Draft, sourceId: ElementId, destinationId: ElementId): string[] {
  return draft.workspace.relationships
    .filter(
      (relationship) =>
        !relationship.implied &&
        relationship.identifier === undefined &&
        relationship.sourceId === sourceId &&
        relationship.destinationId === destinationId,
    )
    .map((relationship) => relationship.canvasKey);
}

/** What the move keeps of the relationship, for the read-back check. */
function keptValues(relationship: Relationship): string {
  return JSON.stringify({
    description: relationship.description,
    technology: relationship.technology,
    tags: relationship.tags,
    url: relationship.url ?? null,
    properties: Object.entries(relationship.properties ?? {}).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  });
}

/**
 * Structurizr evaluates `!relationships` at its line, by the ends among other things, and the
 * modeler doesn't: a moved relationship may change what one selects, or leave it selecting
 * nothing, which Structurizr refuses.
 */
function bulkRelationshipsLine(draft: Draft): number | undefined {
  for (const { node } of draft.sources.opaque()) {
    if (node.kind !== "statement" || draft.sources.roleOf(node) !== "bulk") continue;
    if (node.tokens[0]?.value.toLowerCase() === "!relationships")
      return lineOf(draft.text, node.range.start);
  }
  return undefined;
}

function checkMovable(draft: Draft, relationship: Relationship, edit: MoveEdit): void {
  const fromId = edit.end === "source" ? relationship.sourceId : relationship.destinationId;
  const child = draft.element(edit.to);
  if (child === undefined) refuse("not-allowed", `There is no element ${edit.to} in the model.`);
  if (child.parentId !== fromId) {
    refuse("not-allowed", `${child.name} isn't inside ${nameOf(draft, fromId)}.`);
  }
  const sourceId = edit.end === "source" ? edit.to : relationship.sourceId;
  const destinationId = edit.end === "destination" ? edit.to : relationship.destinationId;
  const duplicate = draft.workspace.relationships.some(
    (other) =>
      other.sourceId === sourceId &&
      other.destinationId === destinationId &&
      other.description === relationship.description,
  );
  if (duplicate) {
    refuse(
      "relationship-exists",
      `${nameOf(draft, sourceId)} → ${nameOf(draft, destinationId)} exists already with this description.`,
    );
  }
  const step = draft.sources
    .dynamicSteps()
    .find((candidate) => candidate.relationship === relationship.canvasKey);
  if (step !== undefined) {
    refuse(
      "not-allowed",
      `The dynamic view “${step.view}” shows this relationship, and its step would no longer match it. Edit the text instead.`,
    );
  }
  const site = draft.sources.relationshipSite(relationship.canvasKey);
  if (site === undefined) refuse("verification-failed", "The relationship's statement is missing.");
  const byName = site.reopens.find((reopen) =>
    (reopen.tokens[1]?.value ?? "").startsWith("Relationship://"),
  );
  if (byName !== undefined) {
    refuse(
      "not-allowed",
      `The “!relationship” on line ${lineOf(draft.text, byName.range.start)} names this relationship by its ends, so it would no longer find it. Edit the text instead.`,
    );
  }
  const bulkLine = bulkRelationshipsLine(draft);
  if (bulkLine !== undefined) {
    refuse(
      "not-allowed",
      `The “!relationships” on line ${bulkLine} selects relationships by their ends, and the modeler can't tell what it selects once this one moves. Edit the text instead.`,
    );
  }
  const token = endToken(site.form, site.statement, edit.end);
  if (token?.substitutes === true) {
    refuse(
      "not-allowed",
      `This end is set with the constant “${token.raw}”. Edit the text instead.`,
    );
  }
  const definition = draft.sources.elementSite(edit.to)?.definition;
  if (definition === undefined || definition.range.start > site.statement.range.start) {
    refuse(
      "not-allowed",
      `${child.name} is defined below this relationship, and Structurizr reads top to bottom. Move the relationship below ${child.name} in the text, or choose another ${KIND_WORDS[child.kind]}.`,
    );
  }
}

/**
 * What each dynamic step shows, in document order: the ends and values of its relationship. A
 * step written by its ends shows the first relationship between them (the one with its
 * description first), so a relationship moved in between them may take a step over.
 */
function stepRelationships(draft: Draft): (string | undefined)[] {
  const byKey = new Map(
    draft.workspace.relationships.map((relationship) => [relationship.canvasKey, relationship]),
  );
  return draft.sources.dynamicSteps().map(({ relationship }) => {
    const shown = relationship === undefined ? undefined : byKey.get(relationship);
    return (
      shown &&
      JSON.stringify([shown.sourceId, shown.destinationId, shown.description, shown.technology])
    );
  });
}

/** The token that names the end; undefined for the scope of an implicit relationship's source. */
function endToken(
  form: "explicit" | "implicit",
  statement: Statement,
  end: "source" | "destination",
) {
  if (form === "explicit") return statement.tokens[end === "source" ? 0 : 2];
  return end === "source" ? undefined : statement.tokens[1];
}

/** The text edit that names the child at the end: its token rewritten, or put before `->`. */
function endEdit(draft: Draft, canvasKey: string, end: "source" | "destination", to: ElementId) {
  const site = draft.sources.relationshipSite(canvasKey);
  if (site === undefined) refuse("verification-failed", "The relationship's statement is missing.");
  const token = endToken(site.form, site.statement, end);
  if (token !== undefined) return replaceToken(token, to);
  const operator = site.statement.tokens[0];
  if (operator === undefined) refuse("verification-failed", "The relationship has no operator.");
  return { start: operator.range.start, end: operator.range.start, insert: `${to} ` };
}

/** SPEC 3.4 `moveRelationshipEnd`. */
export function moveRelationshipEnd(draft: Draft, edit: MoveEdit): void {
  const original = draft.relationship(edit.key);
  if (original === undefined) refuse("not-allowed", "There is no such relationship in the model.");
  if (original.implied) {
    refuse(
      "not-allowed",
      "An implied relationship comes from another one. Move that relationship instead.",
    );
  }
  checkMovable(draft, original, edit);
  const steps = draft.sources
    .dynamicSteps()
    .map(({ view, statement }) => ({ view, line: lineOf(draft.text, statement.range.start) }));
  const view = draft.context.view;
  const entry = draft.view(view);
  if (entry === undefined || !entry.editable) {
    refuse("view-not-editable", "This view can't be edited on the canvas. Edit it in the text.");
  }
  const originalKey = original.canvasKey;
  const oldSourceId = original.sourceId;
  const oldDestinationId = original.destinationId;
  const sourceId = edit.end === "source" ? edit.to : oldSourceId;
  const destinationId = edit.end === "destination" ? edit.to : oldDestinationId;
  const kept = keptValues(original);

  prepareView(draft, view);
  pin(draft, view);
  ensureIdentifiers(draft, [edit.to]);
  let key = draft.relationshipKeyNow(originalKey);
  const ambiguous =
    unnamedBetween(draft, oldSourceId, oldDestinationId).length > 1 ||
    unnamedBetween(draft, sourceId, destinationId).length > 0;
  if (original.identifier === undefined && ambiguous) {
    key = nameRelationship(draft, key, { sourceId, destinationId });
  }
  const identifier = draft.relationship(key)?.identifier;
  const layoutKeyBefore = draft.relationship(key)?.key;
  const shownBefore = new Set(draft.members(view)?.elements ?? []);
  const stepsBefore = stepRelationships(draft);

  draft.apply([endEdit(draft, key, edit.end, edit.to)]);

  const stepsAfter = stepRelationships(draft);
  const taken = stepsBefore.findIndex(
    (shown, index) => shown !== undefined && shown !== stepsAfter[index],
  );
  const step = steps[taken];
  if (step !== undefined) {
    refuse(
      "not-allowed",
      `The step on line ${step.line} of the dynamic view “${step.view}” would show another relationship once this one moves. Edit the text instead.`,
    );
  }

  const moved = draft.relationship(identifier ?? `${sourceId}->${destinationId}`);
  if (
    moved === undefined ||
    moved.implied ||
    moved.sourceId !== sourceId ||
    moved.destinationId !== destinationId
  ) {
    refuse("verification-failed", "The relationship could not be moved.");
  }
  if (moved.canvasKey !== key)
    draft.rename({ kind: "relationship", from: key, to: moved.canvasKey });
  draft.intent.relationshipFields.set(
    originalKey,
    edit.end === "source" ? { sourceId: edit.to } : { destinationId: edit.to },
  );
  if (moved.key !== undefined) draft.intent.impliedFrom.add(moved.key);

  if (layoutKeyBefore !== undefined) {
    followLayoutKeys(draft, layoutKeyBefore, `implied:${oldSourceId}->${oldDestinationId}`);
  }
  const boxes = writeArrivals(draft, view, shownBefore, edit.boxes);

  const finalKey = moved.canvasKey;
  draft.intent.checks.push((after) => {
    const relationship = after.workspace.relationships.find(
      (candidate) => candidate.canvasKey === finalKey,
    );
    if (
      relationship === undefined ||
      relationship.implied ||
      relationship.sourceId !== sourceId ||
      relationship.destinationId !== destinationId
    ) {
      return `the moved relationship ${finalKey} doesn't resolve`;
    }
    if (relationship.identifier !== identifier || keptValues(relationship) !== kept) {
      return `the moved relationship ${finalKey} changed besides its end`;
    }
    const definition = after.workspace.views.find((candidate) => candidate.key === view);
    for (const [name, value] of boxes) {
      if (definition?.properties[name] !== value) return `the layout key ${name} doesn't read back`;
    }
    return undefined;
  });
}

/**
 * The relationship's bends in every view that drew it. No static view draws an element and its
 * child together, so none draws the moved relationship there: the bends go to the implied
 * relationship that takes its place between the old ends, else they go, so no key is left that
 * names nothing.
 */
function followLayoutKeys(draft: Draft, layoutKeyBefore: string, impliedKey: string): void {
  const from = relationshipLayoutKey(layoutKeyBefore);
  const to = relationshipLayoutKey(impliedKey);
  for (const definition of draft.workspace.views) {
    if (definition.properties[from] === undefined) continue;
    const shown = draft.members(definition.key)?.relationships ?? [];
    const implied =
      shown.includes(impliedKey) &&
      draft.relationship(impliedKey)?.key === impliedKey &&
      definition.properties[to] === undefined;
    if (implied) renameViewProperties(draft, definition.key, new Map([[from, to]]));
    else setViewProperties(draft, definition.key, new Map([[from, null]]));
  }
}

/**
 * The elements the move brings into the pinned current view get the boxes the canvas drew them
 * at, so they don't move once the next edit pins them.
 */
function writeArrivals(
  draft: Draft,
  view: string,
  shownBefore: ReadonlySet<ElementId>,
  boxes: ReadonlyMap<ElementId, Box> | undefined,
): Map<string, string> {
  if (boxes === undefined || boxes.size === 0 || !isPinned(draft, view)) return new Map();
  const stored = draft.workspace.views.find((candidate) => candidate.key === view)?.properties;
  const arrived = (draft.members(view)?.elements ?? []).filter(
    (id) => !shownBefore.has(id) && boxes.has(id) && stored?.[elementLayoutKey(id)] === undefined,
  );
  if (arrived.length === 0) return new Map();
  ensureIdentifiers(draft, arrived);
  const changes = new Map(
    arrived.map((id) => [elementLayoutKey(id), encodeBox(draft, id, boxes.get(id) as Box)]),
  );
  setViewProperties(draft, view, changes);
  return changes;
}
