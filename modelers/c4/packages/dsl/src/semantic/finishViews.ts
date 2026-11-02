/*
 * Written views as `ViewDefinition`s (SPEC 3.2, 3.6, 4.1): the stored layout is read against
 * what each view shows, so a key naming nothing in it is reported and kept, and the
 * compatibility errors membership finds for the terms get the positions of their tokens.
 */
import {
  decodeElementLayout,
  decodeVertices,
  parseExpression,
  viewMembers,
  type Diagnostic,
  type ElementId,
  type Point,
  type StoredBox,
  type StoredLayout,
  type ViewDefinition,
  type ViewEntry,
  type ViewMembers,
  type Workspace,
} from "@miragon/c4-schema-model";
import { animationSteps } from "./animation.js";
import type { PropertyEntrySite, ViewRecord } from "./records.js";
import type { Build } from "./state.js";
import { isStaticView } from "./views.js";

const ELEMENT_PREFIX = "c4modeler.element.";
const RELATIONSHIP_PREFIX = "c4modeler.relationship.";

const NO_LAYOUT: StoredLayout = {
  elements: new Map(),
  relationships: new Map(),
  unmatched: [],
  malformed: [],
};

export function finishViews(build: Build): ViewDefinition[] {
  viewsAboveTheModel(build);
  return build.views.map((view) => viewDefinition(view));
}

/**
 * Structurizr runs a view's include and exclude statements where they are written, so `*` and
 * expressions in a views block above the model find no element and the view stays empty there.
 * Membership reads the finished model, so the canvas would show what Structurizr doesn't: the
 * view is kept read-only, as for a term the modeler can't read.
 */
function viewsAboveTheModel(build: Build): void {
  const model = build.modelStatement;
  if (model === undefined) return;
  for (const view of build.views) {
    if (!isStaticView(view) || view.statement.range.start > model.range.start) continue;
    const content = view.contents.find((statement) =>
      statement.terms.some((term) => parseExpression(term.text)?.kind !== "reference"),
    );
    if (content === undefined) continue;
    view.unsupported = true;
    build.report.note(
      "unsupported-expression",
      "warning",
      "Structurizr reads this view before the model below it, so “*” and expressions here find no element and the view stays empty there. Move the views block below the model; until then the view is read-only.",
      content.statement.head,
      () => `${view.key} above the model`,
    );
  }
}

function viewDefinition(view: ViewRecord): ViewDefinition {
  const staticType = isStaticView(view);
  const readOnlyReason = !staticType
    ? "type"
    : !view.scopeValid
      ? "scope"
      : view.unsupported
        ? "expression"
        : undefined;
  return {
    key: view.key,
    keyGenerated: view.keyGenerated,
    type: view.viewType,
    scopeId: view.scope?.id ?? (view.scopeText === "*" ? undefined : view.scopeText),
    baseKey: view.baseKey,
    title: view.title,
    description: view.description,
    isDefault: view.defaultStatements.length > 0,
    autoLayout: view.autoLayout,
    statements: view.contents.map((content) => ({
      kind: content.kind,
      terms: content.terms.map((term) => ({
        text: term.text,
        expression: parseExpression(term.text),
      })),
    })),
    properties: Object.fromEntries(view.properties),
    layout: NO_LAYOUT,
    editable: readOnlyReason === undefined,
    readOnlyReason,
  };
}

/** The views with their layout, read against the finished model; reports what the reading finds. */
export function finishLayout(build: Build, draft: Workspace): ViewDefinition[] {
  return draft.views.map((definition, index) => {
    const view = build.views[index];
    if (view === undefined) return definition;
    const members = membersOf(build, draft, view, definition);
    animationSteps(build, draft, view, definition);
    if (definition.isDefault && !definition.editable) {
      const statement = view.defaultStatements[0] ?? view.statement;
      build.report.note(
        "default-not-editable",
        "info",
        "The modeler opens only landscape, context, container and component views it can edit, so it ignores this default and opens another view first. Structurizr still opens this one.",
        statement.head,
        () => `${view.key} default`,
      );
    }
    return { ...definition, layout: storedLayout(build, view, members) };
  });
}

function membersOf(
  build: Build,
  draft: Workspace,
  view: ViewRecord,
  definition: ViewDefinition,
): ViewMembers | undefined {
  if (!isStaticView(view) || !view.scopeValid) return undefined;
  const entry: ViewEntry = {
    key: view.key,
    state: "written",
    type: view.viewType,
    scopeId: definition.scopeId,
    editable: definition.editable,
    title: "",
    definition,
  };
  const members = viewMembers(draft, entry);
  for (const diagnostic of members.diagnostics) positioned(build, view, diagnostic);
  return members;
}

/** Membership's diagnostics carry the view and the term but no position: the term's token gives it. */
function positioned(build: Build, view: ViewRecord, diagnostic: Diagnostic): void {
  const prefix = `${view.key} `;
  const rest = diagnostic.anchor.startsWith(prefix) ? diagnostic.anchor.slice(prefix.length) : "";
  const kind = rest.startsWith("include ") ? "include" : "exclude";
  const text = rest.slice(kind.length + 1);
  let range = view.statement.head;
  for (const content of view.contents) {
    const term =
      content.kind === kind
        ? content.terms.find((candidate) => candidate.text === text)
        : undefined;
    if (term) {
      range = content.statement.tokens[term.token]?.range ?? content.statement.head;
      break;
    }
  }
  build.report.add({
    code: diagnostic.code,
    severity: diagnostic.severity,
    rejects: diagnostic.rejects,
    message: diagnostic.message,
    range,
    anchor: () => diagnostic.anchor,
    elementId: () => diagnostic.elementId,
  });
}

function entrySite(view: ViewRecord, key: string): PropertyEntrySite | undefined {
  for (const block of [...view.propertiesBlocks].reverse()) {
    const entry = [...block.entries].reverse().find((candidate) => candidate.key === key);
    if (entry) return entry;
  }
  return undefined;
}

function storedLayout(
  build: Build,
  view: ViewRecord,
  members: ViewMembers | undefined,
): StoredLayout {
  const elements = new Map<ElementId, StoredBox>();
  const relationships = new Map<string, readonly Point[]>();
  const unmatched: string[] = [];
  const malformed: string[] = [];
  const shownElements = new Map((members?.elements ?? []).map((id) => [id.toLowerCase(), id]));
  const shownRelationships = new Map(
    (members?.relationships ?? []).map((key) => [key.toLowerCase(), key]),
  );
  for (const [key, value] of view.properties) {
    const element = key.startsWith(ELEMENT_PREFIX);
    if (!element && !key.startsWith(RELATIONSHIP_PREFIX)) continue;
    const name = key.slice(element ? ELEMENT_PREFIX.length : RELATIONSHIP_PREFIX.length);
    const decoded = element ? decodeElementLayout(value) : decodeVertices(value);
    if (decoded === undefined) {
      malformed.push(key);
      layoutNote(build, view, key, "layout-malformed");
      continue;
    }
    const id = (element ? shownElements : shownRelationships).get(name.toLowerCase());
    if (id === undefined) {
      unmatched.push(key);
      layoutNote(build, view, key, "layout-unmatched");
    } else if (element) {
      elements.set(id, decoded as StoredBox);
    } else {
      relationships.set(id, decoded as Point[]);
    }
  }
  return { elements, relationships, unmatched, malformed };
}

function layoutNote(
  build: Build,
  view: ViewRecord,
  key: string,
  code: "layout-malformed" | "layout-unmatched",
): void {
  const site = entrySite(view, key);
  const range = site?.statement.head ?? view.statement.head;
  if (code === "layout-malformed") {
    build.report.note(
      code,
      "warning",
      `The modeler can't read the layout value of “${key}”, so it places the item itself and rewrites the value with the next move. Write it as x,y or x,y,width,height (points separated by spaces for relationships).`,
      range,
      () => `${view.key} ${key}`,
    );
  } else {
    build.report.note(
      code,
      "info",
      `“${key}” names nothing this view shows, so the modeler keeps it and ignores it. “Lay out automatically” removes it.`,
      range,
      () => `${view.key} ${key}`,
    );
  }
}
