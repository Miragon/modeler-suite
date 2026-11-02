/*
 * Element operations (SPEC 3.4, 3.5 rules 1-3 and the field rules): creating an element in the
 * current view, writing a field to its effective source, and the identifier refactor of 3.3.
 */
import {
  defaultSize,
  elementLayoutKey,
  isKeyword,
  isValidIdentifier,
  relationshipLayoutKey,
  resolveElementStyle,
  deriveIdentifier,
  viewCatalog,
  viewMembers,
  type ElementId,
  type ElementKind,
  type FieldName,
  type ModelElement,
  type ViewKey,
} from "@miragon/c4-schema-model";
import { parseWorkspace } from "../parse.js";
import type { ResolvedReference } from "../semantic/index.js";
import type { C4Edit, CreatableKind, ElementFields, Statement, TextEdit } from "../types.js";
import type { Draft } from "./draft.js";
import {
  elementIdOf,
  ensureIdentifiers,
  identifierRegister,
  isFree,
  newIdentifier,
} from "./identifiers.js";
import {
  addChildren,
  block,
  canOpenInPlace,
  codeChildren,
  insertAfter,
  insertFirstChild,
  oneLine,
  removals,
  removeToken,
  replaceToken,
  type Written,
} from "./place.js";
import { operandEdits } from "./operands.js";
import { refuse } from "./refusal.js";
import { addDatabaseStyle } from "./styles.js";
import { applyTextEdits } from "./textEdits.js";
import {
  encodeBox,
  ensureModel,
  includeElement,
  pin,
  prepareView,
  renameViewProperties,
  setViewProperties,
  viewKeyOf,
  writeValueToken,
} from "./views.js";
import { ELEMENT_KEYWORD, quote, unrepresentable } from "./write.js";

/** Positional slots after the keyword (SPEC 3.5). */
export const ELEMENT_SLOTS: Readonly<Record<ElementKind, Partial<Record<FieldName, number>>>> = {
  person: { name: 1, description: 2, tags: 3 },
  softwareSystem: { name: 1, description: 2, tags: 3 },
  container: { name: 1, description: 2, technology: 3, tags: 4 },
  component: { name: 1, description: 2, technology: 3, tags: 4 },
  custom: { name: 1, metadata: 2, description: 3, tags: 4 },
};

const PLACEHOLDERS: Readonly<Record<CreatableKind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
};

export const KIND_WORDS: Readonly<Record<ElementKind, string>> = {
  person: "person",
  softwareSystem: "software system",
  container: "container",
  component: "component",
  custom: "element",
};

/** The kinds each view type creates (SPEC 5.1). */
const CREATABLE: Readonly<Record<string, readonly CreatableKind[]>> = {
  systemLandscape: ["person", "softwareSystem"],
  systemContext: ["person", "softwareSystem"],
  container: ["person", "softwareSystem", "container"],
  component: ["person", "softwareSystem", "container", "component"],
};

const PROPERTY_LIKE = new Set([
  "description",
  "technology",
  "tags",
  "url",
  "properties",
  "perspectives",
  "docs",
]);

const URL_SCHEMES = new Set(["http", "https", "ftp", "file", "jar", "mailto"]);

/**
 * Names are unique per kind at the top level, per system and per container: Structurizr 6.2.4
 * accepts a person and a software system of the same name and refuses two people of one name.
 */
function namespace(
  draft: Draft,
  kind: ElementKind,
  parentId: ElementId | undefined,
): ModelElement[] {
  return draft.workspace.elements.filter(
    (element) => element.parentId === parentId && element.kind === kind,
  );
}

function placeholderName(
  draft: Draft,
  kind: CreatableKind,
  parentId: ElementId | undefined,
  database: boolean,
): string {
  const base = database ? "Database" : PLACEHOLDERS[kind];
  const names = new Set(namespace(draft, kind, parentId).map((element) => element.name));
  if (!names.has(base)) return base;
  for (let counter = 2; ; counter += 1) {
    if (!names.has(`${base} ${counter}`)) return `${base} ${counter}`;
  }
}

function checkNameFree(
  draft: Draft,
  kind: ElementKind,
  parentId: ElementId | undefined,
  name: string,
  self?: ElementId,
): void {
  const clash = namespace(draft, kind, parentId).find(
    (element) => element.name === name && element.id !== self,
  );
  if (clash === undefined) return;
  const where = parentId === undefined ? "" : ` in ${draft.element(parentId)?.name ?? parentId}`;
  const article = /^[aeiou]/.test(KIND_WORDS[clash.kind]) ? "An" : "A";
  refuse(
    "name-taken",
    `${article} ${KIND_WORDS[clash.kind]} named ${name} already exists${where}.`,
  );
}

function checkTags(tags: readonly string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.includes(","))
      refuse(
        "unrepresentable-value",
        "A tag can't contain a comma: Structurizr splits tags at commas.",
      );
    if (trimmed !== "" && !result.includes(trimmed)) result.push(trimmed);
  }
  return result;
}

function checkValue(value: string): void {
  const reason = unrepresentable(value);
  if (reason !== undefined) refuse("unrepresentable-value", reason);
}

export function checkUrl(url: string): void {
  checkValue(url);
  if (url.startsWith("{workspace}") || /^\{workspace:\d+\}/.test(url)) return;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\S+$/.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined || !URL_SCHEMES.has(scheme)) {
    refuse(
      "unrepresentable-value",
      "Structurizr accepts only a full address here, such as https://example.com.",
    );
  }
}

/** The element whose block a created container or component goes into (the view decides, SPEC 5.1). */
function parentInView(draft: Draft, kind: CreatableKind, view: ViewKey): ElementId | undefined {
  const entry = draft.view(view);
  if (kind === "person" || kind === "softwareSystem" || entry === undefined) return undefined;
  if (kind === "component") return entry.scopeId;
  if (entry.type === "container") return entry.scopeId;
  const scope = entry.scopeId === undefined ? undefined : draft.element(entry.scopeId);
  return scope?.parentId;
}

function topLevelAnchor(draft: Draft, kind: ElementKind): Statement | undefined {
  const model = ensureModel(draft);
  const children = codeChildren(model);
  const statements = children.filter((child): child is Statement => child.kind === "statement");
  const definitions = new Map(
    draft.workspace.elements
      .filter((element) => element.parentId === undefined)
      .map((element) => [draft.sources.elementSite(element.id)?.definition, element] as const),
  );
  const sameFamily = statements
    .filter((statement) => definitions.get(statement)?.kind === kind)
    .at(-1);
  if (sameFamily) return sameFamily;
  const elementOrGroup = statements
    .filter(
      (statement) => definitions.has(statement) || draft.sources.roleOf(statement) === "group",
    )
    .at(-1);
  if (elementOrGroup) return elementOrGroup;
  return statements
    .filter((statement) => {
      const role = draft.sources.roleOf(statement);
      return (
        role === "identifiers" ||
        role === "impliedRelationships" ||
        role === "archetypes" ||
        role === "properties"
      );
    })
    .at(-1);
}

/** Inside the parent's defining block (rules 2 and 3), or an `!element` re-open right after it. */
function childPlacement(
  draft: Draft,
  parentId: ElementId,
  kind: ElementKind,
  statement: Written,
): TextEdit {
  const site = draft.sources.elementSite(parentId);
  if (site === undefined) refuse("not-allowed", `There is no element ${parentId} in the model.`);
  const definition = site.definition;
  if (definition.block === undefined && !canOpenInPlace(definition)) {
    return reopenAfter(draft, parentId, definition, [statement]);
  }
  if (definition.block === undefined)
    return addChildren(draft, definition, [statement], "first") as TextEdit;
  const children = codeChildren(definition).filter(
    (child): child is Statement => child.kind === "statement",
  );
  const kindOf = (child: Statement) =>
    draft.workspace.elements.find(
      (element) => draft.sources.elementSite(element.id)?.definition === child,
    )?.kind;
  const groupHolds = (group: Statement) =>
    codeChildren(group).some((child) => child.kind === "statement" && kindOf(child) === kind);
  const siblings = children
    .filter(
      (child) =>
        kindOf(child) === kind || (draft.sources.roleOf(child) === "group" && groupHolds(child)),
    )
    .at(-1);
  const propertyLike = children
    .filter((child) => PROPERTY_LIKE.has(draft.sources.roleOf(child) ?? ""))
    .at(-1);
  const anchor = siblings ?? propertyLike;
  return anchor
    ? insertAfter(draft, anchor, [statement])
    : insertFirstChild(draft, definition, [statement]);
}

/** `!element <ref> { … }` right after a definition that can't gain a block (SPEC 3.5). */
function reopenAfter(
  draft: Draft,
  id: ElementId,
  definition: Statement,
  children: readonly Written[],
): TextEdit {
  return insertAfter(draft, definition, [block(`!element ${id}`, children)]);
}

/** A child statement of an element: in its block, opened in place, or in an `!element` re-open. */
function addElementChild(draft: Draft, id: ElementId, statement: Written): void {
  ensureIdentifiers(draft, [id]);
  const site = draft.sources.elementSite(id);
  if (site === undefined) refuse("not-allowed", `There is no element ${id} in the model.`);
  const definition = site.definition;
  const edit =
    definition.block === undefined && !canOpenInPlace(definition)
      ? reopenAfter(draft, id, definition, [statement])
      : (addChildren(draft, definition, [statement], "last") as TextEdit);
  draft.apply([edit]);
}

function randomIdentifier(
  draft: Draft,
  kind: CreatableKind,
  mode: "flat" | "hierarchical",
  parentId: ElementId | undefined,
): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const local = `${kind}_${draft.context.random()}`;
    if (isFree(draft, elementIdOf(local, mode, parentId))) return local;
  }
  return deriveIdentifier(
    `${kind}_${draft.context.random()}`,
    kind,
    identifierRegister(draft),
    mode,
    parentId,
  );
}

/**
 * SPEC 3.4 `createElement`: in the current view, with the view's scope as the parent. Without a
 * centre it writes no layout key, and the view places the element beside its first neighbour.
 */
export function createElement(
  draft: Draft,
  edit: Extract<C4Edit, { type: "createElement" }>,
): void {
  const key = draft.context.view;
  const entry = draft.view(key);
  if (entry === undefined || !entry.editable) {
    refuse("view-not-editable", "This view can't be edited on the canvas. Edit it in the text.");
  }
  if (!(CREATABLE[entry.type] ?? []).includes(edit.kind)) {
    refuse("not-allowed", `A ${KIND_WORDS[edit.kind]} can't be added to this view.`);
  }
  const tags = checkTags(edit.tags ?? []);
  const parentId = parentInView(draft, edit.kind, key);
  if (
    (edit.kind === "container" || edit.kind === "component") &&
    (parentId === undefined || draft.element(parentId) === undefined)
  ) {
    refuse("not-allowed", `A ${KIND_WORDS[edit.kind]} needs a scope in this view.`);
  }
  const database = edit.kind === "container" && tags.includes("Database");
  const name = edit.name ?? placeholderName(draft, edit.kind, parentId, database);
  if (name.trim() === "") refuse("unrepresentable-value", "An element needs a name.");
  checkValue(name);
  checkNameFree(draft, edit.kind, parentId, name);

  prepareView(draft, key);
  pin(draft, key);
  if (parentId !== undefined && draft.sources.elementSite(parentId)?.mode === "hierarchical") {
    ensureIdentifiers(draft, [parentId]);
  }
  const offset =
    parentId === undefined
      ? (ensureModel(draft).block?.open.end ?? 0)
      : (draft.sources.elementSite(parentId)?.definition.range.start ?? 0);
  const mode = draft.sources.identifierModeAt(offset);
  const local =
    edit.name === undefined
      ? randomIdentifier(draft, edit.kind, mode, parentId)
      : newIdentifier(draft, name, edit.kind, offset, parentId).local;
  const id = elementIdOf(local, mode, parentId);
  const tagSlot = (ELEMENT_SLOTS[edit.kind].tags ?? 3) - 2;
  const tokens = [
    quote(name),
    ...(tags.length > 0 ? [...Array<string>(tagSlot).fill('""'), quote(tags.join(","))] : []),
  ];
  const statement = oneLine(`${local} = ${ELEMENT_KEYWORD[edit.kind]} ${tokens.join(" ")}`);
  if (parentId === undefined) {
    const anchor = topLevelAnchor(draft, edit.kind);
    const model = ensureModel(draft);
    draft.apply([
      anchor
        ? insertAfter(draft, anchor, [statement])
        : insertFirstChild(draft, model, [statement]),
    ]);
  } else {
    draft.apply([childPlacement(draft, parentId, edit.kind, statement)]);
  }
  const created = draft.element(id);
  if (created === undefined) refuse("verification-failed", "The new element could not be written.");
  if (database) addDatabaseStyle(draft);
  const style = resolveElementStyle(draft.element(id) as ModelElement, draft.workspace.styles);
  const shape = defaultSize(style.shape);
  const size = edit.size ?? {
    width: style.width ?? shape.width,
    height: style.height ?? shape.height,
  };
  const center = edit.center;
  const box =
    center === undefined
      ? undefined
      : { x: center.x - size.width / 2, y: center.y - size.height / 2, ...size };
  if (box !== undefined) {
    setViewProperties(draft, key, new Map([[elementLayoutKey(id), encodeBox(draft, id, box)]]));
  }
  // An append's relationship may bring the element into the view by itself (the `include *` of a
  // system context view takes what its scope connects to), so it is included after that.
  if (edit.connectFrom === undefined) includeElement(draft, key, id);
  draft.created.elements.push(id);
  const layoutKey = elementLayoutKey(id);
  const layoutValue = box === undefined ? undefined : encodeBox(draft, id, box);
  draft.intent.checks.push((after) => {
    const element = after.workspace.elements.find((candidate) => candidate.id === id);
    if (element?.kind !== edit.kind || element.parentId !== parentId || element.name !== name) {
      return `the created element ${id} doesn't read back`;
    }
    const entry = viewCatalog(after.workspace).resolve(key);
    if (entry === undefined || !viewMembers(after.workspace, entry).elements.includes(id)) {
      return `the created element ${id} isn't in the view ${key}`;
    }
    if (layoutValue === undefined) return undefined;
    const view = after.workspace.views.find((candidate) => candidate.key === key);
    return view?.properties[layoutKey] === layoutValue
      ? undefined
      : `the box of ${id} doesn't read back`;
  });
  if (edit.name === undefined) draft.fresh.add(id);
}

function fieldApplies(kind: ElementKind, field: FieldName): boolean {
  if (field === "technology") return kind === "container" || kind === "component";
  if (field === "metadata") return kind === "custom";
  return true;
}

const NOT_EDITABLE: Readonly<Record<string, string>> = {
  substitution: "Set with a constant. Edit the constant in the text.",
  bulk: "Set by an !elements statement. Edit the text instead.",
  "several-statements": "Tags are set in several places. Edit the text instead.",
  include: "Set in an included file. Edit that file instead.",
};

function notEditableMessage(draft: Draft, element: ModelElement, field: FieldName): string {
  const source = element.fields[field];
  if (source.reason === "substitution") {
    const statement = draft.sources.statementAt(source.statement);
    const raw = source.token === undefined ? undefined : statement?.tokens[source.token]?.raw;
    const constant = raw === undefined ? undefined : /\$\{([^}]+)\}/.exec(raw)?.[0];
    if (constant !== undefined) return `Set with “${constant}”. Edit the constant in the text.`;
  }
  return (
    NOT_EDITABLE[source.reason ?? ""] ??
    "This field can't be edited on the canvas. Edit the text instead."
  );
}

/** The values of `fields` that differ from the element's, normalised. */
function changedFields(
  element: ModelElement,
  fields: Partial<ElementFields>,
): Map<FieldName, string | readonly string[] | null> {
  const changes = new Map<FieldName, string | readonly string[] | null>();
  if (fields.name !== undefined && fields.name !== element.name) changes.set("name", fields.name);
  if (fields.description !== undefined && fields.description !== element.description) {
    changes.set("description", fields.description);
  }
  if (fields.technology !== undefined && fields.technology !== element.technology) {
    changes.set("technology", fields.technology);
  }
  if (fields.metadata !== undefined && fields.metadata !== element.metadata)
    changes.set("metadata", fields.metadata);
  if (fields.tags !== undefined) {
    const tags = checkTags(fields.tags);
    if (tags.join("\u0000") !== element.ownTags.join("\u0000")) changes.set("tags", tags);
  }
  if (fields.url !== undefined) {
    const url = fields.url === null || fields.url === "" ? null : fields.url;
    if ((url ?? undefined) !== element.url) changes.set("url", url);
  }
  return changes;
}

/**
 * SPEC 3.4 `updateElement`: each field into its effective source (3.5); a fresh name renames the
 * identifier (3.3), also the default name confirmed as it is.
 */
export function updateElement(
  draft: Draft,
  edit: Extract<C4Edit, { type: "updateElement" }>,
): void {
  const element = draft.requireElement(edit.id);
  const changes = changedFields(element, edit.fields);
  const confirmsFreshName = edit.fields.name === element.name && draft.fresh.has(element.id);
  if (changes.size === 0 && !confirmsFreshName) return;
  for (const [field, value] of changes) {
    if (!fieldApplies(element.kind, field)) {
      refuse("field-not-editable", `A ${KIND_WORDS[element.kind]} has no ${field}.`);
    }
    if (!element.fields[field].editable)
      refuse("field-not-editable", notEditableMessage(draft, element, field));
    if (typeof value === "string") {
      if (field === "url") checkUrl(value);
      else checkValue(value);
    }
  }
  const name = changes.get("name") ?? (confirmsFreshName ? element.name : undefined);
  if (typeof name === "string") {
    if (name.trim() === "") refuse("unrepresentable-value", "An element needs a name.");
    checkNameFree(draft, element.kind, element.parentId, name, element.id);
  }
  const view = draft.context.view;
  if (
    changes.has("tags") &&
    draft.view(view)?.editable === true &&
    draft.members(view)?.elements.includes(element.id)
  ) {
    prepareView(draft, view);
    pin(draft, view);
  }
  if (typeof name === "string") ensureIdentifiers(draft, [element.id]);
  for (const [field, value] of changes) writeElementField(draft, element.id, field, value);
  if (typeof name === "string" && draft.fresh.has(element.id)) {
    const current = draft.requireElement(element.id);
    const site = draft.sources.elementSite(element.id);
    const mode = site?.mode ?? "flat";
    let local = deriveIdentifier(
      name,
      current.kind,
      identifierRegister(draft),
      mode,
      current.parentId,
    );
    if (draft.context.identifiers === "collision-free")
      local = `${local}_${draft.context.random()}`;
    draft.fresh.delete(element.id);
    if (elementIdOf(local, mode, current.parentId) !== element.id)
      renameIdentifier(draft, element.id, local);
  }
}

/** Writes one field where it is effective (SPEC 3.5 "Effective source of a field"). */
function writeElementField(
  draft: Draft,
  id: ElementId,
  field: FieldName,
  value: string | readonly string[] | null,
): void {
  const text = Array.isArray(value) ? value.join(",") : (value as string | null);
  if (text === null || text === "") {
    clearElementField(draft, id, field);
    return;
  }
  const element = draft.requireElement(id);
  const source = element.fields[field];
  const site = draft.sources.elementSite(id);
  if (site === undefined) refuse("verification-failed", "The element's statement is missing.");
  const statement = draft.sources.statementAt(source.statement);
  if (source.form === "positional" && statement !== undefined && source.token !== undefined) {
    writeValueToken(draft, statement, source.token, text);
    return;
  }
  if ((source.form === "statement" || source.form === "reopen") && statement !== undefined) {
    if (field === "tags") {
      const first = statement.tokens[1];
      const last = statement.tokens.at(-1);
      if (first === undefined || last === undefined)
        refuse("verification-failed", "The tags statement is empty.");
      draft.apply([{ start: first.range.start, end: last.range.end, insert: quote(text) }]);
      return;
    }
    writeValueToken(draft, statement, 1, text);
    return;
  }
  if (field === "url") {
    addElementChild(draft, id, oneLine(`url ${quote(text)}`));
    return;
  }
  setPositional(draft, element, site.definition, field, text);
}

function fieldValue(element: ModelElement, field: FieldName): string {
  if (field === "tags") return element.ownTags.join(",");
  if (field === "url") return element.url ?? "";
  return element[field];
}

/**
 * Clears a field: a child statement loses its line, the last positional goes, a middle one
 * becomes `""`; an earlier writer that shows through then goes too, an archetype default is
 * overridden with `""` (SPEC 3.5).
 */
function clearElementField(draft: Draft, id: ElementId, field: FieldName): void {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const element = draft.requireElement(id);
    if (fieldValue(element, field) === "") return;
    const source = element.fields[field];
    if (!source.editable) refuse("field-not-editable", notEditableMessage(draft, element, field));
    const statement = draft.sources.statementAt(source.statement);
    const site = draft.sources.elementSite(id);
    if (statement === undefined || site === undefined) break;
    if (source.form === "positional" && source.token !== undefined) {
      clearPositional(draft, element, field, statement, source.token);
    } else if (source.form === "statement" || source.form === "reopen") {
      draft.apply(removals(draft.text, [statement]));
    } else if (source.form === "archetype" && field !== "url" && field !== "tags") {
      setPositional(draft, element, site.definition, field, "");
    } else {
      break;
    }
  }
  if (fieldValue(draft.requireElement(id), field) !== "") {
    refuse(
      "field-not-editable",
      "This value comes from a default that can't be cleared here. Edit the text instead.",
    );
  }
}

/** A positional slot set on the definition, `""` placeholders for skipped slots (SPEC 3.5). */
function setPositional(
  draft: Draft,
  element: ModelElement,
  definition: Statement,
  field: FieldName,
  value: string,
): void {
  const slot = ELEMENT_SLOTS[element.kind][field];
  if (slot === undefined)
    refuse("field-not-editable", `A ${KIND_WORDS[element.kind]} has no ${field}.`);
  const tokens = definition.tokens;
  const existing = tokens[slot];
  if (existing !== undefined) {
    writeValueToken(draft, definition, slot, value);
    return;
  }
  const last = tokens.at(-1);
  if (last === undefined) refuse("verification-failed", "The element's statement is empty.");
  if (last.textBlock) {
    const keyword = field === "tags" ? "tags" : field;
    if (field !== "description" && field !== "technology" && field !== "tags") {
      refuse(
        "not-allowed",
        "This field can't be written after a text block. Edit the text instead.",
      );
    }
    addElementChild(draft, element.id, oneLine(`${keyword} ${quote(value)}`));
    return;
  }
  const slots = ELEMENT_SLOTS[element.kind];
  const placeholders = Array.from({ length: slot - tokens.length }, (_, offset) => {
    const skipped = (Object.keys(slots) as FieldName[]).find(
      (name) => slots[name] === tokens.length + offset,
    );
    return skipped !== undefined && element.fields[skipped].form === "archetype"
      ? quote(fieldValue(element, skipped))
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

/**
 * The last positional goes with trailing `""` placeholders, except those that keep an archetype
 * default away (removing them would change that field); a middle one becomes `""` (SPEC 3.5).
 */
function clearPositional(
  draft: Draft,
  element: ModelElement,
  field: FieldName,
  statement: Statement,
  index: number,
): void {
  const tokens = statement.tokens;
  const token = tokens[index];
  if (token === undefined) return;
  if (index !== tokens.length - 1 || element.archetype !== undefined) {
    draft.apply([replaceToken(token, '""')]);
    return;
  }
  let first = index;
  while (first > 2 && tokens[first - 1]?.raw === '""') first -= 1;
  const removal = (from: number) => {
    const edits: TextEdit[] = [];
    for (let position = from; position <= index; position += 1) {
      const removed = tokens[position];
      if (removed) edits.push(removeToken(draft.text, removed));
    }
    return mergeAdjacent(edits);
  };
  const others = (["description", "technology", "metadata", "tags"] as const).filter(
    (name) => name !== field,
  );
  for (let candidate = first; candidate < index; candidate += 1) {
    const edits = removal(candidate);
    const after = parseWorkspace(applyTextEdits(draft.text, edits)).workspace.elements.find(
      (other) => other.id === element.id,
    );
    if (
      after !== undefined &&
      others.every((name) => fieldValue(after, name) === fieldValue(element, name))
    ) {
      draft.apply(edits);
      return;
    }
  }
  draft.apply(removal(index));
}

function mergeAdjacent(edits: readonly TextEdit[]): TextEdit[] {
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  const merged: TextEdit[] = [];
  for (const edit of sorted) {
    const last = merged.at(-1);
    if (last && edit.start <= last.end)
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, edit.end),
        insert: "",
      };
    else merged.push(edit);
  }
  return merged;
}

/** The identifier a reference writes for an element after the ids in `renamed` changed. */
function rewritten(
  reference: ResolvedReference,
  renamed: ReadonlyMap<ElementId, ElementId>,
): string | undefined {
  if (reference.target.kind !== "element") return undefined;
  const target = renamed.get(reference.target.id);
  if (target === undefined) return undefined;
  if (reference.relativeTo === undefined) return target;
  const base = renamed.get(reference.relativeTo) ?? reference.relativeTo;
  return target.startsWith(`${base}.`) ? target.slice(base.length + 1) : target;
}

/** Whether an opaque text (a script, a bulk expression) may name the identifier. */
export function opaqueMention(
  draft: Draft,
  identifiers: readonly string[],
  names: readonly string[] = [],
): number | undefined {
  // In hierarchical mode a statement inside an element's block may name a descendant by its
  // relative key, so every dotted suffix counts too.
  const written = identifiers.flatMap((identifier) =>
    identifier.split(".").map((_, index, parts) => parts.slice(index).join(".")),
  );
  for (const { node, text } of draft.sources.opaque()) {
    const lower = text.toLowerCase();
    const named =
      written.some((identifier) => {
        const pattern = new RegExp(
          `(^|[^A-Za-z0-9_.])${escapeRegExp(identifier.toLowerCase())}($|[^A-Za-z0-9_])`,
        );
        return pattern.test(lower);
      }) || names.some((name) => name !== "" && text.includes(name));
    if (named) return lineOf(draft.text, node.range.start);
  }
  return undefined;
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (
    let index = text.indexOf("\n");
    index !== -1 && index < offset;
    index = text.indexOf("\n", index + 1)
  )
    line += 1;
  return line;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * SPEC 3.3 `renameIdentifier`: the defining token, every reference, every layout key and
 * relationship key in every view; in hierarchical mode the descendants' full keys follow.
 */
export function renameIdentifier(draft: Draft, id: ElementId, identifier: string): void {
  const element = draft.requireElement(id);
  if (!isValidIdentifier(identifier) || identifier.includes(".")) {
    refuse(
      "identifier-invalid",
      `“${identifier}” isn't a valid identifier. Use only letters, digits, “_” and “-”, and don't start with “-”.`,
    );
  }
  if (isKeyword(identifier))
    refuse(
      "identifier-invalid",
      `“${identifier}” is a word of the DSL. Choose another identifier.`,
    );
  const site = draft.sources.elementSite(id);
  if (site === undefined) refuse("not-allowed", `There is no element ${id} in the model.`);
  const newId = elementIdOf(identifier, site.mode, element.parentId);
  if (newId === id) return;
  if (newId.toLowerCase() !== id.toLowerCase() && !isFree(draft, newId)) {
    refuse(
      "identifier-taken",
      `The identifier “${identifier}” is already in use. Choose another one.`,
    );
  }
  const line = opaqueMention(draft, [id]);
  if (line !== undefined) {
    refuse(
      "referenced-by-opaque",
      `A script or bulk statement on line ${line} may use ${id}. Edit the text instead.`,
    );
  }
  const renamed = new Map<ElementId, ElementId>([[id, newId]]);
  if (site.mode === "hierarchical") {
    for (const other of draft.workspace.elements) {
      if (other.id.startsWith(`${id}.`))
        renamed.set(other.id, `${newId}${other.id.slice(id.length)}`);
    }
  }
  const relationshipsBefore = draft.workspace.relationships;
  const edits: TextEdit[] = [];
  const assignee = site.definition.assignee;
  if (assignee !== undefined) edits.push(replaceToken(assignee, identifier));
  else {
    const keyword = site.definition.tokens[0];
    if (keyword)
      edits.push({
        start: keyword.range.start,
        end: keyword.range.start,
        insert: `${identifier} = `,
      });
  }
  const seen = new Set<string>();
  const rewrite = (reference: ResolvedReference, replacement: string | undefined) => {
    const token = reference.statement.tokens[reference.token];
    if (replacement === undefined || token === undefined || replacement === reference.written)
      return;
    const view = viewKeyOf(draft, reference.statement);
    if (view !== undefined) draft.touch(view);
    for (const edit of operandEdits(token.raw, token.range.start, reference.written, replacement)) {
      const position = `${edit.start}:${edit.end}`;
      if (seen.has(position)) continue;
      seen.add(position);
      edits.push(edit);
    }
  };
  for (const oldId of renamed.keys()) {
    for (const reference of draft.sources.references(oldId)) {
      rewrite(reference, rewritten(reference, renamed));
    }
  }
  // Hierarchical mode keys a group in an element's block under the element, like a child.
  for (const group of draft.sources.groups()) {
    const { identifier, parentId, path } = group;
    const parent = parentId === undefined ? undefined : renamed.get(parentId);
    if (parent === undefined || identifier === undefined || !identifier.startsWith(`${parentId}.`))
      continue;
    const renamedGroup = `${parent}${identifier.slice((parentId as string).length)}`;
    for (const reference of draft.sources.referencesTo({ kind: "group", path, identifier })) {
      const base =
        reference.relativeTo === undefined
          ? undefined
          : (renamed.get(reference.relativeTo) ?? reference.relativeTo);
      rewrite(
        reference,
        base !== undefined && renamedGroup.startsWith(`${base}.`)
          ? renamedGroup.slice(base.length + 1)
          : renamedGroup,
      );
    }
  }
  draft.apply(edits);
  for (const [from, to] of renamed) draft.rename({ kind: "element", from, to });
  draft.fresh.delete(id);
  const keyChanges = relationshipKeyChanges(relationshipsBefore, renamed);
  for (const [from, to] of keyChanges) draft.rename({ kind: "relationship", from, to });
  for (const view of draft.workspace.views) {
    const renames = new Map<string, string>();
    for (const name of Object.keys(view.properties)) {
      const next = renamedLayoutKey(name, renamed, keyChanges);
      if (next !== name) renames.set(name, next);
    }
    if (renames.size > 0) renameViewProperties(draft, view.key, renames);
  }
}

function renamedLayoutKey(
  name: string,
  renamed: ReadonlyMap<ElementId, ElementId>,
  keys: ReadonlyMap<string, string>,
): string {
  for (const [from, to] of renamed) {
    if (name === elementLayoutKey(from)) return elementLayoutKey(to);
  }
  for (const [from, to] of keys) {
    if (name === relationshipLayoutKey(from)) return relationshipLayoutKey(to);
  }
  return name;
}

/** Canvas keys of relationships that change with the element ids (unnamed and implied ones). */
function relationshipKeyChanges(
  relationships: readonly {
    readonly canvasKey: string;
    readonly identifier: string | undefined;
    readonly sourceId: ElementId;
    readonly destinationId: ElementId;
  }[],
  renamed: ReadonlyMap<ElementId, ElementId>,
): Map<string, string> {
  const changes = new Map<string, string>();
  for (const relationship of relationships) {
    if (relationship.identifier !== undefined) continue;
    const source = relationship.sourceId;
    const destination = relationship.destinationId;
    if (!renamed.has(source) && !renamed.has(destination)) continue;
    const from = relationship.canvasKey;
    const pair = `${source}->${destination}`;
    const renamedPair = `${renamed.get(source) ?? source}->${renamed.get(destination) ?? destination}`;
    const to = from.includes(pair) ? from.replace(pair, renamedPair) : from;
    if (to !== from) changes.set(from, to);
  }
  return changes;
}
