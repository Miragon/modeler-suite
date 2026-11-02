import type { CstNode, Statement } from "../types.js";
import { indentationAt } from "./lines.js";

/**
 * Where the physical lines a statement owns before its children end. A block statement's logical
 * line can continue past the `{` onto a blank continuation, so `head` doesn't tell; the line before
 * the first child or the `}` does. Derived from the tree alone, so a copied tree prints back too.
 */
export function headLinesEnd(text: string, statement: Statement): number {
  const block = statement.block;
  const closes = block !== undefined && block.close.range.end > block.close.range.start;
  const next = block?.children[0]?.range.start ?? (closes ? block.close.range.start : undefined);
  if (next === undefined) {
    return statement.range.end;
  }
  return text.charCodeAt(next - 2) === 0x0d && text.charCodeAt(next - 1) === 0x0a
    ? next - 2
    : next - 1;
}

/** Visits every node in document order, parents before their children; iterative, any depth. */
export function walkCst(
  nodes: readonly CstNode[],
  visit: (node: CstNode, parent: Statement | undefined) => void,
): void {
  const stack: { node: CstNode; parent: Statement | undefined }[] = [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node) {
      stack.push({ node, parent: undefined });
    }
  }
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    visit(entry.node, entry.parent);
    const { node } = entry;
    if (node.kind === "statement" && node.block) {
      const { children } = node.block;
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child) {
          stack.push({ node: child, parent: node });
        }
      }
    }
  }
}

const DEFAULT_INDENT_UNIT = "    ";

/**
 * The most common step from a block statement to its first statement or raw child. A step that
 * starts with a tab counts as one tab: inserted lines then indent the way the file's author does.
 */
export function measureIndentUnit(text: string, nodes: readonly CstNode[]): string {
  const counts = new Map<string, number>();
  walkCst(nodes, (node) => {
    if (node.kind !== "statement" || !node.block) {
      return;
    }
    const child = node.block.children.find(
      (candidate) =>
        candidate.kind !== "blank" &&
        candidate.kind !== "lineComment" &&
        candidate.kind !== "blockComment",
    );
    if (!child) {
      return;
    }
    const childIndent = indentationAt(text, child.range.start);
    if (childIndent.length <= node.indent.length || !childIndent.startsWith(node.indent)) {
      return;
    }
    const step = childIndent.slice(node.indent.length);
    const unit = step.startsWith("\t") ? "\t" : step;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  });
  let best = DEFAULT_INDENT_UNIT;
  let bestCount = 0;
  for (const [unit, count] of counts) {
    if (count > bestCount) {
      best = unit;
      bestCount = count;
    }
  }
  return best;
}
