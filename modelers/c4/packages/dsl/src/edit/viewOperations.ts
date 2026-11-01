/*
 * The operations on the current view and on views as a whole (SPEC 3.4, 4.4, 4.6, 5.4): layout,
 * include and exclude, smart delete, creating, renaming and deleting views, "Lay out
 * automatically", and the workspace name and description (3.5 rule 9).
 */
import {
  decodeElementLayout,
  decodeVertices,
  draftKey,
  elementLayoutKey,
  encodeVertices,
  relationshipLayoutKey,
  type ElementId,
  type ElementKind,
  type StaticViewType,
  type ViewKey,
} from "@miragon/c4-schema-model";
import type { C4Edit } from "../types.js";
import { addDependentViews, closureOf, deleteFromModel, writeLaterKeys } from "./cascade.js";
import type { Draft } from "./draft.js";
import { KIND_WORDS } from "./elements.js";
import { ensureIdentifiers } from "./identifiers.js";
import { insertFirstChild, oneLine, removals } from "./place.js";
import { refuse } from "./refusal.js";
import { planSmartDelete } from "./smartDelete.js";
import {
  clearLayout,
  encodeBox,
  ensureWorkspace,
  excludeElement,
  excludeRelationship,
  includeElement,
  nameRelationship,
  pin,
  prepareView,
  removeLayoutKeys,
  setDescription,
  setTitle,
  setViewProperties,
  writeValueToken,
  writeViews,
} from "./views.js";
import { quote } from "./write.js";

/** The element kinds each static view type shows (SPEC 4.1). */
const SHOWN: Readonly<Record<string, readonly ElementKind[]>> = {
  systemLandscape: ["person", "softwareSystem", "custom"],
  systemContext: ["person", "softwareSystem", "custom"],
  container: ["person", "softwareSystem", "custom", "container"],
  component: ["person", "softwareSystem", "custom", "container", "component"],
};

function editableView(draft: Draft, key: ViewKey) {
  const entry = draft.view(key);
  if (entry === undefined || !entry.editable) {
    refuse("view-not-editable", "This view can't be edited on the canvas. Edit it in the text.");
  }
  return entry;
}

/** Moves, resizes and bendpoints: one property line each (SPEC 3.6). */
export function setLayout(draft: Draft, edit: Extract<C4Edit, { type: "setLayout" }>): void {
  const key = draft.context.view;
  editableView(draft, key);
  prepareView(draft, key);
  pin(draft, key);
  const members = draft.members(key);
  ensureIdentifiers(draft, edit.boxes.keys());
  const changes = new Map<string, string | null>();
  const expected = new Map<string, { x: number; y: number }>();
  for (const [id, box] of edit.boxes) {
    if (draft.element(id) === undefined)
      refuse("not-allowed", `There is no element ${id} in the model.`);
    if (!(members?.elements ?? []).includes(id))
      refuse("not-allowed", `${id} isn't shown in this view.`);
    changes.set(elementLayoutKey(id), encodeBox(draft, id, box));
    expected.set(id, { x: box.x, y: box.y });
  }
  for (const [canvasKey, points] of edit.vertices) {
    const relationship = draft.relationship(canvasKey);
    if (relationship === undefined)
      refuse("not-allowed", "There is no such relationship in the model.");
    const relationshipKey = relationship.key ?? nameRelationship(draft, canvasKey);
    changes.set(
      relationshipLayoutKey(relationshipKey),
      points === null || points.length === 0 ? null : encodeVertices(points),
    );
  }
  setViewProperties(draft, key, changes);
  draft.intent.checks.push((after) => {
    const view = after.workspace.views.find((candidate) => candidate.key === key);
    for (const [name, value] of changes) {
      const stored = view?.properties[name];
      if (value === null ? stored !== undefined : stored !== value)
        return `the layout key ${name} doesn't read back`;
      if (
        value !== null &&
        name.startsWith("c4modeler.element.") &&
        decodeElementLayout(value) === undefined
      ) {
        return `the layout value ${value} is malformed`;
      }
      if (
        value !== null &&
        name.startsWith("c4modeler.relationship.") &&
        decodeVertices(value) === undefined
      ) {
        return `the vertices ${value} are malformed`;
      }
    }
    return undefined;
  });
}

function checkShown(draft: Draft, key: ViewKey, id: ElementId): void {
  const entry = draft.view(key);
  const element = draft.requireElement(id);
  if (!(SHOWN[entry?.type ?? ""] ?? []).includes(element.kind)) {
    refuse("not-allowed", `This view can't show a ${KIND_WORDS[element.kind]}.`);
  }
}

/** "Add existing element…": rule 6 of SPEC 3.5. */
export function includeInView(
  draft: Draft,
  edit: Extract<C4Edit, { type: "includeInView" }>,
): void {
  const key = draft.context.view;
  editableView(draft, key);
  for (const id of edit.ids) checkShown(draft, key, id);
  prepareView(draft, key);
  pin(draft, key);
  for (const id of edit.ids) includeElement(draft, key, id);
  draft.intent.checks.push((after) => {
    const entry = after.workspace.views.find((view) => view.key === key);
    if (entry === undefined) return `the view ${key} is missing`;
    return undefined;
  });
}

/** Rule 6 of SPEC 3.5 for elements and relationships the view should no longer show. */
export function removeFromView(
  draft: Draft,
  key: ViewKey,
  ids: readonly ElementId[],
  relationships: readonly string[],
): void {
  if (ids.length === 0 && relationships.length === 0) return;
  editableView(draft, key);
  prepareView(draft, key);
  pin(draft, key, new Set(ids));
  for (const id of ids) {
    draft.requireElement(id);
    excludeElement(draft, key, id);
  }
  const layoutKeys: string[] = [];
  for (const original of relationships) {
    const canvasKey = draft.relationshipKeyNow(original);
    const relationship = draft.relationship(canvasKey);
    if (relationship === undefined)
      refuse("not-allowed", "There is no such relationship in the model.");
    excludeRelationship(draft, key, canvasKey);
    const current = draft.relationship(draft.relationshipKeyNow(original));
    if (current?.key !== undefined) layoutKeys.push(current.key);
  }
  removeLayoutKeys(draft, key, ids, layoutKeys);
  draft.intent.checks.push((after) => {
    const view = after.workspace.views.find((candidate) => candidate.key === key);
    if (view === undefined) return `the view ${key} is missing`;
    return undefined;
  });
}

/** Delete and Backspace (SPEC 5.4): from the model, or from this view. */
export function smartDelete(draft: Draft, edit: Extract<C4Edit, { type: "smartDelete" }>): void {
  const key = draft.context.view;
  const plan = planSmartDelete(draft.parse, key, edit.ids, edit.relationships);
  const fromView = plan.fromView.ids.length > 0 || plan.fromView.relationships.length > 0;
  const fromModel = plan.fromModel.ids.length > 0 || plan.fromModel.relationships.length > 0;
  if (!fromView && !fromModel) return;
  if (fromView) {
    editableView(draft, key);
    prepareView(draft, key);
  }
  if (fromModel) {
    deleteFromModelInView(draft, plan.fromModel.ids, plan.fromModel.relationships);
  }
  if (fromView) {
    removeFromView(
      draft,
      key,
      plan.fromView.ids.filter((id) => draft.element(id) !== undefined),
      plan.fromView.relationships.filter(
        (canvasKey) => draft.relationship(draft.relationshipKeyNow(canvasKey)) !== undefined,
      ),
    );
  }
}

/** "Delete from model…": the cascade, after pinning the current view when it is written. */
export function deleteFromModelInView(
  draft: Draft,
  ids: readonly ElementId[],
  relationships: readonly string[],
): void {
  const key = draft.context.view;
  if (draft.view(key)?.state === "written" && draft.view(key)?.editable === true) {
    pin(draft, key, closureOf(draft, ids));
  }
  deleteFromModel(draft, ids, relationships);
}

const SCOPE_KINDS: Readonly<Record<StaticViewType, ElementKind | undefined>> = {
  systemLandscape: undefined,
  systemContext: "softwareSystem",
  container: "softwareSystem",
  component: "container",
};

/** "New view…" (SPEC 4.6): written at once, with the draft key; implicit views come along. */
export function createView(draft: Draft, edit: Extract<C4Edit, { type: "createView" }>): void {
  const scopeKind = SCOPE_KINDS[edit.viewType];
  if (scopeKind === undefined && edit.scopeId !== undefined)
    refuse("not-allowed", "A landscape view has no scope.");
  if (scopeKind !== undefined) {
    const scope = edit.scopeId === undefined ? undefined : draft.element(edit.scopeId);
    if (scope?.kind !== scopeKind)
      refuse("not-allowed", `This view needs a ${KIND_WORDS[scopeKind]} as its scope.`);
  }
  ensureWorkspace(draft);
  const implicit = draft
    .catalog()
    .list()
    .filter((view) => view.state === "implicit");
  writeViews(
    draft,
    implicit.map((view) => ({
      type: view.type as StaticViewType,
      scopeId: view.scopeId,
      key: view.key,
    })),
  );
  const key = draftKey(edit.viewType, edit.scopeId, draft.workspace);
  writeViews(draft, [
    {
      type: edit.viewType,
      scopeId: edit.scopeId,
      key,
      ...(edit.title === undefined ? {} : { title: edit.title }),
    },
  ]);
  draft.chosenView = key;
  draft.intent.checks.push((after) => {
    const view = after.workspace.views.find((candidate) => candidate.key === key);
    if (view === undefined || view.type !== edit.viewType || view.scopeId !== edit.scopeId)
      return `the view ${key} wasn't written`;
    return undefined;
  });
}

/** "View settings…": title and description (SPEC 3.5 rule 7); a draft is written first. */
export function updateView(draft: Draft, edit: Extract<C4Edit, { type: "updateView" }>): void {
  const entry = draft.view(edit.key);
  if (entry === undefined) refuse("not-allowed", "There is no such view.");
  const { title, description } = edit.fields;
  const current = entry.definition;
  const sameTitle =
    title === undefined ||
    (title === null ? current?.title === undefined : current?.title === title);
  const sameDescription =
    description === undefined ||
    (description === null
      ? (current?.description ?? "") === ""
      : current?.description === description);
  if (sameTitle && sameDescription) return;
  if (entry.state !== "written") prepareView(draft, edit.key);
  if (title !== undefined) setTitle(draft, edit.key, title);
  if (description !== undefined) setDescription(draft, edit.key, description);
  draft.intent.checks.push((after) => {
    const view = after.workspace.views.find((candidate) => candidate.key === edit.key);
    if (view === undefined) return `the view ${edit.key} is missing`;
    if (title !== undefined && (view.title ?? null) !== (title === null ? null : title))
      return "the title doesn't read back";
    if (description !== undefined && (view.description ?? "") !== (description ?? ""))
      return "the description doesn't read back";
    return undefined;
  });
}

/** "Delete view…" (SPEC 4.6): refused while a filtered or image view uses the key. */
export function deleteView(draft: Draft, edit: Extract<C4Edit, { type: "deleteView" }>): void {
  const definition = draft.workspace.views.find((view) => view.key === edit.key);
  if (definition === undefined) refuse("not-allowed", "This view isn't in the file yet.");
  const filtered = draft.workspace.views.filter(
    (view) => view.type === "filtered" && view.baseKey === edit.key,
  );
  if (filtered.length > 0) {
    const names = filtered.map((view) => view.title ?? view.key).join(", ");
    refuse("view-in-use", `The filtered view ${names} is based on this view.`);
  }
  addDependentViews(draft, new Set([edit.key]));
  writeLaterKeys(draft, edit.key, new Set([edit.key]));
  const statement = draft.sources.viewSite(edit.key)?.statement;
  if (statement === undefined) refuse("verification-failed", "The view's statement is missing.");
  draft.apply(removals(draft.text, [statement]));
  draft.intent.removedViews.add(edit.key);
  draft.intent.opaqueMayChange = definition.type === "dynamic";
}

/** "Lay out automatically" (SPEC 4.4): the view's `c4modeler.*` keys go; a second run changes nothing. */
export function layOutAutomatically(draft: Draft): void {
  const key = draft.context.view;
  if (draft.view(key)?.state !== "written") return;
  clearLayout(draft, key);
}

/** SPEC 3.5 rule 9: the `workspace` statement's positional tokens, or `name` / `description` statements. */
export function updateWorkspace(
  draft: Draft,
  edit: Extract<C4Edit, { type: "updateWorkspace" }>,
): void {
  const { name, description } = edit.fields;
  const changes: ["name" | "description", string][] = [];
  if (name !== undefined && name !== draft.workspace.name) changes.push(["name", name]);
  if (description !== undefined && description !== draft.workspace.description)
    changes.push(["description", description]);
  if (changes.length === 0) return;
  for (const [field, value] of changes) {
    const workspace = ensureWorkspace(draft);
    const site = draft.sources.workspace();
    const statements = field === "name" ? site.nameStatements : site.descriptionStatements;
    const last = statements.at(-1);
    if (last !== undefined) {
      writeValueToken(draft, last, 1, value);
      continue;
    }
    if (site.extendsSource !== undefined) {
      draft.apply([insertFirstChild(draft, workspace, [oneLine(`${field} ${quote(value)}`)])]);
      continue;
    }
    const index = field === "name" ? site.nameToken : site.descriptionToken;
    if (index !== undefined) {
      writeValueToken(draft, workspace, index, value);
      continue;
    }
    const keyword = workspace.tokens[0];
    const nameToken = site.nameToken === undefined ? undefined : workspace.tokens[site.nameToken];
    if (keyword === undefined) refuse("verification-failed", "The workspace statement is empty.");
    const insert =
      field === "name"
        ? ` ${quote(value)}`
        : nameToken === undefined
          ? ` ${quote(draft.workspace.name)} ${quote(value)}`
          : ` ${quote(value)}`;
    const after = nameToken ?? keyword;
    draft.apply([{ start: after.range.end, end: after.range.end, insert }]);
  }
  if (name !== undefined) draft.intent.workspaceName = name;
  if (description !== undefined) draft.intent.workspaceDescription = description;
}
