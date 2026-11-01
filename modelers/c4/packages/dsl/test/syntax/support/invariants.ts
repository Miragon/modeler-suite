import type { Cst, CstNode, Statement, TextRange } from "../../../src/types.js";
import { printCst } from "../../../src/syntax/printCst.js";
import { headLinesEnd, walkCst } from "../../../src/syntax/walk.js";

interface Line {
  readonly start: number;
  readonly end: number;
}

function physicalLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = text.startsWith("\uFEFF") ? 1 : 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    if (newline === -1) {
      lines.push({ start, end: text.length });
      break;
    }
    lines.push({
      start,
      end: newline > start && text[newline - 1] === "\r" ? newline - 1 : newline,
    });
    start = newline + 1;
  }
  return lines;
}

function within(inner: TextRange, outer: TextRange): boolean {
  return inner.start >= outer.start && inner.end <= outer.end && inner.start <= inner.end;
}

function statementProblems(text: string, statement: Statement): string[] {
  const problems: string[] = [];
  const at = `statement at ${statement.range.start}`;
  if (!within(statement.head, statement.range)) {
    problems.push(`${at}: head outside its range`);
  }
  const tokens = [...(statement.assignee ? [statement.assignee] : []), ...statement.tokens];
  let previousEnd = statement.head.start;
  for (const token of tokens) {
    if (token.raw !== text.slice(token.range.start, token.range.end)) {
      problems.push(`${at}: token raw differs from its range`);
    }
    if (!within(token.range, statement.head) || token.range.start < previousEnd) {
      problems.push(`${at}: token "${token.raw}" outside the head or out of order`);
    }
    previousEnd = token.range.end;
  }
  if (statement.block && !within(statement.block.open, statement.head)) {
    problems.push(`${at}: "{" outside the head`);
  }
  if (statement.block && statement.block.open.end !== statement.head.end) {
    problems.push(`${at}: the head doesn't end with "{"`);
  }
  const ownLines = { start: statement.range.start, end: headLinesEnd(text, statement) };
  if (!within(statement.head, ownLines)) {
    problems.push(`${at}: head outside the lines the statement owns before its children`);
  }
  const comment = statement.trailingComment;
  if (comment && (comment.start < statement.head.end || !within(comment, ownLines))) {
    problems.push(`${at}: trailing comment misplaced`);
  }
  return problems;
}

/** The lines a node owns itself: a block statement owns its head and its close, not its children. */
function ownedRanges(text: string, node: CstNode): TextRange[] {
  if (node.kind !== "statement" || !node.block) {
    return [node.range];
  }
  const headEnd = headLinesEnd(text, node);
  const close = node.block.close.range;
  return close.end > close.start
    ? [{ start: node.range.start, end: headEnd }, close]
    : [{ start: node.range.start, end: headEnd }];
}

/** Everything that would make the tree lie about the text; empty when the tree is sound. */
export function cstProblems(text: string, cst: Cst): string[] {
  const problems: string[] = [];
  if (printCst(cst) !== text) {
    problems.push("printCst differs from the text");
  }
  if (printCst(structuredClone(cst)) !== text) {
    problems.push("printCst of a copy of the tree differs from the text");
  }
  const lines = physicalLines(text);
  const owners = new Array<number>(lines.length).fill(0);
  const lineAt = new Map<number, number>();
  const lineEndingAt = new Map<number, number>();
  lines.forEach((line, index) => {
    lineAt.set(line.start, index);
    lineEndingAt.set(line.end, index);
  });
  walkCst(cst.nodes, (node, parent) => {
    if (parent && !within(node.range, parent.range)) {
      problems.push(`node at ${node.range.start} outside its parent`);
    }
    if (node.kind === "statement") {
      problems.push(...statementProblems(text, node));
    }
    for (const range of ownedRanges(text, node)) {
      const first = lineAt.get(range.start);
      const last = lineEndingAt.get(range.end);
      if (first === undefined || last === undefined || last < first) {
        problems.push(`node at ${range.start}..${range.end} doesn't cover whole lines`);
        continue;
      }
      for (let index = first; index <= last; index += 1) {
        owners[index] = (owners[index] ?? 0) + 1;
      }
    }
  });
  owners.forEach((count, index) => {
    if (count !== 1) {
      problems.push(`line ${index + 1} belongs to ${count} nodes`);
    }
  });
  return problems;
}
