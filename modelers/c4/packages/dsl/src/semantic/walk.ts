import { isAssignableIdentifier } from "../syntax/characters.js";
import type { CstNode, Statement } from "../types.js";
import { child, ROOT, type Context } from "./context.js";
import { earlyDirective, lateDirective, rawBlock } from "./directives.js";
import { fallback, HANDLERS, QUIET } from "./dispatch.js";
import { invalidIdentifier } from "./elements.js";
import type { Build } from "./state.js";

interface Frame {
  readonly nodes: readonly CstNode[];
  index: number;
  readonly context: Context;
  readonly parent: Statement | undefined;
}

/**
 * Reads the tree in document order with an explicit stack, so any nesting depth the syntax tree
 * holds is read without recursion: every statement is recorded with its block and context, then
 * handed to the handler of the block it sits in.
 */
export function walk(build: Build, nodes: readonly CstNode[]): void {
  const stack: Frame[] = [{ nodes, index: 0, context: ROOT, parent: undefined }];
  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index];
    if (node === undefined) {
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (node.kind === "raw") {
      if (!QUIET.has(frame.context.kind)) rawBlock(build, node, frame.context);
      continue;
    }
    if (node.kind !== "statement") continue;
    build.record(node, frame.parent, frame.context);
    const opened = dispatch(build, node, frame.context);
    if (node.block)
      stack.push({ nodes: node.block.children, index: 0, context: opened, parent: node });
  }
}

/** The context the statement's block is read in; for a statement without one, that of a block it would open. */
function dispatch(build: Build, statement: Statement, context: Context): Context {
  const values = build.values(statement, context);
  const quiet = QUIET.has(context.kind);
  if (values.assignee !== undefined && !isAssignableIdentifier(values.assignee)) {
    build.reject(values, context, "invalid-identifier", invalidIdentifier(values.assignee));
  }
  const outcome =
    context.kind === "unresolved"
      ? (earlyDirective(build, values, context) ?? lateDirective(build, values, context) ?? "leaf")
      : quiet
        ? (HANDLERS[context.kind](build, values, context) ?? fallback(build, values, context))
        : (earlyDirective(build, values, context) ??
          HANDLERS[context.kind](build, values, context) ??
          lateDirective(build, values, context) ??
          fallback(build, values, context));
  if (outcome === undefined) return child(context, quiet ? context.kind : "unknown");
  if (outcome !== "leaf") return outcome;
  if (quiet) return child(context, context.kind);
  if (statement.block !== undefined) {
    build.incompatible(
      values,
      context,
      `Structurizr doesn't open a block after “${values.keyword}”. Remove “{” and the block's closing “}”.`,
    );
  }
  return child(context, "unknown");
}
