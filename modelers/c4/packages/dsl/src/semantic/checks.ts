/*
 * Diagnostics that need the finished model: dynamic steps Structurizr can't add to their view
 * (read before the workspace is assembled, which records the relationship each step shows),
 * `-/>` statements that remove nothing, and self-set text colours the style cascade adjusts for
 * contrast (SPEC 6.4).
 */
import {
  resolveElementStyle,
  type ModelElement,
  type Relationship,
  type Workspace,
} from "@miragon/c4-schema-model";
import type { ElementRecord, Target, ViewRecord } from "./records.js";
import type { FinishedRelationships } from "./relations.js";
import type { Build, DynamicStepSite, NoRelationshipSite } from "./state.js";
import { isStaticView } from "./views.js";

export function finalChecks(
  build: Build,
  workspace: Workspace,
  relationships: FinishedRelationships,
): void {
  viewTerms(build);
  if (!workspace.openWorld) noRelationships(build, relationships);
  textColours(build, workspace);
}

/**
 * `NoRelationshipParser`: each end is a software system or a container (all its instances in the
 * environment) or one of their instances, and the statement must remove at least one relationship
 * replicated between those instances. Structurizr replicates only static relationships written
 * above, so a pair with no instance or no such relationship fails for sure.
 */
function noRelationships(build: Build, relationships: FinishedRelationships): void {
  const written = new Map<FinishedRelationships["relationships"][number], number>();
  const recordOf = new Map([...relationships.byRecord].map(([record, item]) => [item, record]));
  let position = -1;
  for (const relationship of relationships.creationOrder) {
    const record = recordOf.get(relationship);
    if (record !== undefined) position = record.statement.range.start;
    written.set(relationship, position);
  }
  for (const site of build.noRelationships) {
    const start = site.values.statement.range.start;
    const environment = site.context.environmentName;
    const source = noRelationshipEnd(build, site, site.source, 0, environment, start);
    const destination = noRelationshipEnd(build, site, site.destination, 2, environment, start);
    if (source === null || destination === null) continue;
    const replicated =
      source.instances > 0 &&
      destination.instances > 0 &&
      [...written].some(
        ([relationship, at]) =>
          at < start &&
          relationship.sourceId === source.element.id &&
          relationship.destinationId === destination.element.id &&
          (site.description === undefined || relationship.description === site.description),
      );
    if (replicated) continue;
    const described =
      site.description === undefined ? "" : ` with the description “${site.description}”`;
    build.incompatible(
      site.values,
      site.context,
      `No relationship from ${source.element.name} to ${destination.element.name}${described} is copied into the instances of this deployment environment, so Structurizr refuses this “-/>”. Remove it, or add the relationship to the model above the environment.`,
    );
  }
}

/** The static element an end stands for and how many of its instances the environment has; null when it can't be checked. */
function noRelationshipEnd(
  build: Build,
  site: NoRelationshipSite,
  end: Target | undefined,
  token: number,
  environment: string | undefined,
  start: number,
): { readonly element: ElementRecord; readonly instances: number } | null {
  if (end === undefined) return null;
  if (end.type === "deployment" && end.instanceOf !== undefined) {
    return { element: end.instanceOf, instances: 1 };
  }
  if (end.type === "element" && (end.kind === "softwareSystem" || end.kind === "container")) {
    const instances = build.deployments.filter(
      (record) =>
        record.instanceOf === end &&
        record.environment === environment &&
        record.statement.range.start < start,
    ).length;
    return { element: end, instances };
  }
  build.incompatible(
    site.values,
    site.context,
    `“${site.values.tokens[token] ?? ""}” isn't a software system, a container or an instance of one, so Structurizr refuses this “-/>”. Name one of those instead.`,
    "invalid-statement",
    token,
  );
  return null;
}

/**
 * Structurizr resolves a view's terms where the view is written, so an identifier defined only
 * further down (a views block above the model) fails there although the finished model has it.
 * A static view's terms nothing defines at all are membership's unresolved references; the other
 * view types are never projected, so they are reported here.
 */
function viewTerms(build: Build): void {
  for (const term of build.pendingTerms) {
    const later = build.register.has(term.written.toLowerCase());
    const view = term.context.view;
    if (!later && (view === undefined || isStaticView(view))) continue;
    build.unresolved(
      term.values,
      term.context,
      term.token,
      later
        ? `“${term.written}” is defined only below this view, and Structurizr reads top to bottom, so it refuses the term. Move the views block below the model.`
        : `Nothing in the model is identified by “${term.written}”, so Structurizr refuses this view. Check the identifier.`,
    );
  }
}

/** What one dynamic view holds so far, step by step, as `DynamicView` adds to it. */
interface DynamicContent {
  readonly elements: Set<ElementRecord>;
  readonly relationships: Set<Relationship>;
}

/**
 * `DynamicView.add` and `DynamicViewContentParser`: a step names a relationship from source to
 * destination (with the technology when one is written), or the reverse one when an earlier step
 * of the view already shows it (a reply); each end must be allowed in the view's scope.
 */
export function dynamicSteps(build: Build, relationships: FinishedRelationships): void {
  if (build.openWorld) return;
  const between = new Map<string, Relationship[]>();
  for (const relationship of relationships.creationOrder) {
    const pair = `${relationship.sourceId}\u0000${relationship.destinationId}`;
    between.set(pair, [...(between.get(pair) ?? []), relationship]);
  }
  const contents = new Map<ViewRecord, DynamicContent>();
  for (const step of build.dynamicSteps) {
    const content = contents.get(step.view) ?? { elements: new Set(), relationships: new Set() };
    contents.set(step.view, content);
    const named = step.relationship && relationships.byRecord.get(step.relationship);
    const ends = named
      ? [step.relationship?.source, step.relationship?.destination]
      : step.elements;
    const [source, destination] = ends;
    if (source === undefined || destination === undefined || ends.length !== 2) continue;
    if (!endsAllowed(build, step, content, source, destination)) continue;
    const shown = named || stepRelationship(build, step, content, between, source, destination);
    if (shown === undefined) continue;
    step.resolved = shown;
    content.relationships.add(shown);
    content.elements.add(source);
    content.elements.add(destination);
  }
}

function stepRelationship(
  build: Build,
  step: DynamicStepSite,
  content: DynamicContent,
  between: ReadonlyMap<string, readonly Relationship[]>,
  source: ElementRecord,
  destination: ElementRecord,
): Relationship | undefined {
  const technology = step.technology ?? "";
  /** Without a technology the first one (with the step's description first), else the last with it. */
  const pick = (from: ElementRecord, to: ElementRecord, description?: string) => {
    const all = between.get(`${from.id}\u0000${to.id}`) ?? [];
    if (technology !== "")
      return all.filter((relationship) => relationship.technology === technology).at(-1);
    const described = all.find((relationship) => relationship.description === description);
    return described ?? all[0];
  };
  const forward = pick(source, destination, step.description ?? "");
  if (forward) return forward;
  const reply = pick(destination, source);
  if (reply && content.relationships.has(reply)) return reply;
  const withTechnology = technology === "" ? "" : ` with the technology ${technology}`;
  const message =
    reply !== undefined
      ? `Only ${destination.name} has a relationship${withTechnology} to ${source.name}, and Structurizr draws a step against it as a reply only after a step of this view shows it. Add that step above, or add the relationship from ${source.name} to ${destination.name}.`
      : `No relationship${withTechnology} connects ${source.name} and ${destination.name}, so Structurizr refuses this dynamic step. Add the relationship to the model first.`;
  stepError(build, step, message);
  return undefined;
}

/** `DynamicView.checkElementCanBeAdded` for the view's scope. */
function endsAllowed(
  build: Build,
  step: DynamicStepSite,
  content: DynamicContent,
  source: ElementRecord,
  destination: ElementRecord,
): boolean {
  for (const element of [source, destination]) {
    const problem = scopeProblem(step.view, content, element);
    if (problem === undefined) continue;
    stepError(build, step, problem);
    return false;
  }
  return true;
}

function scopeProblem(
  view: ViewRecord,
  content: DynamicContent,
  element: ElementRecord,
): string | undefined {
  if (element.kind === "custom" || element.kind === "person") return undefined;
  const scope = view.scope;
  if (scope === undefined) {
    if (view.scopeText !== "*" || element.kind === "softwareSystem") return undefined;
    return `A dynamic view of the whole landscape shows only people, software systems and custom elements, so Structurizr refuses ${element.name} in this step. Scope the view to a software system or a container.`;
  }
  if (!view.scopeValid) return undefined;
  if (element === scope || (scope.kind === "container" && element === scope.parent)) {
    return `${element.name} is the scope of this dynamic view, so Structurizr can't add it to a step. Name one of its children or another element instead.`;
  }
  if (scope.kind === "softwareSystem" && element.kind === "component") {
    return `A dynamic view of a software system shows no components, so Structurizr refuses ${element.name} in this step. Name its container instead.`;
  }
  return familyProblem(content, element);
}

/** `ModelView.checkParentAndChildrenHaveNotAlreadyBeenAdded`. */
function familyProblem(content: DynamicContent, element: ElementRecord): string | undefined {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (content.elements.has(parent))
      return `${parent.name}, which holds ${element.name}, is already in this dynamic view, so Structurizr refuses ${element.name} in this step. Name elements of one level.`;
  }
  for (const shown of content.elements) {
    for (let parent = shown.parent; parent; parent = parent.parent) {
      if (parent === element)
        return `${shown.name}, which is inside ${element.name}, is already in this dynamic view, so Structurizr refuses ${element.name} in this step. Name elements of one level.`;
    }
  }
  return undefined;
}

function stepError(build: Build, step: DynamicStepSite, message: string): void {
  build.report.incompatible(
    "unresolved-reference",
    message,
    step.statement.head,
    () => `${step.view.key} ${build.report.statementText(step.statement.head)}`,
  );
}

const PROBE: Omit<ModelElement, "tags"> = {
  id: "",
  identifier: undefined,
  implicit: true,
  kind: "softwareSystem",
  archetype: undefined,
  parentId: undefined,
  name: "",
  description: "",
  technology: "",
  metadata: "",
  ownTags: [],
  url: undefined,
  properties: {},
  group: undefined,
  fields: {} as ModelElement["fields"],
};

function textColours(build: Build, workspace: Workspace): void {
  for (const style of workspace.styles.elements) {
    if (style.color === undefined) continue;
    const resolved = resolveElementStyle(
      { ...PROBE, tags: [style.tag] },
      { ...workspace.styles, elements: [style] },
    );
    if (resolved.text === undefined || resolved.text === style.color) continue;
    const record = build.styles.find(
      (candidate) => candidate.type === "elementStyle" && candidate.tag === style.tag,
    );
    if (record === undefined) continue;
    build.report.note(
      "text-colour-adjusted",
      "info",
      `The text colour of “${style.tag}” is too faint on its background, so the modeler draws the text in ${resolved.text} instead. Choose a colour with more contrast to keep yours.`,
      record.statement.head,
      () => `style ${style.tag} color`,
    );
  }
}
