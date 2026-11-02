/*
 * Prints the tree back from its nodes: each node's own lines, and between two nodes exactly the
 * line break the text holds there. A node range that skipped or repeated a character would show
 * in the output, so `printCst(parseCst(text)) === text` checks the tree, not only the text.
 */
import type { Cst, CstNode, Statement } from "../types.js";
import { BYTE_ORDER_MARK, lineBreakAt } from "./lines.js";
import { headLinesEnd } from "./walk.js";

type Step =
  | { readonly node: CstNode; readonly before: number | undefined }
  | { readonly close: Statement; readonly before: number };

/** The identity printer: `printCst(parseCst(text)) === text` on every input. */
export function printCst(cst: Cst): string {
  const { text } = cst;
  const out: string[] = cst.bom ? [BYTE_ORDER_MARK] : [];
  const pending: Step[] = [];
  const queue = (nodes: readonly CstNode[], after: number | undefined, close?: Statement): void => {
    if (close?.block && close.block.close.range.end > close.block.close.range.start) {
      const last = nodes[nodes.length - 1];
      pending.push({ close, before: last ? last.range.end : headLinesEnd(text, close) });
    }
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index] as CstNode;
      const previous = nodes[index - 1];
      pending.push({ node, before: previous ? previous.range.end : after });
    }
  };
  queue(cst.nodes, undefined);
  for (let step = pending.pop(); step !== undefined; step = pending.pop()) {
    if (step.before !== undefined) {
      out.push(lineBreakAt(text, step.before));
    }
    if ("close" in step) {
      const { range } = step.close.block?.close ?? { range: { start: 0, end: 0 } };
      out.push(text.slice(range.start, range.end));
      continue;
    }
    const { node } = step;
    if (node.kind === "statement" && node.block) {
      const end = headLinesEnd(text, node);
      out.push(text.slice(node.range.start, end));
      queue(node.block.children, end, node);
    } else {
      out.push(text.slice(node.range.start, node.range.end));
    }
  }
  const last = cst.nodes[cst.nodes.length - 1];
  if (cst.endsWithLineBreak && last) {
    out.push(lineBreakAt(text, last.range.end));
  }
  return out.join("");
}
