/*
 * The directives the reference parser accepts in any block (R-DSL §2.5, §8): includes, scripts
 * and plugins, which the modeler never reads or runs (SPEC 3.7), constants, the implied
 * relationship strategy and the identifier mode.
 */
import type { ImpliedStrategy } from "@miragon/c4-schema-model";
import type { RawBlock } from "../types.js";
import { child, type Context } from "./context.js";
import { checkArity, type Outcome } from "./outcome.js";
import type { Build, Values } from "./state.js";

const STRATEGIES: Readonly<Record<string, ImpliedStrategy>> = {
  true: "unless-any",
  false: "none",
  "com.structurizr.model.defaultimpliedrelationshipsstrategy": "none",
  "com.structurizr.model.createimpliedrelationshipsunlessanyrelationshipexistsstrategy":
    "unless-any",
  "com.structurizr.model.createimpliedrelationshipsunlesssamerelationshipexistsstrategy":
    "unless-same",
};

/** Read before the block's own statements, as the reference parser checks them first. */
export function earlyDirective(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  switch (values.lower) {
    case "!include":
      build.role(statement, "includeFile");
      build.openWorld = true;
      build.report.note(
        "include-not-read",
        "warning",
        "The modeler doesn't read included files, so what they define is missing on the canvas and references to it stay unresolved. Structurizr still includes them.",
        statement.head,
        build.anchor(statement, context),
      );
      return "leaf";
    case "!plugin":
    case "!script":
      build.role(statement, values.lower === "!plugin" ? "plugin" : "script");
      notRun(build, statement, context);
      return child(context, "opaque");
    default:
      return undefined;
  }
}

function notRun(build: Build, node: Values["statement"] | RawBlock, context: Context): void {
  build.openWorld = true;
  build.addOpaque(node);
  const range = node.kind === "raw" ? node.range : node.head;
  const lineEnd = build.text.indexOf("\n", range.start);
  const firstLine = {
    start: range.start,
    end: lineEnd === -1 ? range.end : Math.min(range.end, lineEnd),
  };
  build.report.note(
    "script-not-run",
    "warning",
    "The modeler never runs scripts, plugins or the component finder, so what they add is missing on the canvas. Structurizr still runs them.",
    firstLine,
    () => `${context.anchor()}${build.report.statementText(range)}`,
  );
}

/** An inline `!script <language> {` body, kept verbatim by the syntax tree. */
export function rawBlock(build: Build, node: RawBlock, context: Context): void {
  notRun(build, node, context);
}

/** `!components` in a container: Java's component finder (R-DSL §8.6). */
export function componentFinder(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "components");
  notRun(build, values.statement, context);
  return child(context, "opaque");
}

/** Read after the block's own statements: constants, the implied strategy, the identifier mode. */
export function lateDirective(build: Build, values: Values, context: Context): Outcome {
  switch (values.lower) {
    case "!const":
    case "!var":
      return constant(build, values, context);
    case "!constant":
      build.role(values.statement, "constant");
      build.incompatible(
        values,
        context,
        "Structurizr 6.2.4 removed “!constant”. Write “!const” or “!var” instead.",
      );
      return "leaf";
    case "!impliedrelationships":
    case "impliedrelationships":
      return impliedStrategy(build, values, context);
    case "!identifiers":
      return identifierMode(build, values, context);
    default:
      return undefined;
  }
}

function constant(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "constant");
  if (!checkArity(build, values, context, `${values.keyword} <name> <value>`, 3, 3)) return "leaf";
  const [, name = "", value = ""] = values.tokens;
  const problem = build.constants.define(name, value, values.lower === "!const");
  if (problem === "invalid-name") {
    build.incompatible(
      values,
      context,
      "Structurizr allows only letters, digits, “-”, “_” and “.” in a constant's name. Rename it.",
      "invalid-statement",
      1,
    );
  } else if (problem === "taken") {
    build.incompatible(
      values,
      context,
      `A constant “${name}” already exists above, and Structurizr refuses to define it again. Rename one, or use “!var” for both.`,
      "invalid-statement",
      1,
    );
  }
  return "leaf";
}

function impliedStrategy(build: Build, values: Values, context: Context): Outcome {
  build.role(values.statement, "impliedRelationships");
  if (context.kind === "root") {
    build.incompatible(
      values,
      context,
      "Structurizr fails on “!impliedRelationships” outside the workspace block. Move it into the workspace or the model.",
      "structurizr-rejects",
    );
  }
  if (!checkArity(build, values, context, "!impliedRelationships <true|false|fqcn>", 2, 2))
    return "leaf";
  const option = values.tokens[1] ?? "";
  const strategy = STRATEGIES[option.toLowerCase()];
  if (strategy === undefined) {
    build.strategy = "unless-any";
    build.report.note(
      "implied-strategy-unknown",
      "warning",
      `The modeler doesn't know the strategy ${option}, so it implies relationships the default way (unless any relationship exists). Structurizr loads the class as a plugin.`,
      build.tokenRange(values.statement, 1),
      build.anchor(values.statement, context),
    );
    return "leaf";
  }
  build.strategy = strategy;
  return "leaf";
}

function identifierMode(build: Build, values: Values, context: Context): Outcome {
  const allowed =
    context.kind === "workspace" || context.kind === "model" || context.kind === "root";
  if (!allowed) return undefined;
  build.role(values.statement, "identifiers");
  if (context.kind === "root") {
    build.incompatible(
      values,
      context,
      "Structurizr accepts “!identifiers” only in the workspace or the model block. Move it there.",
      "structurizr-rejects",
    );
  }
  const mode = values.tokens[1]?.toLowerCase();
  if (values.tokens.length !== 2 || (mode !== "flat" && mode !== "hierarchical")) {
    build.incompatible(values, context, "Structurizr expects !identifiers <flat|hierarchical>.");
    return "leaf";
  }
  build.mode = mode;
  build.modeChanges.push({ offset: values.statement.range.start, mode });
  return "leaf";
}
