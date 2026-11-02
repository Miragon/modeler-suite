/*
 * Deployment environments, nodes and instances (R-DSL §5): not drawn in v1, so only what other
 * statements resolve against is kept: identifiers, the static elements instances are of, and the
 * statements that name them (SPEC 3.5 delete cascade step 3).
 */
import type { Context } from "./context.js";
import { archetypeOf } from "./elements.js";
import { checkArity, type Outcome } from "./outcome.js";
import type { DeploymentKind, DeploymentRecord, ElementRecord, GroupRecord } from "./records.js";
import type { Build, Values } from "./state.js";

function register(
  build: Build,
  values: Values,
  context: Context,
  kind: DeploymentKind,
  name: string,
  parent: DeploymentRecord | undefined,
  instanceOf?: ElementRecord,
): DeploymentRecord {
  const identifier = values.assignee;
  const local = identifier?.toLowerCase() ?? build.anonymousKey();
  const scopeKey = parent?.registerKey ?? context.environmentKey;
  const hierarchical = build.mode === "hierarchical" && identifier !== undefined;
  const registerKey =
    hierarchical && kind !== "deploymentEnvironment" && scopeKey ? `${scopeKey}.${local}` : local;
  const record: DeploymentRecord = {
    type: "deployment",
    kind,
    name,
    identifier,
    registerKey,
    parent,
    environment: context.environmentName ?? name,
    statement: values.statement,
    instanceOf,
  };
  if (identifier !== undefined) {
    build.registerKey(registerKey, record, values, context);
  }
  build.deployments.push(record);
  return record;
}

/** `[id =] deploymentEnvironment <name> {` in the model. */
export function deploymentEnvironment(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "deploymentEnvironment");
  checkArity(build, values, context, "deploymentEnvironment <name> {", 2, 2);
  const name = values.tokens[1] ?? "";
  const record = register(
    build,
    values,
    { ...context, environmentName: name },
    "deploymentEnvironment",
    name,
    undefined,
  );
  if (build.parents.get(values.statement) === build.modelStatement) {
    build.deploymentEnvironments.push(values.statement);
  }
  return {
    kind: "deploymentEnvironment",
    environmentKey: record.registerKey,
    environmentName: name,
    anchor: () => `${name} `,
  };
}

/**
 * `[id =] group <name> {` in an environment or a node: not drawn, but its identifier takes a
 * place in the one register (Structurizr keys it flat, it has no parent element).
 */
export function deploymentElementGroup(build: Build, values: Values, context: Context): Outcome {
  const identifier = values.assignee;
  if (identifier !== undefined) {
    const group: GroupRecord = {
      type: "group",
      name: values.tokens[1] ?? "",
      identifier,
      hierarchical: false,
      path: values.tokens[1] ?? "",
      parent: undefined,
      outer: undefined,
      statement: values.statement,
      members: [],
    };
    build.registerKey(identifier.toLowerCase(), group, values, context);
  }
  return { ...context };
}

/** `[id =] deploymentGroup <name>` in an environment, `deploymentGroup <ids>` in a node. */
export function deploymentGroup(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "deploymentGroup");
  if (context.kind === "deploymentEnvironment") {
    register(build, values, context, "deploymentGroup", values.tokens[1] ?? "", undefined);
  }
  return "leaf";
}

/** `[id =] deploymentNode` (or its archetype) in an environment or a node. */
export function deploymentNode(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "deploymentNode");
  checkArity(
    build,
    values,
    context,
    "deploymentNode <name> [description] [technology] [tags] [instances]",
    2,
    6,
  );
  const parent = context.kind === "deploymentNode" ? context.deployment : undefined;
  const record = register(build, values, context, "deploymentNode", values.tokens[1] ?? "", parent);
  return { ...context, kind: "deploymentNode", deployment: record, group: undefined };
}

/** `[id =] infrastructureNode` (or its archetype) in a node. */
export function infrastructureNode(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "deploymentNode");
  checkArity(
    build,
    values,
    context,
    "infrastructureNode <name> [description] [technology] [tags]",
    2,
    5,
  );
  const record = register(
    build,
    values,
    context,
    "infrastructureNode",
    values.tokens[1] ?? "",
    context.deployment,
  );
  return { ...context, kind: "infrastructureNode", deployment: record, group: undefined };
}

/** `softwareSystemInstance`, `containerInstance`, `instanceOf` in a node. */
export function instance(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  build.role(statement, "instance");
  checkArity(
    build,
    values,
    context,
    `${values.keyword} <identifier> [deploymentGroups] [tags]`,
    2,
    4,
  );
  const reference = values.tokens[1] ?? "";
  const wanted =
    values.lower === "softwaresysteminstance"
      ? ["softwareSystem"]
      : values.lower === "containerinstance"
        ? ["container"]
        : ["softwareSystem", "container"];
  const found = build.lookup(
    reference,
    context,
    (candidate) => candidate.type === "element" && wanted.includes(candidate.kind),
  );
  const target = found?.target.type === "element" ? found.target : undefined;
  if (found === undefined) {
    build.unresolved(
      values,
      context,
      1,
      `Nothing above this line is identified by “${reference}”. Check the identifier, or define the element first.`,
    );
  } else if (target === undefined || !wanted.includes(target.kind)) {
    build.incompatible(
      values,
      context,
      `“${reference}” isn't a ${wanted.join(" or a ").replace("softwareSystem", "software system")}, so Structurizr can't deploy an instance of it.`,
      "invalid-statement",
      1,
    );
  }
  const record = register(
    build,
    values,
    context,
    wanted.length === 1 && wanted[0] === "container"
      ? "containerInstance"
      : "softwareSystemInstance",
    reference,
    context.deployment,
    target,
  );
  if (target && wanted.includes(target.kind)) {
    const list = build.instances.get(target) ?? [];
    list.push(values.assignee ?? "");
    build.instances.set(target, list);
    build.references.push({
      statement,
      token: 1,
      kind: "instance",
      written: reference,
      exact: true,
      relativeTo: found?.relativeTo,
      target,
    });
  }
  return { ...context, kind: "instance", deployment: record, group: undefined };
}

export function deploymentNodeKeyword(build: Build, lower: string): boolean {
  return lower === "deploymentnode" || archetypeOf(build, "deploymentNode", lower) !== undefined;
}

export function infrastructureNodeKeyword(build: Build, lower: string): boolean {
  return (
    lower === "infrastructurenode" || archetypeOf(build, "infrastructureNode", lower) !== undefined
  );
}
