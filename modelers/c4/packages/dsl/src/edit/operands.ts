/*
 * Where an identifier sits inside a view or animation term: a rename rewrites exactly those
 * places, and the frame condition reads them as the ids they resolve to.
 */
import type { TextEdit } from "../types.js";

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;

/** Occurrences of an identifier operand in a token's raw text, at identifier boundaries. */
export function operandEdits(
  raw: string,
  start: number,
  written: string,
  replacement: string,
): TextEdit[] {
  const edits: TextEdit[] = [];
  const lower = raw.toLowerCase();
  const target = written.toLowerCase();
  for (let index = lower.indexOf(target); index !== -1; index = lower.indexOf(target, index + 1)) {
    const before = raw[index - 1] ?? "";
    const after = raw[index + target.length] ?? "";
    const afterNext = raw[index + target.length + 1] ?? "";
    const boundaryBefore = !IDENTIFIER_CHAR.test(before) && before !== "." && before !== "-";
    const boundaryAfter =
      !IDENTIFIER_CHAR.test(after) &&
      after !== "." &&
      (after !== "-" || afterNext === ">" || afterNext === "/");
    if (boundaryBefore && boundaryAfter) {
      edits.push({ start: start + index, end: start + index + target.length, insert: replacement });
    }
  }
  return edits;
}
