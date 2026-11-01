/*
 * Relationship operations (SPEC 3.4, 3.5 rule 4): a new relationship at model level after both
 * definitions, at the end of the relationship run and ahead of the deployment environments, and
 * edits of a relationship's description, technology, tags and URL in their effective sources.
 */
import { deriveIdentifier, type ElementId, type Relationship } from "@miragon/c4-schema-model";
import type { C4Edit, ParseResult, RelationshipFields, Statement } from "../types.js";
import { parseWorkspace } from "../parse.js";
import type { Draft } from "./draft.js";
import { checkUrl } from "./elements.js";
import { ensureIdentifiers, identifierRegister } from "./identifiers.js";
import {
  addChildren,
  block,
  canOpenInPlace,
  codeChildren,
  insertAfter,
  oneLine,
  removals,
  removeToken,
  replaceToken,
} from "./place.js";
import { refuse } from "./refusal.js";
import { applyTextEdits } from "./textEdits.js";
import { ensureModel, nameRelationship, pin, prepareView, writeValueToken } from "./views.js";
import { quote, unrepresentable } from "./write.js";

function ancestors(draft: Draft, id: ElementId): ElementId[] {
  const result: ElementId[] = [];
  for (
    let current = draft.element(id)?.parentId;
    current !== undefined;
    current = draft.element(current)?.parentId
  ) {
    result.push(current);
  }
  return result;
}

function existsMessage(existing: Relationship): string {
  if (existing.implied)
    return "An implied relationship already connects these. Give the new one a description.";
  return existing.description === ""
    ? "These are already connected by a relationship without a description."
    : "These are already connected by a relationship with this description.";
}

/** The index in the model's top-level children of the node that holds a statement. */
function topIndex(
  draft: Draft,
  model: Statement,
  children: readonly unknown[],
  statement: Statement,
): number {
  let node: Statement | undefined = statement;
  while (node !== undefined && draft.sources.parentOf(node) !== model)
    node = draft.sources.parentOf(node);
  return node === undefined ? -1 : children.indexOf(node);
}

/** SPEC 3.4 `createRelationship`, placed by rule 4 of 3.5. */
export function createRelationship(
  draft: Draft,
  edit: Extract<C4Edit, { type: "createRelationship" }>,
): void {
  const source = draft.requireElement(edit.sourceId);
  const destination = draft.requireElement(edit.destinationId);
  if (source.id === destination.id)
    refuse("not-allowed", "An element can't have a relationship to itself.");
  if (
    ancestors(draft, source.id).includes(destination.id) ||
    ancestors(draft, destination.id).includes(source.id)
  ) {
    refuse(
      "not-allowed",
      "Structurizr refuses a relationship between an element and its parent or child.",
    );
  }
  const description = edit.description ?? "";
  const technology = edit.technology ?? "";
  for (const value of [description, technology]) {
    const reason = unrepresentable(value);
    if (reason !== undefined) refuse("unrepresentable-value", reason);
  }
  const existing = draft.workspace.relationships.find(
    (relationship) =>
      relationship.sourceId === source.id &&
      relationship.destinationId === destination.id &&
      relationship.description === description,
  );
  if (existing !== undefined) refuse("relationship-exists", existsMessage(existing));
  const view = draft.context.view;
  const entry = draft.view(view);
  if (entry === undefined || !entry.editable) {
    refuse("view-not-editable", "This view can't be edited on the canvas. Edit it in the text.");
  }
  prepareView(draft, view);
  pin(draft, view);
  ensureIdentifiers(draft, [source.id, destination.id]);
  const unnamedPair = draft.workspace.relationships.some(
    (relationship) =>
      !relationship.implied &&
      relationship.identifier === undefined &&
      relationship.sourceId === source.id &&
      relationship.destinationId === destination.id,
  );
  const identifier = unnamedPair
    ? deriveIdentifier(
        `${source.id} to ${destination.id}`,
        "custom",
        identifierRegister(draft),
        "flat",
      )
    : undefined;
  const values = [
    ...(description !== "" || technology !== "" ? [quote(description)] : []),
    ...(technology !== "" ? [quote(technology)] : []),
  ];
  const text = [
    ...(identifier === undefined ? [] : [`${identifier} =`]),
    source.id,
    "->",
    destination.id,
    ...values,
  ].join(" ");
  const model = ensureModel(draft);
  const children = codeChildren(model);
  const definitionOf = (id: ElementId) => draft.sources.elementSite(id)?.definition;
  const sourceTop = topIndex(draft, model, children, definitionOf(source.id) as Statement);
  const destinationTop = topIndex(
    draft,
    model,
    children,
    definitionOf(destination.id) as Statement,
  );
  const environment = children.findIndex(
    (child) =>
      child.kind === "statement" && draft.sources.roleOf(child) === "deploymentEnvironment",
  );
  const deployment = environment === -1 ? Number.POSITIVE_INFINITY : environment;
  let run = -1;
  children.forEach((child, index) => {
    if (
      index < deployment &&
      child.kind === "statement" &&
      draft.sources.roleOf(child) === "relationship"
    )
      run = index;
  });
  const anchor = children[Math.max(sourceTop, destinationTop, run)];
  if (anchor === undefined)
    refuse("verification-failed", "There is no place for the relationship.");
  if (sourceTop > deployment || destinationTop > deployment)
    draft.notices.add("relationship-after-deployment");
  const before = draft.parse;
  draft.apply([insertAfter(draft, anchor, [oneLine(text)])]);
  const created = draft.workspace.relationships.find((relationship) =>
    identifier === undefined
      ? !relationship.implied && relationship.key === `${source.id}->${destination.id}`
      : relationship.identifier === identifier,
  );
  if (created === undefined) {
    refuseDuplicate(draft, before, source.id, destination.id);
    refuse("verification-failed", "The new relationship could not be written.");
  }
  draft.created.relationships.push(created.canvasKey);
  const canvasKey = created.canvasKey;
  draft.intent.checks.push((after) => {
    const relationship = after.workspace.relationships.find(
      (candidate) => candidate.canvasKey === canvasKey,
    );
    const resolves =
      relationship !== undefined &&
      !relationship.implied &&
      relationship.sourceId === source.id &&
      relationship.destinationId === destination.id &&
      (description === "" || relationship.description === description) &&
      (technology === "" || relationship.technology === technology);
    return resolves ? undefined : `the created relationship ${canvasKey} doesn't resolve`;
  });
}

/**
 * A relationship archetype's default description can make the written statement a duplicate
 * that Structurizr refuses ("already exists"); the builder then reports it instead of creating it.
 */
function refuseDuplicate(
  draft: Draft,
  before: ParseResult,
  sourceId: ElementId,
  destinationId: ElementId,
): void {
  const count = (parse: ParseResult) =>
    parse.diagnostics.filter((diagnostic) => diagnostic.code === "relationship-exists").length;
  if (count(draft.parse) <= count(before)) return;
  const pair = draft.workspace.relationships.filter(
    (relationship) =>
      relationship.sourceId === sourceId && relationship.destinationId === destinationId,
  );
  const existing = pair.find((relationship) => relationship.implied) ?? pair[0];
  refuse(
    "relationship-exists",
    existing === undefined
      ? "These are already connected by a relationship with this description."
      : existsMessage(existing),
  );
}

type RelationshipField = keyof RelationshipFields;

function relationshipValue(relationship: Relationship, field: RelationshipField): string {
  if (field === "tags") return relationship.tags.filter((tag) => tag !== "Relationship").join(",");
  if (field === "url") return relationship.url ?? "";
  return relationship[field];
}

/** SPEC 3.4 `updateRelationship` (`key` is the canvas key). */
export function updateRelationship(
  draft: Draft,
  edit: Extract<C4Edit, { type: "updateRelationship" }>,
): void {
  const relationship = draft.relationship(edit.key);
  if (relationship === undefined)
    refuse("not-allowed", "There is no such relationship in the model.");
  if (relationship.implied) {
    refuse(
      "not-allowed",
      "An implied relationship comes from another one. Edit that relationship instead.",
    );
  }
  const changes = new Map<RelationshipField, string>();
  const { description, technology, tags, url } = edit.fields;
  if (description !== undefined && description !== relationship.description)
    changes.set("description", description);
  if (technology !== undefined && technology !== relationship.technology)
    changes.set("technology", technology);
  if (tags !== undefined) {
    const cleaned = [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))];
    if (cleaned.some((tag) => tag.includes(","))) {
      refuse(
        "unrepresentable-value",
        "A tag can't contain a comma: Structurizr splits tags at commas.",
      );
    }
    if (cleaned.join(",") !== relationshipValue(relationship, "tags"))
      changes.set("tags", cleaned.join(","));
  }
  if (url !== undefined && (url ?? "") !== (relationship.url ?? "")) changes.set("url", url ?? "");
  if (changes.size === 0) return;
  for (const [field, value] of changes) {
    const source = relationship.fields[field];
    if (relationship.bulk || !source.editable) {
      refuse(
        "field-not-editable",
        "This relationship is set by a statement the canvas can't edit. Edit the text instead.",
      );
    }
    const reason = unrepresentable(value);
    if (reason !== undefined) refuse("unrepresentable-value", reason);
    if (field === "url" && value !== "") checkUrl(value);
  }
  const newDescription = changes.get("description");
  if (newDescription !== undefined) {
    const clash = draft.workspace.relationships.find(
      (other) =>
        other.canvasKey !== relationship.canvasKey &&
        other.sourceId === relationship.sourceId &&
        other.destinationId === relationship.destinationId &&
        other.description === newDescription,
    );
    if (clash !== undefined) refuse("relationship-exists", existsMessage(clash));
  }
  let canvasKey = edit.key;
  for (const [field, value] of changes)
    canvasKey = writeRelationshipField(draft, canvasKey, field, value);
}

const POSITIONAL_OFFSET: Readonly<Partial<Record<RelationshipField, number>>> = {
  description: 0,
  technology: 1,
  tags: 2,
};

/** Writes one field where it is effective; returns the relationship's canvas key afterwards. */
function writeRelationshipField(
  draft: Draft,
  key: string,
  field: RelationshipField,
  value: string,
): string {
  let canvasKey = key;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const relationship = draft.relationship(canvasKey);
    const site = draft.sources.relationshipSite(canvasKey);
    if (relationship === undefined || site === undefined)
      refuse("verification-failed", "The relationship's statement is missing.");
    if (relationshipValue(relationship, field) === value) return canvasKey;
    const source = relationship.fields[field];
    const statement = draft.sources.statementAt(source.statement);
    const firstSlot = site.form === "explicit" ? 3 : 2;
    const offset = POSITIONAL_OFFSET[field];
    if (source.form === "positional" && statement !== undefined && source.token !== undefined) {
      if (value === "")
        clearRelationshipPositional(draft, canvasKey, field, statement, source.token, firstSlot);
      else writeValueToken(draft, statement, source.token, value);
      continue;
    }
    if ((source.form === "statement" || source.form === "reopen") && statement !== undefined) {
      if (value === "") draft.apply(removals(draft.text, [statement]));
      else if (field === "tags") {
        const first = statement.tokens[1];
        const last = statement.tokens.at(-1);
        if (first === undefined || last === undefined)
          refuse("verification-failed", "The tags statement is empty.");
        draft.apply([{ start: first.range.start, end: last.range.end, insert: quote(value) }]);
      } else writeValueToken(draft, statement, 1, value);
      continue;
    }
    if (value === "" && source.form === "absent") return canvasKey;
    if (field === "url" || offset === undefined) {
      canvasKey = addRelationshipChild(draft, canvasKey, `${field} ${quote(value)}`);
      continue;
    }
    const tokens = site.statement.tokens;
    const slot = firstSlot + offset;
    if (tokens[slot] !== undefined) {
      writeValueToken(draft, site.statement, slot, value);
      continue;
    }
    const last = tokens.at(-1);
    if (last === undefined || last.textBlock) {
      if (field === "tags") {
        canvasKey = addRelationshipChild(draft, canvasKey, `tags ${quote(value)}`);
        continue;
      }
      refuse(
        "not-allowed",
        "This field can't be written after a text block. Edit the text instead.",
      );
    }
    const fieldAt = (position: number) =>
      (Object.keys(POSITIONAL_OFFSET) as RelationshipField[]).find(
        (name) => firstSlot + (POSITIONAL_OFFSET[name] ?? 0) === position,
      );
    const placeholders = Array.from({ length: slot - tokens.length }, (_, index) => {
      const skipped = fieldAt(tokens.length + index);
      return skipped !== undefined && relationship.fields[skipped].form === "archetype"
        ? quote(relationshipValue(relationship, skipped))
        : '""';
    });
    draft.apply([
      {
        start: last.range.end,
        end: last.range.end,
        insert: ` ${[...placeholders, quote(value)].join(" ")}`,
      },
    ]);
  }
  const relationship = draft.relationship(canvasKey);
  if (relationship === undefined || relationshipValue(relationship, field) !== value) {
    refuse(
      "field-not-editable",
      "This value comes from a default that can't be changed here. Edit the text instead.",
    );
  }
  return canvasKey;
}

/**
 * The last positional goes with the trailing `""` placeholders before it, except those that
 * keep an archetype default away (removing them would change that field).
 */
function clearRelationshipPositional(
  draft: Draft,
  canvasKey: string,
  field: RelationshipField,
  statement: Statement,
  index: number,
  firstSlot: number,
): void {
  const tokens = statement.tokens;
  const token = tokens[index];
  if (token === undefined) return;
  if (index !== tokens.length - 1) {
    draft.apply([replaceToken(token, '""')]);
    return;
  }
  let first = index;
  while (first > firstSlot && tokens[first - 1]?.raw === '""') first -= 1;
  const removal = (from: number) => ({
    start: removeToken(draft.text, tokens[from] ?? token).start,
    end: token.range.end,
    insert: "",
  });
  const before = draft.relationship(canvasKey);
  const others = (["description", "technology", "tags"] as const).filter((name) => name !== field);
  for (let candidate = first; candidate < index; candidate += 1) {
    const edit = removal(candidate);
    const after = parseWorkspace(applyTextEdits(draft.text, [edit])).workspace.relationships.find(
      (relationship) => relationship.canvasKey === canvasKey,
    );
    const kept =
      before !== undefined &&
      after !== undefined &&
      others.every((name) => relationshipValue(after, name) === relationshipValue(before, name));
    if (kept) {
      draft.apply([edit]);
      return;
    }
  }
  draft.apply([removal(index)]);
}

/**
 * A child statement of a relationship: in its block, opened in place, or an `!relationship`
 * re-open, which names an unnamed relationship first; returns its canvas key afterwards.
 */
function addRelationshipChild(draft: Draft, canvasKey: string, line: string): string {
  const site = draft.sources.relationshipSite(canvasKey);
  if (site === undefined) refuse("verification-failed", "The relationship's statement is missing.");
  if (site.statement.block !== undefined || canOpenInPlace(site.statement)) {
    const edit = addChildren(draft, site.statement, [oneLine(line)], "last");
    if (edit === undefined) refuse("not-allowed", "This relationship's line can't be opened.");
    draft.apply([edit]);
    return canvasKey;
  }
  const identifier = nameRelationship(draft, canvasKey);
  const named = draft.sources.relationshipSite(identifier);
  if (named === undefined)
    refuse("verification-failed", "The relationship's statement is missing.");
  draft.apply([
    insertAfter(draft, named.statement, [block(`!relationship ${identifier}`, [oneLine(line)])]),
  ]);
  return identifier;
}
