/*
 * Relationship statements (R-DSL §6): `a -> b`, `-> b` and `this` inside element blocks,
 * relationship archetypes `--name->`, and the deployment forms, whose relationships connect
 * instances and are not part of the static model; for those only the references are kept.
 */
import { child, type Context } from "./context.js";
import { addTags, archetypeOf, checkedUrl } from "./elements.js";
import { checkArity, type Outcome } from "./outcome.js";
import {
  emptyWrites,
  type ElementRecord,
  type ReferenceSite,
  type RelationshipRecord,
  type Target,
} from "./records.js";
import type { Build, Values } from "./state.js";
import { tagsOf } from "./values.js";

const RELATIONSHIP_FIELDS = ["description", "technology", "tags", "url"] as const;
const DEPLOYMENT_CONTEXTS = new Set([
  "deploymentEnvironment",
  "deploymentNode",
  "infrastructureNode",
  "instance",
]);

interface End {
  readonly target: Target | undefined;
  readonly token: number | undefined;
  readonly relativeTo: ElementRecord | undefined;
  readonly written: string;
}

/** `this` names the element in scope only in the explicit form (`ExplicitRelationshipParser.findElement`). */
function resolveEnd(
  build: Build,
  values: Values,
  context: Context,
  token: number,
  thisAllowed = true,
): End {
  const written = values.tokens[token] ?? "";
  const found = build.lookup(written, context);
  if (found) return { target: found.target, token, relativeTo: found.relativeTo, written };
  if (thisAllowed && written.toLowerCase() === "this") {
    const scope = context.element ?? context.deployment;
    return { target: scope, token: undefined, relativeTo: undefined, written };
  }
  return { target: undefined, token, relativeTo: undefined, written };
}

function scopeEnd(context: Context): End {
  return {
    target: context.element ?? context.deployment,
    token: undefined,
    relativeTo: undefined,
    written: "",
  };
}

function siteOf(values: Values, end: End, kind: ReferenceSite["kind"]): ReferenceSite | undefined {
  if (end.token === undefined || end.target === undefined) return undefined;
  return {
    statement: values.statement,
    token: end.token,
    kind,
    written: end.written,
    exact: true,
    relativeTo: end.relativeTo,
    target: end.target,
  };
}

/** `[id =] <source> -> <destination> [description] [technology] [tags] [{]` */
export function explicitRelationship(build: Build, values: Values, context: Context): Outcome {
  checkArity(
    build,
    values,
    context,
    "<identifier> -> <identifier> [description] [technology] [tags]",
    3,
    6,
  );
  const source = resolveEnd(build, values, context, 0);
  const destination = resolveEnd(build, values, context, 2);
  return relationship(build, values, context, source, destination, 3);
}

/** `[id =] -> <destination> [description] [technology] [tags] [{]` inside an element block. */
export function implicitRelationship(build: Build, values: Values, context: Context): Outcome {
  checkArity(build, values, context, "-> <identifier> [description] [technology] [tags]", 2, 5);
  const destination = resolveEnd(build, values, context, 1, false);
  return relationship(build, values, context, scopeEnd(context), destination, 2);
}

function relationship(
  build: Build,
  values: Values,
  context: Context,
  source: End,
  destination: End,
  firstSlot: number,
): Outcome {
  const statement = values.statement;
  build.role(statement, "relationship");
  const deployment = DEPLOYMENT_CONTEXTS.has(context.kind);
  const kind = deployment ? "deployment-relationship" : undefined;
  for (const [end, role] of [
    [source, "relationship-source"],
    [destination, "relationship-destination"],
  ] as const) {
    const site = siteOf(values, end, kind ?? role);
    if (site) build.references.push(site);
  }
  if (!ends(build, values, context, source, destination)) return child(context, "relationship");
  if (deployment || source.target?.type !== "element" || destination.target?.type !== "element") {
    if (deployment) registerDeploymentRelationship(build, values, context);
    else notPermitted(build, values, context, source.target, destination.target);
    return child(context, "relationship");
  }
  const operator = values.tokens[firstSlot - 2] ?? "->";
  const archetype = archetypeOf(
    build,
    "relationship",
    operator.startsWith("--") ? operator.slice(2, -2) : "->",
  );
  const record = newRelationship(
    build,
    values,
    source.target,
    destination.target,
    source.token,
    destination.token,
    firstSlot,
  );
  if (archetype) {
    record.description = archetype.description;
    record.technology = archetype.technology;
    addTags(record.archetypeTags, archetype.tags);
    for (const [name, value] of archetype.properties) record.properties.set(name, value);
    for (const field of ["description", "technology", "tags"] as const) {
      if (field === "tags" ? archetype.tags.length > 0 : archetype[field] !== "") {
        record.writes[field].push({
          form: "archetype",
          statement,
          token: undefined,
          substituted: false,
        });
      }
    }
  }
  positional(values, record, firstSlot);
  if (ancestorRelationship(record)) {
    build.report.incompatible(
      "relationship-to-ancestor",
      "Structurizr refuses a relationship between an element and the element it is inside, so it isn't drawn. Connect it to a sibling or to an element outside instead.",
      statement.head,
      build.anchor(statement, context),
    );
    return { kind: "relationship", relationship: record, anchor: context.anchor };
  }
  if (values.assignee !== undefined) {
    build.registerKey(values.assignee, record, values, context);
  }
  build.relationships.push(record);
  return { kind: "relationship", relationship: record, anchor: context.anchor };
}

/** Its identifier takes a place in the one register, so `!relationship` and duplicates see it. */
function registerDeploymentRelationship(build: Build, values: Values, context: Context): void {
  const identifier = values.assignee;
  if (identifier === undefined) return;
  build.registerKey(
    identifier.toLowerCase(),
    {
      type: "deployment",
      kind: "deploymentRelationship",
      name: identifier,
      identifier,
      registerKey: identifier.toLowerCase(),
      parent: context.deployment,
      environment: context.environmentName ?? "",
      statement: values.statement,
      instanceOf: undefined,
    },
    values,
    context,
  );
}

function newRelationship(
  build: Build,
  values: Values,
  source: ElementRecord,
  destination: ElementRecord,
  sourceToken: number | undefined,
  destinationToken: number | undefined,
  firstSlot: number,
): RelationshipRecord {
  return {
    type: "relationship",
    order: build.relationships.length,
    source,
    destination,
    identifier: values.assignee,
    statement: values.statement,
    form: firstSlot === 3 ? "explicit" : "implicit",
    sourceToken,
    destinationToken,
    strategy: build.strategy,
    reopens: [],
    description: "",
    technology: "",
    archetypeTags: [],
    ownTags: [],
    url: undefined,
    properties: new Map(),
    writes: emptyWrites(RELATIONSHIP_FIELDS),
    tagSources: 0,
    refused: false,
  };
}

function positional(values: Values, record: RelationshipRecord, firstSlot: number): void {
  const slots = [
    ["description", firstSlot],
    ["technology", firstSlot + 1],
    ["tags", firstSlot + 2],
  ] as const;
  for (const [field, token] of slots) {
    const value = values.tokens[token];
    if (value === undefined) continue;
    record.writes[field].push({
      form: "positional",
      statement: values.statement,
      token,
      substituted: values.substituted[token] === true,
    });
    if (field === "tags") {
      record.tagSources += 1;
      addTags(record.ownTags, tagsOf(value));
    } else {
      record[field] = value;
    }
  }
}

function ends(
  build: Build,
  values: Values,
  context: Context,
  source: End,
  destination: End,
): boolean {
  if (source.target === undefined) {
    build.unresolved(
      values,
      context,
      source.token ?? 0,
      `The source “${source.written}” isn't defined above this line, so the relationship isn't drawn. Structurizr reads top to bottom: define the element first, or check the identifier.`,
    );
  }
  if (destination.target === undefined) {
    build.unresolved(
      values,
      context,
      destination.token,
      `The destination “${destination.written}” isn't defined above this line, so the relationship isn't drawn. Structurizr reads top to bottom: define the element first, or check the identifier.`,
    );
  }
  return source.target !== undefined && destination.target !== undefined;
}

function notPermitted(
  build: Build,
  values: Values,
  context: Context,
  source: Target | undefined,
  destination: Target | undefined,
): void {
  const describe = (target: Target | undefined) =>
    target?.type === "group"
      ? `the group ${target.name}`
      : target?.type === "deployment"
        ? `the deployment item ${target.name}`
        : "that item";
  const odd = source?.type !== "element" ? source : destination;
  build.report.incompatible(
    "relationship-not-permitted",
    `Structurizr doesn't permit a relationship with ${describe(odd)} here, so it isn't drawn. Connect people, software systems, containers, components or custom elements.`,
    values.statement.head,
    build.anchor(values.statement, context),
  );
}

/** `Model.isChildOf`: people are never inside anything. */
function ancestorRelationship(record: RelationshipRecord): boolean {
  if (record.source.kind === "person" || record.destination.kind === "person") return false;
  const isAncestor = (candidate: ElementRecord, of: ElementRecord) => {
    for (let parent = of.parent; parent; parent = parent.parent) {
      if (parent === candidate) return true;
    }
    return false;
  };
  return (
    isAncestor(record.source, record.destination) || isAncestor(record.destination, record.source)
  );
}

/** `tag`, `tags`, `url` inside a relationship block or a `!relationship` re-open. */
export function relationshipField(build: Build, values: Values, context: Context): Outcome {
  const record = context.relationship;
  if (record === undefined) return undefined;
  const form = context.reopened ? "reopen" : "statement";
  const statement = values.statement;
  switch (values.lower) {
    case "tag":
    case "tags":
      build.role(statement, "tags");
      if (values.tokens.length < 2) {
        build.incompatible(
          values,
          context,
          "Structurizr expects tags <tags> [tags]. Add the tags.",
        );
        return "leaf";
      }
      record.writes.tags.push({
        form,
        statement,
        token: 1,
        substituted: values.substituted.slice(1).some(Boolean),
      });
      record.tagSources += 1;
      for (const value of values.tokens.slice(1)) addTags(record.ownTags, tagsOf(value));
      return "leaf";
    case "url":
      build.role(statement, "url");
      if (!checkArity(build, values, context, "url <url>", 2, 2)) return "leaf";
      record.writes.url.push({
        form,
        statement,
        token: 1,
        substituted: values.substituted[1] === true,
      });
      record.url = checkedUrl(build, values, context);
      return "leaf";
    default:
      return undefined;
  }
}

/** `!relationship <identifier|canonical name>` (R-DSL §8.4). */
export function reopenRelationship(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "relationshipReopen");
  if (values.assignee !== undefined) {
    build.incompatible(
      values,
      context,
      "Structurizr 6.2.4 refuses an identifier on “!relationship”. Remove the assignment.",
    );
  }
  if (!checkArity(build, values, context, "!relationship <identifier|canonical name>", 2, 2)) {
    return child(context, "unresolved");
  }
  const reference = values.tokens[1] ?? "";
  const found = reference.startsWith("Relationship://")
    ? build.relationships.find((record) => relationshipCanonicalName(record) === reference)
    : build.relationshipNamed(reference);
  if (found === undefined) {
    if (!build.deploymentRelationshipNamed(reference)) {
      build.unresolved(
        values,
        context,
        1,
        `No relationship is identified by “${reference}”, so Structurizr can't re-open it. Check the identifier, or name the relationship where it is defined.`,
      );
    }
    return child(context, "unresolved");
  }
  found.reopens.push(values.statement);
  return { kind: "relationship", relationship: found, reopened: true, anchor: context.anchor };
}

export function relationshipCanonicalName(record: RelationshipRecord): string {
  const format = (name: string) => name.replaceAll(".", "").replaceAll("/", "");
  const canonical = (element: ElementRecord) => {
    const names: string[] = [];
    for (let current: ElementRecord | undefined = element; current; current = current.parent) {
      names.unshift(format(current.name));
    }
    const prefix = {
      person: "Person://",
      softwareSystem: "SoftwareSystem://",
      container: "Container://",
      component: "Component://",
      custom: "Custom://",
    }[element.kind];
    return `${prefix}${names.join(".")}`;
  };
  const base = `Relationship://${canonical(record.source)} -> ${canonical(record.destination)}`;
  return record.description === "" ? base : `${base} (${record.description})`;
}

/** `source -/> destination [description] {` in a deployment environment (R-DSL §6.5). */
export function noRelationship(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "noRelationship");
  checkArity(build, values, context, "<identifier> -/> <identifier> [description] {", 3, 4);
  const [source, destination] = [0, 2].map((token) => {
    const end = resolveEnd(build, values, context, token);
    const site = siteOf(values, end, "no-relationship");
    if (site) build.references.push(site);
    else if (end.target === undefined) {
      build.unresolved(
        values,
        context,
        token,
        `“${end.written}” isn't defined above this line. Check the identifier.`,
      );
    }
    return end.target;
  });
  build.noRelationships.push({
    values,
    context,
    source,
    destination,
    description: values.tokens[3],
  });
  return { ...context, kind: "deploymentEnvironment" };
}
