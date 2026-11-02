/*
 * Animation steps (`StaticView.addAnimation`, `CustomView.addAnimation`,
 * `DeploymentView.addAnimationStep`): a step adds the elements its terms name that the view shows
 * at that point and no earlier step added; Structurizr refuses a step that adds none. The steps
 * of a view are followed while every term can be evaluated here; from the first one that can't,
 * they are recorded as unchecked, so the edit layer refuses an edit that could change them. In an
 * open world nothing is checked, like the other references into included content.
 */
import {
  parseExpression,
  viewMembers,
  type Expression,
  type ViewDefinition,
  type ViewEntry,
  type ViewStatement,
  type ViewTerm,
  type Workspace,
} from "@miragon/c4-schema-model";
import type { DeploymentRecord, ElementRecord, Target, ViewRecord } from "./records.js";
import type { Build } from "./state.js";
import { isStaticView } from "./views.js";

type Step = ViewRecord["animationSteps"][number];

/** How one view type answers the two questions a step asks; undefined when it can't. */
interface Animated {
  /** What the view shows after its first `statements` include and exclude statements. */
  shownAt(statements: number): ReadonlySet<unknown> | undefined;
  /** What a term names among the shown items, of the kinds the view type animates. */
  named(
    term: string,
    expression: Expression,
    statements: number,
    shown: ReadonlySet<unknown>,
  ): ReadonlySet<unknown> | undefined;
}

const STATIC_ANIMATED: ReadonlySet<string> = new Set([
  "person",
  "softwareSystem",
  "container",
  "component",
]);

const ALL_CUSTOM: ViewStatement = {
  kind: "include",
  terms: [term("element.type==Custom")],
};

function term(text: string): ViewTerm {
  return { text, expression: parseExpression(text) };
}

export function animationSteps(
  build: Build,
  draft: Workspace,
  view: ViewRecord,
  definition: ViewDefinition,
): void {
  // Included content may define what a step names or what the view shows: nothing to check.
  if (view.animationSteps.length === 0 || build.openWorld) return;
  const animated = animatedOf(build, draft, view, definition);
  if (animated === undefined) {
    uncheck(build, view, view.animationSteps);
    return;
  }
  const done = new Set<unknown>();
  const shownBefore = new Map<number, ReadonlySet<unknown> | undefined>();
  for (const [index, step] of view.animationSteps.entries()) {
    const statements = view.contents.filter(
      (content) => content.statement.range.start < step.statement.range.start,
    ).length;
    if (!shownBefore.has(statements)) shownBefore.set(statements, animated.shownAt(statements));
    const shown = shownBefore.get(statements);
    const named = shown && namedBy(build, animated, step, statements, shown);
    if (named === undefined) {
      uncheck(build, view, view.animationSteps.slice(index));
      return;
    }
    const added = [...named].filter((item) => !done.has(item));
    for (const item of added) done.add(item);
    if (added.length > 0) continue;
    build.report.incompatible(
      "invalid-statement",
      named.size === 0
        ? "This animation step names no element the view shows at this point, so Structurizr refuses it. Name an element of the view, or remove the step."
        : "Every element this animation step names is already shown by an earlier step, so Structurizr refuses the step. Name an element the view adds here, or remove the step.",
      step.statement.head,
      () => `${view.key} ${build.report.statementText(step.statement.head)}`,
    );
  }
}

function uncheck(build: Build, view: ViewRecord, steps: readonly Step[]): void {
  for (const step of steps) build.uncheckedSteps.push({ view, statement: step.statement });
}

function namedBy(
  build: Build,
  animated: Animated,
  step: Step,
  statements: number,
  shown: ReadonlySet<unknown>,
): Set<unknown> | undefined {
  const named = new Set<unknown>();
  for (const text of step.terms) {
    const expression = parseExpression(text);
    if (expression === undefined) return undefined;
    // `*` isn't an expression to `ExpressionParser.isExpression`, and no element is called that.
    if (expression.kind === "all") continue;
    if (expression.kind === "reference" && !build.register.has(text.toLowerCase())) {
      return undefined;
    }
    const found = animated.named(text, expression, statements, shown);
    if (found === undefined) return undefined;
    for (const item of found) named.add(item);
  }
  return named;
}

function animatedOf(
  build: Build,
  draft: Workspace,
  view: ViewRecord,
  definition: ViewDefinition,
): Animated | undefined {
  const supported = definition.statements.every((statement) =>
    statement.terms.every((candidate) => candidate.expression !== undefined),
  );
  if (!supported) return undefined;
  if (isStaticView(view)) {
    return view.scopeValid ? staticView(draft, view, definition) : undefined;
  }
  if (view.viewType === "custom") return customView(draft, view, definition);
  if (view.viewType === "deployment") return deploymentView(build, view, definition);
  return undefined;
}

function entryOf(
  view: ViewRecord,
  definition: ViewDefinition,
  type: ViewEntry["type"],
  statements: readonly ViewStatement[],
): ViewEntry {
  return {
    key: view.key,
    state: "written",
    type,
    scopeId: type === "systemLandscape" ? undefined : definition.scopeId,
    editable: definition.editable,
    title: "",
    definition: { ...definition, type, statements },
  };
}

function lowerIds(ids: readonly string[]): Set<string> {
  return new Set(ids.map((id) => id.toLowerCase()));
}

/**
 * What a term names among the shown elements is what an `exclude` of the term takes away from
 * them: membership evaluates the term exactly as the include and exclude statements do. The
 * context view's own system can't be excluded, which membership reports for the term instead.
 */
function staticView(draft: Workspace, view: ViewRecord, definition: ViewDefinition): Animated {
  const kinds = new Map(draft.elements.map((element) => [element.id.toLowerCase(), element.kind]));
  const statements = (count: number) => definition.statements.slice(0, count);
  const scope = definition.scopeId?.toLowerCase();
  return {
    shownAt: (count) =>
      lowerIds(
        viewMembers(draft, entryOf(view, definition, view.viewType, statements(count))).elements,
      ),
    named: (text, expression, count, shown) => {
      const excluded = viewMembers(
        draft,
        entryOf(view, definition, view.viewType, [
          ...statements(count),
          { kind: "exclude", terms: [{ text, expression }] },
        ]),
      );
      const left = lowerIds(excluded.elements);
      const named = new Set([...shown].filter((id) => !left.has(id as string)));
      const keepsScope = excluded.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "structurizr-rejects" &&
          diagnostic.elementId?.toLowerCase() === scope,
      );
      if (keepsScope && scope !== undefined) named.add(scope);
      return new Set([...named].filter((id) => STATIC_ANIMATED.has(kinds.get(id as string) ?? "")));
    },
  };
}

/**
 * A custom view shows custom elements only. A system landscape view takes custom elements as
 * well, so the same include and exclude statements evaluated there and narrowed to custom
 * elements give the custom view's content; `*` adds every custom element.
 */
function customView(draft: Workspace, view: ViewRecord, definition: ViewDefinition): Animated {
  const custom = new Set(
    draft.elements
      .filter((element) => element.kind === "custom")
      .map((element) => element.id.toLowerCase()),
  );
  const landscape = (statements: readonly ViewStatement[]) =>
    new Set(
      [
        ...lowerIds(
          viewMembers(draft, entryOf(view, definition, "systemLandscape", statements)).elements,
        ),
      ].filter((id) => custom.has(id)),
    );
  const translated = definition.statements.map((statement): ViewStatement => ({
    kind: statement.kind,
    terms: statement.terms.map((candidate) =>
      candidate.expression?.kind === "all" ? (ALL_CUSTOM.terms[0] as ViewTerm) : candidate,
    ),
  }));
  const every = landscape([ALL_CUSTOM]);
  return {
    shownAt: (count) => landscape(translated.slice(0, count)),
    named: (text, expression, _count, shown) => {
      const left = landscape([ALL_CUSTOM, { kind: "exclude", terms: [{ text, expression }] }]);
      return new Set([...every].filter((id) => !left.has(id) && shown.has(id)));
    },
  };
}

/**
 * Deployment views are not projected, so the view is taken to show every instance and
 * infrastructure node of its environment: at least what Structurizr shows, so a step reported
 * here fails there too. An identifier names an instance or a node, a software system or a
 * container all its instances (`DeploymentViewExpressionParser.getElements`); expressions are
 * not followed. Neither are the view's include and exclude statements, so the steps stay
 * unchecked when one of them holds an expression: an edit (a tag, a relationship) can change
 * what it takes out of the view, and with it what a step still adds.
 */
function deploymentView(
  build: Build,
  view: ViewRecord,
  definition: ViewDefinition,
): Animated | undefined {
  const fixedContent = definition.statements.every((statement) =>
    statement.terms.every(
      (candidate) =>
        candidate.expression?.kind === "all" || candidate.expression?.kind === "reference",
    ),
  );
  if (!fixedContent) return undefined;
  const environment = view.environment;
  const inEnvironment = build.deployments.filter(
    (record) =>
      record.environment === environment &&
      (record.kind === "containerInstance" ||
        record.kind === "softwareSystemInstance" ||
        record.kind === "infrastructureNode"),
  );
  const shown = new Set<unknown>(inEnvironment);
  const instancesOf = (element: ElementRecord) =>
    inEnvironment.filter((record) => record.instanceOf === element);
  const itemsOf = (target: Target): readonly DeploymentRecord[] => {
    switch (target.type) {
      case "element":
        return target.kind === "softwareSystem" || target.kind === "container"
          ? instancesOf(target)
          : [];
      case "group":
        return target.members.flatMap(instancesOf);
      case "deployment":
        return shown.has(target) ? [target] : [];
      default:
        return [];
    }
  };
  return {
    shownAt: () => shown,
    named: (text, expression) => {
      if (expression.kind !== "reference") return undefined;
      const target = build.register.get(text.toLowerCase());
      return new Set(target === undefined ? [] : itemsOf(target));
    },
  };
}
