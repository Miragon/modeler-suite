import type {
  Diagnostic,
  DiagnosticCode,
  ElementId,
  ElementKind,
  ModelElement,
  StaticViewType,
  ViewEntry,
  ViewMembers,
  ViewStatement,
  ViewTerm,
  Workspace,
} from "../types.js";
import { evaluate, type Evaluation, type TermProblem } from "./evaluate.js";
import { isExpressionText } from "./expressions.js";
import { modelIndex, type ModelIndex } from "./modelIndex.js";
import { ViewContents } from "./viewContents.js";

const STATIC_TYPES: ReadonlySet<string> = new Set<StaticViewType>([
  "systemLandscape",
  "systemContext",
  "container",
  "component",
]);

const SCOPE_KINDS: Readonly<Record<StaticViewType, ElementKind | undefined>> = {
  systemLandscape: undefined,
  systemContext: "softwareSystem",
  container: "softwareSystem",
  component: "container",
};

const INCLUDE_EVERYTHING: readonly ViewStatement[] = [
  { kind: "include", terms: [{ text: "*", expression: { kind: "all", reluctant: false } }] },
];

const EMPTY: ViewMembers = {
  elements: [],
  relationships: [],
  boundaries: [],
  groups: [],
  diagnostics: [],
};

/**
 * The projection of a static view: include and exclude in order (SPEC 4.1), as Structurizr's
 * `StaticViewContentParser` applies them to its views. A draft or an implicit view is `include *`.
 * The diagnostics are the compatibility errors Structurizr reports for the terms; they carry the
 * view and the term as anchor but no position, which only the parser knows.
 */
export function viewMembers(workspace: Workspace, view: ViewEntry): ViewMembers {
  if (!STATIC_TYPES.has(view.type)) return EMPTY;
  const type = view.type as StaticViewType;
  const index = modelIndex(workspace);
  const scope = scopeOf(index, type, view.scopeId);
  if (scope === null) return EMPTY;
  const contents = new ViewContents(index, type, scope);
  const diagnostics: Diagnostic[] = [];
  const statements = view.definition?.statements ?? INCLUDE_EVERYTHING;
  for (const statement of statements) {
    for (const term of statement.terms) {
      const report = (problem: TermProblem) =>
        diagnostics.push(termDiagnostic(view, statement, term, problem, workspace.openWorld));
      if (statement.kind === "include") include(contents, term, report);
      else exclude(contents, term, report);
    }
  }
  return {
    elements: contents.sortedElements(),
    relationships: contents.sortedRelationships(),
    boundaries: boundaries(index, type, scope, contents),
    groups: groups(index, contents),
    diagnostics,
  };
}

/** The scope element, undefined for a landscape, null when the view's scope is missing or wrong. */
function scopeOf(
  index: ModelIndex,
  type: StaticViewType,
  scopeId: ElementId | undefined,
): ModelElement | undefined | null {
  const kind = SCOPE_KINDS[type];
  if (kind === undefined) return undefined;
  const scope = scopeId === undefined ? undefined : index.byId.get(scopeId);
  return scope?.kind === kind ? scope : null;
}

function include(
  contents: ViewContents,
  term: ViewTerm,
  report: (problem: TermProblem) => void,
): void {
  const expression = term.expression;
  if (expression === undefined) return;
  if (term.text === "*" || term.text === "element==*") return contents.addDefaultElements(true);
  if (term.text === "*?") return contents.addDefaultElements(false);
  const named = !isExpressionText(term.text);
  const found: Evaluation = evaluate(contents.index, expression, report);
  for (const element of found.elements) {
    if (!contents.kindAllowed(element.kind)) {
      if (named) report({ code: "view-element-not-permitted", subject: element });
      continue;
    }
    contents.addElement(element, true);
  }
  for (const relationship of found.relationships) contents.addRelationship(relationship);
}

function exclude(
  contents: ViewContents,
  term: ViewTerm,
  report: (problem: TermProblem) => void,
): void {
  const expression = term.expression;
  if (expression === undefined) return;
  if (expression.kind === "all") {
    report({ code: "structurizr-rejects", text: term.text });
    return;
  }
  const found = evaluate(contents.index, expression, report);
  for (const element of found.elements) {
    if (!contents.kindAllowed(element.kind)) continue;
    if (contents.removable(element)) contents.removeElement(element);
    else report({ code: "structurizr-rejects", subject: element });
  }
  for (const relationship of found.relationships) contents.removeRelationship(relationship);
}

function boundaries(
  index: ModelIndex,
  type: StaticViewType,
  scope: ModelElement | undefined,
  contents: ViewContents,
): ViewMembers["boundaries"] {
  if (type !== "container" && type !== "component") return [];
  const membersOf = new Map<ElementId, ElementId[]>();
  const frame = (id: ElementId) => {
    if (!membersOf.has(id)) membersOf.set(id, []);
    return membersOf.get(id) ?? [];
  };
  if (type === "container" && scope) frame(scope.id);
  if (type === "component" && scope?.parentId !== undefined) {
    frame(scope.parentId);
    frame(scope.id);
  }
  for (const id of contents.sortedElements()) {
    const element = index.byId.get(id);
    if (element?.parentId === undefined) continue;
    const framed =
      element.kind === "container" || (type === "component" && element.kind === "component");
    if (!framed) continue;
    frame(element.parentId).push(id);
    const grandparent = index.byId.get(element.parentId)?.parentId;
    if (element.kind === "component" && grandparent !== undefined) frame(grandparent);
  }
  const order = (id: ElementId) => index.elementOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...membersOf.entries()]
    .map(([elementId, members]) => {
      const parentId = index.byId.get(elementId)?.parentId;
      const nested = parentId !== undefined && membersOf.has(parentId);
      return nested ? { elementId, members, parentId, depth: 1 } : { elementId, members, depth: 0 };
    })
    .sort(
      (left, right) => left.depth - right.depth || order(left.elementId) - order(right.elementId),
    );
}

function groups(index: ModelIndex, contents: ViewContents): ViewMembers["groups"] {
  const members = new Map<(typeof index.workspace.groups)[number], ElementId[]>();
  for (const id of contents.sortedElements()) {
    const element = index.byId.get(id);
    if (element === undefined) continue;
    for (const group of index.groupChain(element)) {
      const list = members.get(group);
      if (list) list.push(id);
      else members.set(group, [id]);
    }
  }
  const definitions = index.workspace.groups.filter((group) => members.has(group));
  return definitions.map((group) => ({
    path: group.path,
    name: group.name,
    ...(group.parentId === undefined ? {} : { scopeId: group.parentId }),
    members: members.get(group) ?? [],
    depth: index.groupDepth(group),
  }));
}

/**
 * The identity of a group frame in a view, `<scopeId>/<path>` with an empty scope at model level.
 * No identifier holds a "/", so the first one ends the scope.
 */
export function groupKey(scopeId: ElementId | undefined, path: string): string {
  return `${scopeId ?? ""}/${path}`;
}

const MESSAGES: Readonly<
  Record<TermProblem["code"], (problem: TermProblem, type: string) => string>
> = {
  "unresolved-reference": (problem) =>
    problem.text
      ? `Nothing in the model has the identifier "${problem.text}". Check the spelling or define it in the model.`
      : "The expression selects no element, so Structurizr rejects it. Change the expression.",
  "view-element-not-permitted": (problem, type) =>
    `${problem.subject?.name ?? "This element"} can't be shown in a ${type} view, so Structurizr rejects the view. Remove it from the include.`,
  "structurizr-rejects": (problem) =>
    problem.subject
      ? `${problem.subject.name} is the system the view is about and can't be excluded. Remove it from the exclude.`
      : `"exclude ${problem.text ?? ""}" names no element, so Structurizr rejects it. Name the elements to exclude instead.`,
};

const TYPE_NAMES: Readonly<Record<string, string>> = {
  systemLandscape: "system landscape",
  systemContext: "system context",
  container: "container",
  component: "component",
};

function termDiagnostic(
  view: ViewEntry,
  statement: ViewStatement,
  term: ViewTerm,
  problem: TermProblem,
  openWorld: boolean,
): Diagnostic {
  const code: DiagnosticCode = problem.code;
  const severity = code === "unresolved-reference" && openWorld ? "warning" : "error";
  const diagnostic: Diagnostic = {
    severity,
    code,
    message: MESSAGES[problem.code](problem, TYPE_NAMES[view.type] ?? view.type),
    range: { start: 0, end: 0 },
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    rejects: false,
    anchor: `${view.key} ${statement.kind} ${term.text}`,
  };
  return problem.subject ? { ...diagnostic, elementId: problem.subject.id } : diagnostic;
}
