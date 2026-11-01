import type { Context } from "./context.js";
import type { Build, Values } from "./state.js";

/**
 * What a handler made of a statement: `undefined` when it is not the handler's, `"leaf"` when it
 * takes no block, else the context its block's children are read in.
 */
export type Outcome = Context | "leaf" | undefined;

export type Handler = (build: Build, values: Values, context: Context) => Outcome;

/** Statements that open a block whether or not the line ends in `{` (R-DSL §2.6, §17 #13). */
export function requireBlock(
  build: Build,
  values: Values,
  context: Context,
  opened: Context,
): Context {
  if (values.statement.block === undefined) {
    build.incompatible(
      values,
      context,
      `Structurizr reads the lines after “${values.keyword}” as its block even without “{”. End the line with “{” and close the block with “}”.`,
    );
  }
  return opened;
}

/** The arity checks of the reference parsers: “Too many tokens” and “Expected: …”. */
export function checkArity(
  build: Build,
  values: Values,
  context: Context,
  grammar: string,
  minimum: number,
  maximum: number,
): boolean {
  const count = values.tokens.length;
  if (count > maximum) {
    build.incompatible(
      values,
      context,
      `Structurizr expects ${grammar} and refuses the extra values. Remove them, or quote a value that holds spaces.`,
      "invalid-statement",
      maximum,
    );
    return false;
  }
  if (count < minimum) {
    build.incompatible(values, context, `Structurizr expects ${grammar}. Add the missing values.`);
    return false;
  }
  return true;
}

export function isRelationshipOperator(build: Build, token: string | undefined): boolean {
  if (token === undefined) return false;
  if (token.toLowerCase() === "->") return true;
  if (token.startsWith("--") && token.endsWith("->") && token.length > 4) {
    return build.archetypes.get("relationship")?.has(token.slice(2, -2).toLowerCase()) === true;
  }
  return false;
}
