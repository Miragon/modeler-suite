/*
 * Which statement each block accepts, per context, in the order the reference parser's
 * `parse` loop checks them (R-DSL §3, SZ `StructurizrDslParser`). What no handler takes falls
 * back to SPEC 3.8: an element keyword in the wrong block rejects, a known keyword in the wrong
 * block is a compatibility error, an unknown word a warning.
 */
import { isKeyword } from "@miragon/c4-schema-model";
import { isInvisibleText } from "../syntax/characters.js";
import { MESSAGES } from "../syntax/diagnostics.js";
import type { Token } from "../types.js";
import { child, type Context, type ContextKind } from "./context.js";
import {
  deploymentElementGroup,
  deploymentEnvironment,
  deploymentGroup,
  deploymentNode,
  deploymentNodeKeyword,
  infrastructureNode,
  infrastructureNodeKeyword,
  instance,
} from "./deployment.js";
import { componentFinder } from "./directives.js";
import {
  archetypeBase,
  archetypeField,
  archetypeOf,
  componentGroup,
  createElement,
  createGroup,
  defineArchetype,
  definesHere,
  elementField,
  elementKeyword,
  reopenElement,
} from "./elements.js";
import {
  checkArity,
  isRelationshipOperator,
  requireBlock,
  type Handler,
  type Outcome,
} from "./outcome.js";
import type { PropertyTarget } from "./context.js";
import {
  explicitRelationship,
  implicitRelationship,
  noRelationship,
  relationshipField,
  reopenRelationship,
} from "./relationships.js";
import type { Build, Values } from "./state.js";
import {
  elementStyleStatement,
  relationshipStyleStatement,
  stylesStatement,
  terminologyStatement,
  theme,
} from "./styles.js";
import { animationStep, createView, isViewKeyword, stepStatement, viewStatement } from "./views.js";

const ELEMENT_CONTEXTS: ReadonlySet<ContextKind> = new Set([
  "element",
  "deploymentNode",
  "infrastructureNode",
  "instance",
]);

function relationshipStatement(build: Build, values: Values, context: Context): Outcome {
  const tokens = values.tokens;
  const explicitAllowed =
    context.kind === "model" ||
    context.kind === "deploymentEnvironment" ||
    ELEMENT_CONTEXTS.has(context.kind);
  if (tokens.length > 2 && isRelationshipOperator(build, tokens[1]) && explicitAllowed) {
    return explicitRelationship(build, values, context);
  }
  if (
    tokens.length >= 2 &&
    isRelationshipOperator(build, tokens[0]) &&
    ELEMENT_CONTEXTS.has(context.kind)
  ) {
    return implicitRelationship(build, values, context);
  }
  return undefined;
}

function find(build: Build, values: Values, context: Context): Outcome {
  switch (values.lower) {
    case "!element":
      return reopenElement(build, values, context);
    case "!relationship":
      return reopenRelationship(build, values, context);
    case "!ref":
    case "!extend":
      build.role(values.statement, "elementReopen");
      build.incompatible(
        values,
        context,
        `Structurizr 6.2.4 removed “${values.keyword}”. Write “!element” or “!relationship” instead.`,
      );
      return child(context, "unresolved");
    default:
      return undefined;
  }
}

/** `!elements <expression> {` and `!relationships <expression> {`: kept, not evaluated (SPEC 3.7). */
function bulk(build: Build, values: Values, context: Context): Outcome {
  if (values.lower !== "!elements" && values.lower !== "!relationships") return undefined;
  build.role(values.statement, "bulk");
  build.addOpaque(values.statement);
  build.report.note(
    "bulk-not-evaluated",
    "warning",
    `The modeler doesn't evaluate “${values.keyword}”, so the tags, fields and relationships it sets are missing on the canvas and the fields it could set are read-only. Structurizr still applies it.`,
    values.statement.head,
    build.anchor(values.statement, context),
  );
  const kind = values.lower === "!elements" ? "bulkElements" : "bulkRelationships";
  return child(context, kind, { element: context.element });
}

function properties(
  build: Build,
  values: Values,
  context: Context,
  target: PropertyTarget,
): Outcome {
  if (values.lower !== "properties") return undefined;
  build.role(values.statement, "properties");
  if (target.kind === "view" && values.statement.block) {
    target.view.propertiesBlocks.push({ statement: values.statement, entries: [] });
  }
  return requireBlock(build, values, context, child(context, "properties", { properties: target }));
}

function perspectives(build: Build, values: Values, context: Context): Outcome {
  if (values.lower !== "perspectives") return undefined;
  build.role(values.statement, "perspectives");
  return requireBlock(build, values, context, child(context, "perspectives"));
}

function docs(build: Build, values: Values, context: Context): Outcome {
  if (!["!docs", "!adrs", "!decisions"].includes(values.lower)) return undefined;
  build.role(values.statement, "docs");
  checkArity(build, values, context, `${values.keyword} <path> [importer]`, 2, 3);
  return values.statement.block ? child(context, "docs") : "leaf";
}

function first(
  build: Build,
  values: Values,
  context: Context,
  handlers: readonly Handler[],
): Outcome {
  for (const handler of handlers) {
    const outcome = handler(build, values, context);
    if (outcome !== undefined) return outcome;
  }
  return undefined;
}

const TOP_LEVEL_DIRECTIVES = new Set([
  "!const",
  "!var",
  "!include",
  "!script",
  "!plugin",
  "!impliedrelationships",
  "impliedrelationships",
  "!identifiers",
]);

function root(build: Build, values: Values, context: Context): Outcome {
  if (values.keyword === "}") return "leaf";
  if (values.lower === "workspace") return workspace(build, values, context);
  if (TOP_LEVEL_DIRECTIVES.has(values.lower)) return undefined;
  build.outside.push(values);
  return child(context, "opaque");
}

function workspace(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  build.role(statement, "workspace");
  build.workspaceCount += 1;
  if (build.workspaceCount > 1) {
    build.reject(
      values,
      context,
      "workspace-count",
      "A file holds one workspace, and this is the second. Remove it, or merge it into the first.",
    );
    return child(context, "opaque");
  }
  const info = build.workspace;
  info.statement = statement;
  checkArity(
    build,
    values,
    context,
    "workspace [name] [description] or workspace extends <file|url>",
    1,
    3,
  );
  if (values.tokens[1] === "extends") {
    info.extendsSource = values.tokens[2];
    build.openWorld = true;
    build.report.note(
      "extends-not-read",
      "warning",
      "The modeler doesn't read the workspace this one extends, so its elements and views are missing on the canvas. Structurizr still reads it.",
      statement.head,
      build.anchor(statement, context),
    );
  } else {
    info.name = values.tokens[1] ?? "";
    info.description = values.tokens[2] ?? "";
    info.nameToken = values.tokens.length > 1 ? 1 : undefined;
    info.descriptionToken = values.tokens.length > 2 ? 2 : undefined;
  }
  return requireBlock(build, values, context, { kind: "workspace", anchor: () => "" });
}

function workspaceBlock(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "name":
    case "description":
      build.role(statement, values.lower === "name" ? "workspaceName" : "workspaceDescription");
      if (checkArity(build, values, context, `${values.keyword} <${values.lower}>`, 2, 2)) {
        if (values.lower === "name") build.workspace.name = values.tokens[1] ?? "";
        else build.workspace.description = values.tokens[1] ?? "";
      }
      (values.lower === "name"
        ? build.workspace.nameStatements
        : build.workspace.descriptionStatements
      ).push(statement);
      return "leaf";
    case "model":
    case "views":
      return block(build, values, context, values.lower);
    case "configuration":
      build.role(statement, "configuration");
      return requireBlock(build, values, context, child(context, "configuration"));
    default:
      return first(build, values, context, [
        (b, v, c) => properties(b, v, c, { kind: "ignored" }),
        docs,
      ]);
  }
}

function block(build: Build, values: Values, context: Context, which: "model" | "views"): Outcome {
  const statement = values.statement;
  build.role(statement, which);
  const existing = which === "model" ? build.modelStatement : build.viewsStatement;
  if (existing !== undefined) {
    build.reject(
      values,
      context,
      "duplicate-block",
      `The workspace already has a ${which} block above. Merge this one into it.`,
    );
    return child(context, "opaque");
  }
  if (which === "model") build.modelStatement = statement;
  else build.viewsStatement = statement;
  return requireBlock(build, values, context, { kind: which, anchor: () => "" });
}

function model(build: Build, values: Values, context: Context): Outcome {
  const relationship = relationshipStatement(build, values, context);
  if (relationship !== undefined) return relationship;
  const handled = first(build, values, context, [find, bulk]);
  if (handled !== undefined) return handled;
  const element = elementKeyword(build, values.keyword);
  if (element && definesHere(element.kind, context)) {
    return createElement(build, values, context, element.kind, element.archetype);
  }
  switch (values.lower) {
    case "enterprise":
      build.incompatible(
        values,
        context,
        "Structurizr 6.2.4 removed “enterprise”. Write a group instead: group <name> { … }.",
      );
      return child(context, "unknown");
    case "archetypes":
      build.role(values.statement, "archetypes");
      return requireBlock(build, values, context, child(context, "archetypes"));
    case "deploymentenvironment":
      return deploymentEnvironment(build, values, context);
    default:
      if (isGroupKeyword(build, values.lower)) return createGroup(build, values, context);
      return properties(build, values, context, { kind: "model" });
  }
}

function isGroupKeyword(build: Build, lower: string): boolean {
  return lower === "group" || archetypeOf(build, "group", lower) !== undefined;
}

function element(build: Build, values: Values, context: Context): Outcome {
  const record = context.element;
  const relationship = relationshipStatement(build, values, context);
  if (relationship !== undefined || record === undefined) return relationship;
  const handled = first(build, values, context, [find, bulk]);
  if (handled !== undefined) return handled;
  const kind = elementKeyword(build, values.keyword);
  if (kind && definesHere(kind.kind, context)) {
    return createElement(build, values, context, kind.kind, kind.archetype);
  }
  if (values.lower === "!components" && record.kind === "container")
    return componentFinder(build, values, context);
  if (
    isGroupKeyword(build, values.lower) &&
    (record.kind === "softwareSystem" || record.kind === "container")
  ) {
    return createGroup(build, values, context);
  }
  const field = elementField(build, values, context);
  if (field !== undefined) return field;
  if (context.group === undefined) {
    const holder = first(build, values, context, [
      (b, v, c) => properties(b, v, c, { kind: "element", element: record }),
      perspectives,
    ]);
    if (holder !== undefined) return holder;
  }
  if (values.lower === "group" && record.kind === "component")
    return componentGroup(build, values, context);
  if (record.kind !== "person" && record.kind !== "custom") return docs(build, values, context);
  return undefined;
}

function relationshipBlock(build: Build, values: Values, context: Context): Outcome {
  const record = context.relationship;
  return first(build, values, context, [
    relationshipField,
    (b, v, c) =>
      record ? properties(b, v, c, { kind: "relationship", relationship: record }) : undefined,
    perspectives,
  ]);
}

function bulkBlock(build: Build, values: Values, context: Context): Outcome {
  const elements = context.kind === "bulkElements";
  const tokens = values.tokens;
  if (
    elements &&
    ((tokens.length > 2 && isRelationshipOperator(build, tokens[1])) ||
      (tokens.length >= 2 && isRelationshipOperator(build, tokens[0])))
  ) {
    build.role(values.statement, "relationship");
    return child(context, "bulkRelationships");
  }
  const fields: Readonly<Record<string, "description" | "technology" | "tags" | "url">> = {
    tag: "tags",
    tags: "tags",
    technology: "technology",
    url: "url",
    ...(elements ? { description: "description" } : {}),
  };
  const field = fields[values.lower];
  if (field !== undefined) {
    build.role(values.statement, field);
    if (elements) build.bulkElementFields.add(field);
    else build.bulkRelationshipFields.add(field);
    return "leaf";
  }
  return first(build, values, context, [
    (b, v, c) => properties(b, v, c, { kind: "ignored" }),
    perspectives,
  ]);
}

function deploymentBlock(build: Build, values: Values, context: Context): Outcome {
  const tokens = values.tokens;
  // Structurizr's `tokens.size() >= 4` counts the "{", which the syntax tree's tokens leave out.
  if (
    context.kind === "deploymentEnvironment" &&
    tokens.length >= 3 &&
    tokens[1] === "-/>" &&
    values.statement.block
  ) {
    return noRelationship(build, values, context);
  }
  const relationship = relationshipStatement(build, values, context);
  if (relationship !== undefined) return relationship;
  const handled = first(build, values, context, [find, bulk]);
  if (handled !== undefined) return handled;
  const environment = context.kind === "deploymentEnvironment";
  const node = context.kind === "deploymentNode";
  if (isGroupKeyword(build, values.lower) && (environment || node))
    return deploymentElementGroup(build, values, context);
  if (values.lower === "deploymentgroup" && (environment || node))
    return deploymentGroup(build, values, context);
  if (deploymentNodeKeyword(build, values.lower) && (environment || node))
    return deploymentNode(build, values, context);
  if (environment) return undefined;
  if (node && infrastructureNodeKeyword(build, values.lower))
    return infrastructureNode(build, values, context);
  if (
    node &&
    ["instanceof", "softwaresysteminstance", "containerinstance"].includes(values.lower)
  ) {
    return instance(build, values, context);
  }
  return deploymentField(build, values, context);
}

function deploymentField(build: Build, values: Values, context: Context): Outcome {
  const allowed = new Set(["tag", "tags", "description", "url"]);
  if (context.kind !== "instance") allowed.add("technology");
  if (context.kind === "deploymentNode") allowed.add("instances");
  if (context.kind === "instance") allowed.add("healthcheck");
  if (context.group !== undefined) return undefined;
  if (allowed.has(values.lower)) {
    build.role(values.statement, "opaque");
    return "leaf";
  }
  return first(build, values, context, [
    (b, v, c) => properties(b, v, c, { kind: "ignored" }),
    perspectives,
  ]);
}

function archetypes(build: Build, values: Values, context: Context): Outcome {
  const base = archetypeBase(build, values.keyword);
  if (base === undefined) return undefined;
  return defineArchetype(build, values, context, base);
}

function archetypeBlock(build: Build, values: Values, context: Context): Outcome {
  const archetype = context.archetype;
  return first(build, values, context, [
    archetypeField,
    (b, v, c) => (archetype ? properties(b, v, c, { kind: "archetype", archetype }) : undefined),
    perspectives,
  ]);
}

function property(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "property");
  const all = values.tokens;
  if (all.length !== 2) {
    build.incompatible(
      values,
      context,
      "Structurizr expects one name and one value per property line. Quote a name or value that holds spaces.",
    );
    return "leaf";
  }
  const [name = "", value = ""] = all;
  const target = context.properties;
  switch (target?.kind) {
    case "element":
      target.element.properties.set(name, value);
      break;
    case "relationship":
      target.relationship.properties.set(name, value);
      break;
    case "view":
      target.view.properties.set(name, value);
      target.view.propertiesBlocks
        .at(-1)
        ?.entries.push({ statement: values.statement, key: name, value });
      break;
    case "model":
      build.modelProperties.set(name, value);
      break;
    case "archetype":
      target.archetype.properties.set(name, value);
  }
  return "leaf";
}

function views(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  if (isViewKeyword(values.lower)) return createView(build, values, context);
  switch (values.lower) {
    case "styles":
      build.role(statement, "styles");
      build.stylesStatement ??= statement;
      return requireBlock(build, values, context, child(context, "styles"));
    case "theme":
    case "themes":
      return theme(build, values, context);
    case "terminology":
      build.role(statement, "terminology");
      return requireBlock(build, values, context, child(context, "terminology"));
    case "branding":
      build.incompatible(values, context, "Structurizr 6.0 removed “branding”. Remove the block.");
      return child(context, "opaque");
    default:
      return properties(build, values, context, { kind: "ignored" });
  }
}

function view(build: Build, values: Values, context: Context): Outcome {
  const record = context.view;
  if (record === undefined) return undefined;
  return first(build, values, context, [
    (b, v, c) => properties(b, v, c, { kind: "view", view: record }),
    viewStatement,
  ]);
}

function configuration(build: Build, values: Values, context: Context): Outcome {
  switch (values.lower) {
    case "scope":
    case "visibility":
      build.role(values.statement, "configuration");
      checkArity(build, values, context, `${values.keyword} <value>`, 2, 2);
      return "leaf";
    case "users":
      build.role(values.statement, "configuration");
      return requireBlock(build, values, context, child(context, "users"));
    default:
      return properties(build, values, context, { kind: "ignored" });
  }
}

const leaf: Handler = () => "leaf";

export const HANDLERS: Readonly<Record<ContextKind, Handler>> = {
  root,
  workspace: workspaceBlock,
  model,
  element,
  deploymentEnvironment: deploymentBlock,
  deploymentNode: deploymentBlock,
  infrastructureNode: deploymentBlock,
  instance: deploymentBlock,
  relationship: relationshipBlock,
  bulkElements: bulkBlock,
  bulkRelationships: bulkBlock,
  archetypes,
  archetype: archetypeBlock,
  properties: property,
  perspectives: (build, values, context) => {
    build.role(values.statement, "perspectives");
    return values.lower === "perspective" && values.statement.block
      ? child(context, "perspective")
      : "leaf";
  },
  perspective: leaf,
  views,
  view,
  dynamicStep: (build, values, context) =>
    first(build, values, context, [
      stepStatement,
      (b, v, c) => properties(b, v, c, { kind: "ignored" }),
    ]),
  imageScheme: view,
  animation: animationStep,
  styles: stylesStatement,
  elementStyle: (build, values, context) =>
    first(build, values, context, [
      elementStyleStatement,
      (b, v, c) => properties(b, v, c, { kind: "ignored" }),
    ]),
  relationshipStyle: (build, values, context) =>
    first(build, values, context, [
      relationshipStyleStatement,
      (b, v, c) => properties(b, v, c, { kind: "ignored" }),
    ]),
  terminology: terminologyStatement,
  configuration,
  users: leaf,
  docs: leaf,
  opaque: leaf,
  unknown: () => undefined,
  unresolved: leaf,
};

/** Contexts whose children the builder doesn't interpret: no further diagnostics inside. */
export const QUIET: ReadonlySet<ContextKind> = new Set([
  "opaque",
  "unknown",
  "unresolved",
  "users",
  "docs",
  "perspective",
]);

const DIRECTIVES = new Set([
  "!include",
  "!plugin",
  "!script",
  "!const",
  "!var",
  "!constant",
  "!impliedrelationships",
  "!identifiers",
  "!element",
  "!elements",
  "!relationship",
  "!relationships",
  "!docs",
  "!adrs",
  "!decisions",
  "!components",
  "!ref",
  "!extend",
]);

const WHERE: Readonly<Record<string, string>> = {
  person: "people belong in the model block",
  softwareSystem: "software systems belong in the model block",
  custom: "custom elements belong in the model block",
  container: "containers belong in a software system's block",
  component: "components belong in a container's block",
};

/** `a --name-> b` or `--name-> b` whose archetype no handler knew. */
function unknownRelationshipArchetype(values: Values): string | undefined {
  const [first = "", second = ""] = values.tokens;
  const operator = second.startsWith("--") && values.tokens.length > 2 ? second : first;
  const match = /^--(.+)->$/.exec(operator);
  return match?.[1];
}

function isInvisibleToken(token: Token): boolean {
  return !token.quoted && !token.textBlock && isInvisibleText(token.raw);
}

/** A `-/>` that `deploymentBlock` doesn't take: Structurizr reads it nowhere else. */
function misplacedNoRelationship(values: Values, context: Context): string {
  if (context.kind !== "deploymentEnvironment") {
    return "Structurizr reads “-/>” only directly in a deployment environment, so it refuses the file. Move the line there, ending in “{” with “}” on the next line, or remove it.";
  }
  if (!values.statement.block) {
    return "Structurizr reads “-/>” only with a block, so it refuses the file. End the line with “{” and close the block with “}” on the next line.";
  }
  return "Structurizr expects <identifier> -/> <identifier> [description] {. Add the missing values.";
}

/** What no handler of the block takes (SPEC 3.8 rule 5, 3.7 last rows). */
export function fallback(build: Build, values: Values, context: Context): Outcome {
  const element = elementKeyword(build, values.keyword);
  if (element !== undefined) {
    build.reject(
      values,
      context,
      "element-not-permitted",
      `Structurizr doesn't allow “${values.keyword}” here: ${WHERE[element.kind] ?? ""}. Move the line there.`,
      0,
    );
    return child(context, "unknown");
  }
  if (QUIET.has(context.kind)) return undefined;
  if (values.tokens.length === 0) {
    build.incompatible(
      values,
      context,
      "Structurizr opens a block only at the end of a statement. Move “{” onto the end of the line before.",
    );
    return child(context, "unknown");
  }
  const operator = values.tokens.indexOf("-/>");
  if (operator === 0 || operator === 1) {
    build.incompatible(
      values,
      context,
      misplacedNoRelationship(values, context),
      "invalid-statement",
      operator,
    );
    return child(context, "unknown");
  }
  const { statement } = values;
  if (!statement.block && !statement.assignee && statement.tokens.every(isInvisibleToken)) {
    // Words of only no-break or zero-width spaces look like a blank line, which no warning
    // about an unknown keyword explains; Structurizr fails on them as it does on one such word.
    build.report.incompatible(
      "structurizr-rejects",
      MESSAGES.invisibleLine,
      statement.range,
      build.anchor(statement, context),
    );
    return child(context, "unknown");
  }
  const archetype = unknownRelationshipArchetype(values);
  if (archetype !== undefined) {
    build.incompatible(
      values,
      context,
      `No relationship archetype “${archetype}” is defined above this line, so Structurizr refuses the relationship and it isn't drawn. Define it in the archetypes block, or write “->”.`,
      "unresolved-reference",
      values.tokens[1]?.startsWith("--") ? 1 : 0,
    );
    return child(context, "unknown");
  }
  if (isKeyword(values.keyword) || DIRECTIVES.has(values.lower)) {
    build.incompatible(
      values,
      context,
      `Structurizr doesn't accept “${values.keyword}” here and refuses the file. Move the line to the block it belongs to, or remove it.`,
      "invalid-statement",
      0,
    );
    return child(context, "unknown");
  }
  build.report.note(
    "unknown-statement",
    "warning",
    `Structurizr 6.2.4 doesn't know “${values.keyword}” here and refuses the file. Check the spelling; the modeler keeps the line as written.`,
    build.tokenRange(values.statement, 0),
    build.anchor(values.statement, context),
  );
  return child(context, "unknown");
}
