/*
 * Where written statements go and how lines are added and removed (SPEC 3.5 general rules): a
 * statement goes on a new line right after its anchor's last physical line, or right after a
 * block's opening line; siblings copy the anchor's indentation, children add the file's indent
 * unit; a one-liner gains ` {` when it needs a child. No line gets trailing whitespace, and the
 * file's final line break stays as it was.
 */
import { indentationAt } from "../syntax/index.js";
import { headLinesEnd } from "../syntax/walk.js";
import type { CstNode, RawBlock, Statement, TextEdit, Token } from "../types.js";
import type { Draft } from "./draft.js";
import { assertWritable } from "./write.js";

/** One line of a statement to write, `depth` levels below the statement's own indentation. */
export interface Line {
  readonly depth: number;
  readonly text: string;
}

/** A statement to write: its lines, the first at depth 0. */
export type Written = readonly Line[];

export function oneLine(text: string): Written {
  return [{ depth: 0, text }];
}

/** `head {`, the children one level down, `}`. */
export function block(head: string, children: readonly Written[]): Written {
  return [
    { depth: 0, text: `${head} {` },
    ...children.flatMap((child) => child.map((line) => ({ ...line, depth: line.depth + 1 }))),
    { depth: 0, text: "}" },
  ];
}

export function lineStart(text: string, offset: number): number {
  const newline = text.lastIndexOf("\n", offset - 1);
  const start = newline + 1;
  return start === 0 && text.startsWith("﻿") ? 1 : start;
}

export function lineEnd(text: string, offset: number): number {
  const newline = text.indexOf("\n", offset);
  if (newline === -1) return text.length;
  return newline > 0 && text.charCodeAt(newline - 1) === 0x0d ? newline - 1 : newline;
}

/** The offset after the line break that ends the line holding `offset`. */
export function breakEnd(text: string, offset: number): number {
  const newline = text.indexOf("\n", offset);
  return newline === -1 ? text.length : newline + 1;
}

export function isBlankLine(text: string, start: number): boolean {
  return text.slice(start, lineEnd(text, start)).trim() === "";
}

/** The physical line before the one holding `offset` is blank. */
function blankLineBefore(text: string, offset: number): boolean {
  const start = lineStart(text, offset);
  if (start <= 0) return false;
  const previous = lineStart(text, start - 1);
  return previous < start && isBlankLine(text, previous);
}

export function render(
  statement: Written,
  indent: string,
  unit: string,
  lineBreak: string,
): string {
  const text = statement
    .map((line) => (line.text === "" ? "" : `${indent}${unit.repeat(line.depth)}${line.text}`))
    .join(lineBreak);
  assertWritable(text);
  return text;
}

function renderAll(
  statements: readonly Written[],
  indent: string,
  draft: Draft,
  blankBetween: boolean,
): string {
  const separator = blankBetween ? draft.lineBreak + draft.lineBreak : draft.lineBreak;
  return statements
    .map((statement) => render(statement, indent, draft.indentUnit, draft.lineBreak))
    .join(separator);
}

export function indentOf(draft: Draft, node: CstNode): string {
  return node.kind === "statement" ? node.indent : indentationAt(draft.text, node.range.start);
}

/** A new multi-line statement after `anchor` gets a blank line when the anchor has one above it. */
function wantsBlankLine(draft: Draft, anchor: CstNode, statements: readonly Written[]): boolean {
  return (
    statements.some((statement) => statement.length > 1) &&
    blankLineBefore(draft.text, anchor.range.start)
  );
}

/** Statements right after `anchor`, at its indentation. */
export function insertAfter(
  draft: Draft,
  anchor: Statement | RawBlock,
  statements: readonly Written[],
): TextEdit {
  const blank = wantsBlankLine(draft, anchor, statements);
  const separator = blank ? draft.lineBreak + draft.lineBreak : draft.lineBreak;
  return {
    start: anchor.range.end,
    end: anchor.range.end,
    insert: separator + renderAll(statements, indentOf(draft, anchor), draft, blank),
  };
}

/** Statements as the first children of a block statement. */
export function insertFirstChild(
  draft: Draft,
  parent: Statement,
  statements: readonly Written[],
): TextEdit {
  const offset = headLinesEnd(draft.text, parent);
  return {
    start: offset,
    end: offset,
    insert: draft.lineBreak + renderAll(statements, childIndent(draft, parent), draft, false),
  };
}

export function childIndent(draft: Draft, parent: Statement): string {
  return parent.indent + draft.indentUnit;
}

/** The statement children of a block, in order. */
export function statementChildren(statement: Statement | undefined): Statement[] {
  return (statement?.block?.children ?? []).filter(
    (child): child is Statement => child.kind === "statement",
  );
}

/** Statements and raw blocks of a block, in order. */
export function codeChildren(statement: Statement | undefined): (Statement | RawBlock)[] {
  return (statement?.block?.children ?? []).filter(
    (child): child is Statement | RawBlock => child.kind === "statement" || child.kind === "raw",
  );
}

/** Statements as the last children of a block: after its last statement, else as the first. */
export function insertLastChild(
  draft: Draft,
  parent: Statement,
  statements: readonly Written[],
): TextEdit {
  const last = codeChildren(parent).at(-1);
  return last === undefined
    ? insertFirstChild(draft, parent, statements)
    : insertAfter(draft, last, statements);
}

/** A one-liner that can gain ` {` in place: no text block, continuation or trailing comment. */
export function canOpenInPlace(statement: Statement): boolean {
  return (
    statement.block === undefined &&
    !statement.endsInTextBlock &&
    !statement.continued &&
    statement.trailingComment === undefined
  );
}

/** ` {`, the children, `}` at the end of a one-liner. */
export function openBlock(
  draft: Draft,
  statement: Statement,
  children: readonly Written[],
): TextEdit {
  const inner = renderAll(children, statement.indent + draft.indentUnit, draft, false);
  return {
    start: statement.head.end,
    end: statement.range.end,
    insert: ` {${draft.lineBreak}${inner}${draft.lineBreak}${statement.indent}}`,
  };
}

/** Children for a statement, opening it when it is a one-liner; undefined when it can't be opened. */
export function addChildren(
  draft: Draft,
  statement: Statement,
  children: readonly Written[],
  where: "first" | "last" | Statement | RawBlock,
): TextEdit | undefined {
  if (statement.block === undefined) {
    return canOpenInPlace(statement) ? openBlock(draft, statement, children) : undefined;
  }
  if (where === "first") return insertFirstChild(draft, statement, children);
  if (where === "last") return insertLastChild(draft, statement, children);
  return insertAfter(draft, where, children);
}

type Ranged = { readonly range: { readonly start: number; readonly end: number } };

/** The whole lines of a node, line break included (the one before when the node ends the text). */
export function removalOf(text: string, node: Ranged): TextEdit {
  let start = lineStart(text, node.range.start);
  const end = breakEnd(text, node.range.end);
  const endsTheText = end === text.length && !text.endsWith("\n");
  if (endsTheText && start > 0) {
    start = text.charCodeAt(start - 2) === 0x0d ? start - 2 : start - 1;
  }
  return { start, end, insert: "" };
}

/**
 * Removals of whole lines, merged, with the blank lines dropped that would follow a blank line:
 * a run of blank lines left behind collapses to one (SPEC 3.5 delete cascade step 8).
 */
export function removals(text: string, nodes: readonly Ranged[]): TextEdit[] {
  const ranges = nodes
    .map((node) => removalOf(text, node))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  for (const range of merged) {
    const blankAbove = range.start > 0 && isBlankLine(text, lineStart(text, range.start - 1));
    while (blankAbove && range.end < text.length && isBlankLine(text, range.end)) {
      const next = breakEnd(text, range.end);
      if (next === range.end) break;
      range.end = next;
    }
  }
  return merged.map((range) => ({ ...range, insert: "" }));
}

/** Replaces a token's raw text. */
export function replaceToken(token: Token, raw: string): TextEdit {
  return { start: token.range.start, end: token.range.end, insert: raw };
}

/**
 * Removes a token and the spaces before it on its line; a token that starts a continuation line
 * takes the ` \` and the line break before it along, so no line is left continuing onto nothing.
 */
export function removeToken(text: string, token: Token): TextEdit {
  const blank = (offset: number) => text[offset] === " " || text[offset] === "\t";
  let start = token.range.start;
  while (start > 0 && blank(start - 1)) start -= 1;
  if (start > 0 && text[start - 1] === "\n") {
    let cursor = start - 1;
    if (cursor > 0 && text[cursor - 1] === "\r") cursor -= 1;
    const previous = text.slice(lineStart(text, cursor), cursor).trimStart();
    const comment = previous.startsWith("//") || previous.startsWith("#");
    if (cursor > 0 && text[cursor - 1] === "\\" && !comment) {
      cursor -= 1;
      while (cursor > 0 && blank(cursor - 1)) cursor -= 1;
      start = cursor;
    }
  }
  return { start, end: token.range.end, insert: "" };
}

/**
 * Removes some of a statement's tokens, each run of neighbours as one edit. A run that starts its
 * line takes the spaces after it instead of the indentation before it, so the tokens left keep
 * the line's indentation (`animation` block lines start with a term).
 */
export function removeTokens(
  text: string,
  statement: Statement,
  indices: Iterable<number>,
): TextEdit[] {
  const sorted = [...new Set(indices)].sort((left, right) => left - right);
  const edits: TextEdit[] = [];
  for (let index = 0; index < sorted.length;) {
    const first = sorted[index] as number;
    let last = first;
    while (sorted[index + 1] === last + 1) {
      index += 1;
      last += 1;
    }
    index += 1;
    const start = statement.tokens[first];
    const end = statement.tokens[last];
    const next = statement.tokens[last + 1];
    if (start === undefined || end === undefined) continue;
    const lineStartsHere =
      text.slice(lineStart(text, start.range.start), start.range.start).trim() === "";
    const nextOnLine =
      next !== undefined && !/[\r\n]/.test(text.slice(end.range.end, next.range.start));
    edits.push(
      lineStartsHere && nextOnLine
        ? { start: start.range.start, end: next.range.start, insert: "" }
        : { start: removeToken(text, start).start, end: end.range.end, insert: "" },
    );
  }
  return edits;
}

/** ` raw` after a token. */
export function appendAfterToken(token: Token, raw: string): TextEdit {
  return { start: token.range.end, end: token.range.end, insert: ` ${raw}` };
}
