/*
 * `applyEdit` (SPEC 3.4): prepares, plans, re-parses, verifies and returns one edit as text edits
 * against the input, with their inverse. Pure and total: every failure is a refused outcome.
 * The id-stabilising pre-pass runs the operation again with the implicit identifiers written of
 * every anonymous element whose derived id the operation would otherwise shift.
 */
import {
  viewCatalog,
  type ElementDigest,
  type ElementId,
  type ViewKey,
} from "@miragon/c4-schema-model";
import type { C4Edit, EditContext, EditOutcome, ParseResult, TextEdit } from "../types.js";
import { Draft, ownParse } from "./draft.js";
import { createElement, renameIdentifier, updateElement } from "./elements.js";
import { insertExample } from "./example.js";
import { ensureIdentifiers } from "./identifiers.js";
import { EditRefused, GENERIC_MESSAGE } from "./refusal.js";
import { createRelationship, updateRelationship } from "./relationships.js";
import { applyC4Colours } from "./styles.js";
import { applyTextEdits as apply, diffTexts } from "./textEdits.js";
import {
  createView,
  deleteFromModelInView,
  deleteView,
  includeInView,
  layOutAutomatically,
  removeFromView,
  setLayout,
  smartDelete,
  updateView,
  updateWorkspace,
} from "./viewOperations.js";
import { verify } from "./verify.js";

const MAXIMUM_ROUNDS = 16;

/** Plans, applies, re-parses and verifies one edit (SPEC 3.4); pure, never throws. */
export function applyEdit(document: ParseResult, edit: C4Edit, context: EditContext): EditOutcome {
  try {
    const original = ownParse(document);
    if (!original.ok) {
      return {
        ok: false,
        reason: "not-allowed",
        message: "The text has a problem that stops the canvas. Fix it in the text first.",
      };
    }
    return run(original, withPlainLineBreaks(edit), context);
  } catch (error) {
    if (error instanceof EditRefused) {
      const detail = (error as EditRefused & { detail?: string }).detail;
      return {
        ok: false,
        reason: error.reason,
        message: error.message,
        ...(detail === undefined ? {} : { detail }),
      } as EditOutcome;
    }
    return {
      ok: false,
      reason: "verification-failed",
      message: GENERIC_MESSAGE,
      detail: String(error),
    } as EditOutcome;
  }
}

/**
 * The DSL stores a line break in a value only as `\n`, so a carriage return a pasted value
 * brings along would read back differently and fail verification.
 */
function withPlainLineBreaks(edit: C4Edit): C4Edit {
  const plain = (value: string) => value.replace(/\r\n?/g, "\n");
  const fields = <T extends object>(record: T): T =>
    Object.fromEntries(
      Object.entries(record).map(([name, value]) => [
        name,
        typeof value === "string" ? plain(value) : value,
      ]),
    ) as T;
  switch (edit.type) {
    case "createElement":
      return edit.name === undefined ? edit : { ...edit, name: plain(edit.name) };
    case "createRelationship":
      return fields(edit);
    case "updateElement":
    case "updateRelationship":
    case "updateView":
    case "updateWorkspace":
      return { ...edit, fields: fields(edit.fields) } as C4Edit;
    default:
      return edit;
  }
}

/** Non-overlapping edits against `text`, applied back to front. */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  return apply(text, edits);
}

function run(original: ParseResult, edit: C4Edit, context: EditContext): EditOutcome {
  const stable = new Set<ElementId>();
  for (let round = 0; ; round += 1) {
    const draft = new Draft(original, context);
    if (stable.size > 0) ensureIdentifiers(draft, stable);
    perform(draft, edit);
    const shifted = shiftedIds(original, draft);
    const fresh = shifted.filter((id) => !stable.has(id));
    if (fresh.length === 0 || round >= MAXIMUM_ROUNDS) return finish(original, draft);
    for (const id of fresh) stable.add(id);
  }
}

function perform(draft: Draft, edit: C4Edit): void {
  switch (edit.type) {
    case "createElement":
      createElement(draft, edit);
      return;
    case "createRelationship":
      createRelationship(draft, edit);
      return;
    case "updateElement":
      updateElementWithIntent(draft, edit);
      return;
    case "updateRelationship":
      updateRelationshipWithIntent(draft, edit);
      return;
    case "renameIdentifier":
      renameIdentifier(draft, edit.id, edit.identifier);
      draft.intent.opaqueMayChange = true;
      return;
    case "setLayout":
      setLayout(draft, edit);
      return;
    case "smartDelete":
      smartDelete(draft, edit);
      return;
    case "deleteFromModel":
      deleteFromModelInView(draft, edit.ids, edit.relationships);
      return;
    case "removeFromView":
      removeFromView(draft, draft.context.view, edit.ids, edit.relationships);
      return;
    case "includeInView":
      includeInView(draft, edit);
      return;
    case "createView":
      createView(draft, edit);
      return;
    case "updateView":
      updateView(draft, edit);
      return;
    case "deleteView":
      deleteView(draft, edit);
      return;
    case "clearLayout":
      layOutAutomatically(draft);
      return;
    case "updateWorkspace":
      updateWorkspace(draft, edit);
      return;
    case "applyC4Colours":
      draft.intent.stylesMayChange = true;
      applyC4Colours(draft);
      return;
    case "insertExample":
      insertExample(draft, edit.exampleText);
      return;
  }
}

function updateElementWithIntent(
  draft: Draft,
  edit: Extract<C4Edit, { type: "updateElement" }>,
): void {
  const before = draft.element(edit.id);
  updateElement(draft, edit);
  if (before === undefined) return;
  const renamed =
    draft.idChanges.find((change) => change.kind === "element" && change.from === edit.id)?.to ??
    edit.id;
  const after = draft.element(renamed);
  if (after === undefined) return;
  const expected: Partial<ElementDigest> = {
    ...(edit.fields.name === undefined ? {} : { name: edit.fields.name }),
    ...(edit.fields.description === undefined ? {} : { description: edit.fields.description }),
    ...(edit.fields.technology === undefined ? {} : { technology: edit.fields.technology }),
    ...(edit.fields.metadata === undefined ? {} : { metadata: edit.fields.metadata }),
    ...(edit.fields.tags === undefined ? {} : { ownTags: after.ownTags }),
    ...(edit.fields.url === undefined
      ? {}
      : { url: edit.fields.url === null || edit.fields.url === "" ? undefined : edit.fields.url }),
  };
  draft.intent.elementFields.set(edit.id, expected);
  if (edit.fields.tags !== undefined) {
    const wanted = [
      ...new Set(edit.fields.tags.map((tag) => tag.trim()).filter((tag) => tag !== "")),
    ];
    draft.intent.checks.push(() =>
      wanted.join(",") === after.ownTags.join(",") ? undefined : "the tags don't read back",
    );
  }
  if (draft.idChanges.some((change) => change.kind === "element"))
    draft.intent.opaqueMayChange = true;
}

function updateRelationshipWithIntent(
  draft: Draft,
  edit: Extract<C4Edit, { type: "updateRelationship" }>,
): void {
  const before = draft.relationship(edit.key);
  updateRelationship(draft, edit);
  if (before === undefined) return;
  const after = draft.relationship(draft.relationshipKeyNow(edit.key));
  draft.intent.relationshipFields.set(before.canvasKey, {
    ...(edit.fields.description === undefined ? {} : { description: edit.fields.description }),
    ...(edit.fields.technology === undefined ? {} : { technology: edit.fields.technology }),
    ...(edit.fields.tags === undefined || after === undefined ? {} : { tags: after.tags }),
    ...(edit.fields.url === undefined
      ? {}
      : { url: edit.fields.url === null || edit.fields.url === "" ? undefined : edit.fields.url }),
  });
}

/**
 * Elements whose id the operation shifted although it didn't target them: for each, the nearest
 * anonymous element at or above it, whose implicit identifier the next round writes first.
 */
function shiftedIds(original: ParseResult, draft: Draft): ElementId[] {
  const renamed = new Map<ElementId, ElementId>();
  for (const change of draft.idChanges)
    if (change.kind === "element") renamed.set(change.from, change.to);
  const byId = new Map(original.workspace.elements.map((element) => [element.id, element]));
  const after = new Map(draft.workspace.elements.map((element) => [element.id, element]));
  const removed = draft.intent.removedElements;
  const shifted = new Set<ElementId>();
  for (const element of original.workspace.elements) {
    if (removed.has(element.id)) continue;
    const id = renamed.get(element.id) ?? element.id;
    const counterpart = after.get(id);
    const parent =
      element.parentId === undefined
        ? undefined
        : (renamed.get(element.parentId) ?? element.parentId);
    const named = draft.intent.elementFields.get(element.id)?.name ?? element.name;
    if (
      counterpart !== undefined &&
      counterpart.kind === element.kind &&
      counterpart.parentId === parent &&
      counterpart.name === named
    ) {
      continue;
    }
    for (
      let current: typeof element | undefined = element;
      current !== undefined;
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)
    ) {
      if (current.implicit) {
        shifted.add(current.id);
        break;
      }
    }
  }
  return [...shifted];
}

function outcomeView(original: ParseResult, draft: Draft): ViewKey {
  if (draft.chosenView !== undefined) return draft.chosenView;
  const before = viewCatalog(original.workspace);
  const after = viewCatalog(draft.workspace);
  const current = draft.context.view;
  const entry = before.resolve(current);
  if (
    entry !== undefined &&
    entry.state !== "written" &&
    entry.scopeId !== undefined &&
    entry.type !== "systemLandscape"
  ) {
    const scope = draft.idChanges.find(
      (change) => change.kind === "element" && change.from === entry.scopeId,
    )?.to;
    if (scope !== undefined)
      return after.draftFor(entry.type as "systemContext" | "container" | "component", scope).key;
  }
  if (after.resolve(current) !== undefined) return current;
  for (
    let parent = before.parentOf(current);
    parent !== undefined;
    parent = before.parentOf(parent.key)
  ) {
    if (after.resolve(parent.key) !== undefined) return parent.key;
  }
  return after.defaultView().key;
}

function finish(original: ParseResult, draft: Draft): EditOutcome {
  const after = draft.parse;
  const { edits, inverse } = diffTexts(original.text, after.text);
  if (edits.length > 0) {
    const verified = verify(original, after, draft.intent, draft.idChanges, draft.created, edits);
    if (verified.appeared) draft.notices.add("implied-relationship-appears");
  }
  return {
    ok: true,
    text: after.text,
    edits,
    inverse,
    document: after,
    view: outcomeView(original, draft),
    fresh: draft.fresh,
    idChanges: draft.idChanges,
    created: draft.created,
    notices: [...draft.notices],
  };
}
