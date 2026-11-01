/*
 * The `views` block (R-DSL §11): view heads with their keys and scopes, `include` / `exclude`
 * terms, `autoLayout`, titles, descriptions, `default`, animations, dynamic steps and image
 * sources. A keyless view gets the key Structurizr's `generateViewKey` gives it (SPEC 4.2).
 */
import {
  generateViewKey,
  parseExpression,
  type AutoLayout,
  type ElementKind,
  type Expression,
  type ViewType,
} from "@miragon/c4-schema-model";
import { child, type Context } from "./context.js";
import { checkArity, requireBlock, type Outcome } from "./outcome.js";
import type { ElementRecord, ReferenceSite, Target, ViewRecord } from "./records.js";
import type { Build, Values } from "./state.js";

interface Head {
  readonly type: ViewType;
  readonly grammar: string;
  /** Token index of the scope, the key, the description and the custom view's title. */
  readonly scope?: number;
  readonly key: number;
  readonly description?: number;
  readonly title?: number;
  readonly maximum: number;
  readonly scopeKinds?: readonly ElementKind[];
  readonly wildcard?: boolean;
}

const HEADS: Readonly<Record<string, Head>> = {
  systemlandscape: {
    type: "systemLandscape",
    grammar: "systemLandscape [key] [description] {",
    key: 1,
    description: 2,
    maximum: 3,
  },
  systemcontext: {
    type: "systemContext",
    grammar: "systemContext <software system identifier> [key] [description] {",
    scope: 1,
    key: 2,
    description: 3,
    maximum: 4,
    scopeKinds: ["softwareSystem"],
  },
  container: {
    type: "container",
    grammar: "container <software system identifier> [key] [description] {",
    scope: 1,
    key: 2,
    description: 3,
    maximum: 4,
    scopeKinds: ["softwareSystem"],
  },
  component: {
    type: "component",
    grammar: "component <container identifier> [key] [description] {",
    scope: 1,
    key: 2,
    description: 3,
    maximum: 4,
    scopeKinds: ["container"],
  },
  dynamic: {
    type: "dynamic",
    grammar: "dynamic <*|software system identifier|container identifier> [key] [description] {",
    scope: 1,
    key: 2,
    description: 3,
    maximum: 4,
    scopeKinds: ["softwareSystem", "container"],
    wildcard: true,
  },
  deployment: {
    type: "deployment",
    grammar: "deployment <*|software system identifier> <environment> [key] [description] {",
    scope: 1,
    key: 3,
    description: 4,
    maximum: 5,
    scopeKinds: ["softwareSystem"],
    wildcard: true,
  },
  custom: {
    type: "custom",
    grammar: "custom [key] [title] [description] {",
    key: 1,
    title: 2,
    description: 3,
    maximum: 4,
  },
  image: {
    type: "image",
    grammar: "image <*|element identifier> [key] {",
    scope: 1,
    key: 2,
    maximum: 3,
    wildcard: true,
  },
  filtered: {
    type: "filtered",
    grammar: "filtered <baseKey> <include|exclude> <tags> [key] [description]",
    key: 4,
    description: 5,
    maximum: 6,
  },
};

const VIEW_KEY = /^[a-zA-Z0-9_-]+$/;
const STATIC_TYPES: ReadonlySet<ViewType> = new Set([
  "systemLandscape",
  "systemContext",
  "container",
  "component",
]);

export function isViewKeyword(lower: string): boolean {
  return Object.hasOwn(HEADS, lower);
}

/** A view statement in `views`. */
export function createView(build: Build, values: Values, context: Context): Outcome {
  const head = HEADS[values.lower];
  if (head === undefined) return undefined;
  const statement = values.statement;
  build.role(statement, "view");
  checkArity(
    build,
    values,
    context,
    head.grammar,
    head.type === "filtered" ? 4 : head.scope === undefined ? 1 : 2,
    head.maximum,
  );
  const scope = resolveScope(build, values, context, head);
  const keyed = viewKey(build, values, context, head);
  const environment =
    head.type === "deployment" ? checkEnvironment(build, values, context) : undefined;
  const baseKey = head.type === "filtered" ? filteredBase(build, values, context) : undefined;
  const record: ViewRecord = {
    type: "view",
    order: build.views.length,
    viewType: head.type,
    statement,
    key: keyed.key,
    keyGenerated: keyed.generated,
    keyToken: keyed.token,
    scopeToken: head.scope,
    scopeText: head.scope === undefined ? undefined : values.tokens[head.scope],
    scope: scope.element,
    scopeValid: scope.valid,
    baseKey,
    environment,
    positionalDescriptionToken: tokenIfPresent(values, head.description),
    positionalTitleToken: tokenIfPresent(values, head.title),
    title: head.title === undefined ? undefined : values.tokens[head.title],
    description: head.description === undefined ? undefined : values.tokens[head.description],
    titleStatements: [],
    descriptionStatements: [],
    defaultStatements: [],
    autoLayoutStatements: [],
    autoLayout: undefined,
    contents: [],
    animations: [],
    animationSteps: [],
    propertiesBlocks: [],
    properties: new Map(),
    unsupported: false,
  };
  build.views.push(record);
  build.viewKeys.add(record.key);
  if (!STATIC_TYPES.has(head.type)) build.reportNotEditableView(values, context);
  const opened: Context = { kind: "view", view: record, anchor: () => `${record.key} ` };
  if (head.type === "filtered" && statement.block === undefined) return "leaf";
  return head.type === "filtered" ? opened : requireBlock(build, values, context, opened);
}

function tokenIfPresent(values: Values, token: number | undefined): number | undefined {
  return token !== undefined && token < values.tokens.length ? token : undefined;
}

function resolveScope(
  build: Build,
  values: Values,
  context: Context,
  head: Head,
): { readonly element: ElementRecord | undefined; readonly valid: boolean } {
  if (head.scope === undefined || head.type === "filtered")
    return { element: undefined, valid: true };
  const written = values.tokens[head.scope];
  if (written === undefined) return { element: undefined, valid: false };
  if (head.wildcard && written === "*") return { element: undefined, valid: true };
  const found = build.lookup(written, context);
  const element = found?.target.type === "element" ? found.target : undefined;
  if (element) {
    build.references.push({
      statement: values.statement,
      token: head.scope,
      kind: "view-scope",
      written,
      exact: true,
      relativeTo: found?.relativeTo,
      target: element,
    });
  }
  if (head.type === "image") return { element, valid: found !== undefined };
  const valid = element !== undefined && (head.scopeKinds ?? []).includes(element.kind);
  if (!valid) {
    const wanted = (head.scopeKinds ?? [])
      .map((kind) => (kind === "softwareSystem" ? "software system" : kind))
      .join(" or ");
    const message =
      found === undefined
        ? `Nothing above the views is identified by “${written}”, so this view has no ${wanted} to show and stays read-only. Check the identifier.`
        : `“${written}” isn't a ${wanted}, so Structurizr refuses this view and it stays read-only. Name a ${wanted}.`;
    const range = build.tokenRange(values.statement, head.scope);
    const anchor = build.anchor(values.statement, context);
    if (build.openWorld) build.report.note("view-scope-invalid", "warning", message, range, anchor);
    else build.report.incompatible("view-scope-invalid", message, range, anchor);
  }
  return { element, valid };
}

function viewKey(
  build: Build,
  values: Values,
  context: Context,
  head: Head,
): { readonly key: string; readonly generated: boolean; readonly token: number | undefined } {
  const written = values.tokens[head.key];
  if (written === undefined) {
    return { key: generateViewKey(head.type, build.viewKeys), generated: true, token: undefined };
  }
  if (!VIEW_KEY.test(written)) {
    build.incompatible(
      values,
      context,
      "Structurizr allows only letters, digits, “_” and “-” in a view key. Change the key.",
      "invalid-statement",
      head.key,
    );
  }
  if (build.viewKeys.has(written)) {
    build.reject(
      values,
      context,
      "duplicate-view-key",
      `Another view above already has the key “${written}”. Give this view its own key.`,
      head.key,
    );
  }
  if (written === "")
    return { key: generateViewKey(head.type, build.viewKeys), generated: true, token: head.key };
  return { key: written, generated: false, token: head.key };
}

/** The environment's name, which a deployment view may name by the environment's identifier. */
function checkEnvironment(build: Build, values: Values, context: Context): string | undefined {
  const written = values.tokens[2];
  if (written === undefined) return undefined;
  const found = build.lookup(written, context)?.target;
  const name =
    found?.type === "deployment" && found.kind === "deploymentEnvironment" ? found.name : written;
  const exists = build.deployments.some(
    (record) => record.kind === "deploymentNode" && record.environment === name,
  );
  if (!exists && !build.openWorld) {
    build.incompatible(
      values,
      context,
      `No deployment node is in an environment “${written}”, so Structurizr refuses this view. Check the environment's identifier or name.`,
      "unresolved-reference",
      2,
    );
  }
  return name;
}

function filteredBase(build: Build, values: Values, context: Context): string | undefined {
  const baseKey = values.tokens[1];
  if (baseKey === undefined) return undefined;
  const mode = values.tokens[2]?.toLowerCase();
  if (mode !== undefined && mode !== "include" && mode !== "exclude") {
    build.incompatible(
      values,
      context,
      "Structurizr expects include or exclude as the filter mode. Write one of them after the base view's key.",
      "invalid-statement",
      2,
    );
  }
  const base = build.views.find((view) => view.key === baseKey);
  build.references.push({
    statement: values.statement,
    token: 1,
    kind: "view-base",
    written: baseKey,
    exact: true,
    relativeTo: undefined,
    target: undefined,
    viewKey: baseKey,
  });
  if (base === undefined) {
    build.unresolved(
      values,
      context,
      1,
      `No view above has the key “${baseKey}”. Check the key of the view to filter.`,
    );
  } else if (!STATIC_TYPES.has(base.viewType) && base.viewType !== "deployment") {
    build.incompatible(
      values,
      context,
      `Structurizr filters only landscape, context, container, component and deployment views, not “${baseKey}”.`,
      "invalid-statement",
      1,
    );
  } else if (base.autoLayout !== undefined) {
    build.incompatible(
      values,
      context,
      `“${baseKey}” lays itself out automatically, which Structurizr doesn't allow for the base of a filtered view. Remove its autoLayout.`,
      "invalid-statement",
      1,
    );
  }
  return baseKey;
}

/** The statements of a view's block. */
export function viewStatement(build: Build, values: Values, context: Context): Outcome {
  const view = context.view;
  if (view === undefined) return undefined;
  const common = commonViewStatement(build, values, context, view);
  if (common !== undefined) return common;
  switch (view.viewType) {
    case "dynamic":
      return dynamicStatement(build, values, context, view);
    case "image":
      return imageStatement(build, values, context);
    case "filtered":
      return undefined;
    default:
      return contentStatement(build, values, context, view);
  }
}

function commonViewStatement(
  build: Build,
  values: Values,
  context: Context,
  view: ViewRecord,
): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "autolayout":
      if (view.viewType === "filtered" || view.viewType === "image") return undefined;
      build.role(statement, "autoLayout");
      view.autoLayoutStatements.push(statement);
      view.autoLayout = autoLayout(build, values, context) ?? view.autoLayout;
      return "leaf";
    case "default":
      build.role(statement, "default");
      view.defaultStatements.push(statement);
      return "leaf";
    case "title":
      build.role(statement, "title");
      view.titleStatements.push(statement);
      if (checkArity(build, values, context, "title <title>", 2, 2)) view.title = values.tokens[1];
      return "leaf";
    case "description":
      build.role(statement, "description");
      view.descriptionStatements.push(statement);
      if (checkArity(build, values, context, "description <description>", 2, 2))
        view.description = values.tokens[1];
      return "leaf";
    default:
      return undefined;
  }
}

/** `autoLayout [tb|bt|lr|rl] [rank] [node] [edge] [vertices]`, the 6.2.4 code defaults (R-DSL §11.6). */
function autoLayout(build: Build, values: Values, context: Context): AutoLayout | undefined {
  if (
    !checkArity(
      build,
      values,
      context,
      "autoLayout [tb|bt|lr|rl] [rankSeparation] [nodeSeparation] [edgeSeparation] [vertices]",
      1,
      6,
    )
  ) {
    return undefined;
  }
  const [, direction = "lr", rank, node, edge, vertices] = values.tokens;
  if (!["tb", "bt", "lr", "rl"].includes(direction)) {
    build.incompatible(
      values,
      context,
      "Structurizr knows the rank directions tb, bt, lr and rl, in lower case. Write one of them.",
      "invalid-statement",
      1,
    );
    return undefined;
  }
  const separation = (text: string | undefined, fallback: number, index: number) => {
    if (text === undefined) return fallback;
    if (/^[+-]?\d+$/.test(text) && Math.abs(Number(text)) <= 2147483647) return Number(text);
    build.incompatible(
      values,
      context,
      "Structurizr expects whole pixels for the separations. Write a number.",
      "invalid-statement",
      index,
    );
    return fallback;
  };
  const verticesValue = vertices?.toLowerCase();
  if (verticesValue !== undefined && verticesValue !== "true" && verticesValue !== "false") {
    build.incompatible(
      values,
      context,
      "Structurizr expects true or false for vertices.",
      "invalid-statement",
      5,
    );
  }
  return {
    rankDirection: direction as AutoLayout["rankDirection"],
    rankSeparation: separation(rank, 100, 2),
    nodeSeparation: separation(node, 50, 3),
    edgeSeparation: separation(edge, 50, 4),
    vertices: verticesValue !== "false",
  };
}

function contentStatement(
  build: Build,
  values: Values,
  context: Context,
  view: ViewRecord,
): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "include":
    case "exclude":
      build.role(statement, values.lower);
      viewContent(build, values, context, view);
      return "leaf";
    case "animationstep":
      build.role(statement, "animationStep");
      view.animations.push(statement);
      animationTerms(build, values, context, 1);
      return "leaf";
    case "animation":
      build.role(statement, "animation");
      view.animations.push(statement);
      return requireBlock(build, values, context, child(context, "animation", { view }));
    default:
      return undefined;
  }
}

function viewContent(build: Build, values: Values, context: Context, view: ViewRecord): void {
  const kind = values.lower === "include" ? "include" : "exclude";
  if (values.tokens.length < 2) {
    build.incompatible(
      values,
      context,
      `Structurizr expects at least one element, relationship or expression after “${values.keyword}”. Add one.`,
    );
  }
  const terms = values.tokens.slice(1).map((text, index) => ({ token: index + 1, text }));
  view.contents.push({ statement: values.statement, kind, terms });
  for (const term of terms) {
    const expression = parseExpression(term.text);
    if (STATIC_TYPES.has(view.viewType) && expression === undefined) {
      view.unsupported = true;
      build.report.note(
        "unsupported-expression",
        "warning",
        `The modeler can't read “${term.text}”, so it draws this view without it and keeps the view read-only. Edit the view in the text.`,
        build.tokenRange(values.statement, term.token),
        build.anchor(values.statement, context),
      );
    }
    termReferences(build, values, context, term.token, term.text, expression, "view-term");
  }
}

/** Every identifier an expression names, as the edit layer renames and removes them (SPEC 3.3, 3.5). */
export function expressionOperands(expression: Expression | undefined): string[] {
  if (expression === undefined) return [];
  switch (expression.kind) {
    case "reference":
      return [expression.identifier];
    case "coupling":
    case "not":
    case "relationshipEnd":
      return expressionOperands(expression.operand);
    case "and":
    case "or":
      return [...expressionOperands(expression.left), ...expressionOperands(expression.right)];
    case "elementParent":
      return [expression.parent];
    case "relationship":
      return [expression.source, expression.destination].filter((side) => side !== "*");
    default:
      return [];
  }
}

function termReferences(
  build: Build,
  values: Values,
  context: Context,
  token: number,
  text: string,
  expression: Expression | undefined,
  kind: ReferenceSite["kind"],
): void {
  for (const written of expressionOperands(expression)) {
    const target: Target | undefined =
      build.lookup(written, context)?.target ?? build.relationshipNamed(written);
    if (target === undefined) {
      if (kind === "view-term") build.pendingTerms.push({ values, context, token, written });
      continue;
    }
    build.references.push({
      statement: values.statement,
      token,
      kind,
      written,
      exact: written === text,
      relativeTo: undefined,
      target,
    });
  }
}

function animationTerms(build: Build, values: Values, context: Context, from: number): void {
  context.view?.animationSteps.push({
    statement: values.statement,
    terms: values.tokens.slice(from),
  });
  values.tokens.slice(from).forEach((text, index) => {
    const token = index + from;
    const expression = parseExpression(text);
    termReferences(build, values, context, token, text, expression, "animation-term");
    if (
      expression?.kind === "reference" &&
      build.lookup(text, context) === undefined &&
      build.relationshipNamed(text) === undefined
    ) {
      build.unresolved(
        values,
        context,
        token,
        `Nothing above the views is identified by “${text}”, so Structurizr refuses this animation step. Check the identifier.`,
      );
    }
  });
}

/** A line of an `animation { }` block: one step. */
export function animationStep(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "animationStep");
  animationTerms(build, values, context, 0);
  return "leaf";
}

function dynamicStatement(
  build: Build,
  values: Values,
  context: Context,
  view: ViewRecord,
): Outcome {
  const statement = values.statement;
  if (values.tokens.length === 0) {
    build.role(statement, "parallel");
    return { ...context };
  }
  build.role(statement, "dynamicStep");
  const offset = values.keyword.endsWith(":") ? 1 : 0;
  const tokens = values.tokens.slice(offset);
  if (statement.block !== undefined) {
    build.report.note(
      "structurizr-rejects",
      "warning",
      "Structurizr 6.2.4 reads the “{” at the end of a dynamic step as one more value and mostly refuses the line. Move the step's url and properties out, or remove the block.",
      statement.block.open,
      build.anchor(statement, context),
    );
  }
  if (tokens.length > 1 && tokens[1] === "->") {
    if (tokens.length > 5)
      build.incompatible(
        values,
        context,
        "Structurizr expects [order:] <identifier> -> <identifier> [description] [technology]. Remove the extra values.",
      );
    const elements = [0, 2].flatMap((index) => stepEnd(build, values, context, index + offset));
    build.dynamicSteps.push({
      view,
      statement,
      elements,
      relationship: undefined,
      description: tokens[3],
      technology: tokens[4],
    });
  } else {
    if (tokens.length > 2)
      build.incompatible(
        values,
        context,
        "Structurizr expects [order:] <relationship identifier> [description]. Remove the extra values.",
      );
    const written = tokens[0] ?? "";
    const relationship = build.relationshipNamed(written);
    if (relationship === undefined) {
      build.unresolved(
        values,
        context,
        offset,
        `No relationship above is identified by “${written}”. Check the identifier.`,
      );
    } else {
      build.references.push({
        statement,
        token: offset,
        kind: "dynamic-step",
        written,
        exact: true,
        relativeTo: undefined,
        target: relationship,
      });
    }
    build.dynamicSteps.push({ view, statement, elements: [], relationship });
  }
  return child(context, "dynamicStep");
}

function stepEnd(build: Build, values: Values, context: Context, token: number): ElementRecord[] {
  const written = values.tokens[token] ?? "";
  const found = build.lookup(written, context);
  if (found === undefined) {
    build.unresolved(
      values,
      context,
      token,
      `Nothing above the views is identified by “${written}”, so Structurizr refuses this step. Check the identifier.`,
    );
    return [];
  }
  if (found.target.type !== "element") {
    build.incompatible(
      values,
      context,
      `“${written}” isn't a person, software system, container, component or custom element, so it can't take part in a dynamic step.`,
      "invalid-statement",
      token,
    );
    return [];
  }
  build.references.push({
    statement: values.statement,
    token,
    kind: "dynamic-step",
    written,
    exact: true,
    relativeTo: found.relativeTo,
    target: found.target,
  });
  return [found.target];
}

function imageStatement(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "plantuml":
    case "mermaid":
    case "kroki":
    case "image": {
      build.role(statement, "imageContent");
      const token = values.lower === "kroki" ? 2 : 1;
      const source = values.tokens[token];
      if (source !== undefined && build.viewKeys.has(source) && values.lower !== "image") {
        build.references.push({
          statement,
          token,
          kind: "image-source",
          written: source,
          exact: true,
          relativeTo: undefined,
          target: undefined,
          viewKey: source,
        });
      }
      return "leaf";
    }
    case "light":
    case "dark":
      if (statement.block === undefined) return undefined;
      build.role(statement, "colourScheme");
      return { ...context, kind: "view" };
    default:
      return undefined;
  }
}

/** `url` and `properties` of a dynamic step's (refused) block. */
export function stepStatement(build: Build, values: Values, _context: Context): Outcome {
  if (values.lower === "url") {
    build.role(values.statement, "url");
    return "leaf";
  }
  return undefined;
}

export function isStaticView(view: ViewRecord): boolean {
  return STATIC_TYPES.has(view.viewType);
}
