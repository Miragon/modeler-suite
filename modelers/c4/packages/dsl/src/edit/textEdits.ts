/*
 * Text edits against one text: applying them, and the minimal edit list between two texts that
 * an outcome reports (SPEC 1.4, 3.4). The diff works on physical lines first, so a rename of one
 * token or a moved box is one small edit, and VS Code records one minimal line edit per change.
 */
import type { TextEdit } from "../types.js";

/** Above this many differing lines a hunk is reported whole: the edit stays exact, only coarser. */
const MAXIMUM_LINE_DIFFERENCES = 4000;

/** Non-overlapping edits against `text`, applied back to front. */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  let result = "";
  let position = 0;
  for (const edit of ordered) {
    if (edit.start < position || edit.end < edit.start || edit.end > text.length) {
      throw new RangeError(`overlapping or out-of-range text edit at ${edit.start}..${edit.end}`);
    }
    result += text.slice(position, edit.start) + edit.insert;
    position = edit.end;
  }
  return result + text.slice(position);
}

/** The edits that turn `before` into `after`, and the ones that turn it back. */
export function diffTexts(
  before: string,
  after: string,
): { readonly edits: TextEdit[]; readonly inverse: TextEdit[] } {
  if (before === after) return { edits: [], inverse: [] };
  const edits = lineHunks(before, after).flatMap((hunk) => refine(before, after, hunk));
  return { edits, inverse: invert(before, edits) };
}

/** The inverse of edits against `before`: edits against their result that restore `before`. */
export function invert(before: string, edits: readonly TextEdit[]): TextEdit[] {
  const ordered = [...edits].sort((left, right) => left.start - right.start);
  const inverse: TextEdit[] = [];
  let shift = 0;
  for (const edit of ordered) {
    const start = edit.start + shift;
    inverse.push({
      start,
      end: start + edit.insert.length,
      insert: before.slice(edit.start, edit.end),
    });
    shift += edit.insert.length - (edit.end - edit.start);
  }
  return inverse;
}

interface Hunk {
  readonly beforeStart: number;
  readonly beforeEnd: number;
  readonly afterStart: number;
  readonly afterEnd: number;
}

/** Physical lines with their line breaks, and where each starts. */
function linesOf(text: string): { readonly lines: string[]; readonly starts: number[] } {
  const lines: string[] = [];
  const starts: number[] = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline === -1 ? text.length : newline + 1;
    starts.push(start);
    lines.push(text.slice(start, end));
    start = end;
  }
  starts.push(text.length);
  return { lines, starts };
}

/** Myers' greedy diff on lines; each run of changed lines becomes one hunk in character offsets. */
function lineHunks(before: string, after: string): Hunk[] {
  const left = linesOf(before);
  const right = linesOf(after);
  let prefix = 0;
  while (
    prefix < left.lines.length &&
    prefix < right.lines.length &&
    left.lines[prefix] === right.lines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < left.lines.length - prefix &&
    suffix < right.lines.length - prefix &&
    left.lines[left.lines.length - 1 - suffix] === right.lines[right.lines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const a = left.lines.slice(prefix, left.lines.length - suffix);
  const b = right.lines.slice(prefix, right.lines.length - suffix);
  const whole: Hunk = {
    beforeStart: left.starts[prefix] ?? before.length,
    beforeEnd: left.starts[left.lines.length - suffix] ?? before.length,
    afterStart: right.starts[prefix] ?? after.length,
    afterEnd: right.starts[right.lines.length - suffix] ?? after.length,
  };
  const script = editScript(a, b);
  if (script === undefined) return [whole];
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: { i: number; j: number } | undefined;
  const close = () => {
    if (open === undefined) return;
    hunks.push({
      beforeStart: left.starts[prefix + open.i] ?? before.length,
      beforeEnd: left.starts[prefix + i] ?? before.length,
      afterStart: right.starts[prefix + open.j] ?? after.length,
      afterEnd: right.starts[prefix + j] ?? after.length,
    });
    open = undefined;
  };
  for (const step of script) {
    if (step === "=") {
      close();
      i += 1;
      j += 1;
    } else {
      open ??= { i, j };
      if (step === "-") i += 1;
      else j += 1;
    }
  }
  close();
  return hunks;
}

/** `=` keep, `-` delete from `a`, `+` insert from `b`; undefined when the lines differ too much. */
function editScript(a: readonly string[], b: readonly string[]): string[] | undefined {
  const n = a.length;
  const m = b.length;
  const maximum = Math.min(n + m, MAXIMUM_LINE_DIFFERENCES);
  const offset = maximum + 1;
  const frontier = new Int32Array(2 * maximum + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maximum; d += 1) {
    trace.push(frontier.slice());
    for (let k = -d; k <= d; k += 2) {
      const down =
        k === -d || (k !== d && (frontier[offset + k - 1] ?? 0) < (frontier[offset + k + 1] ?? 0));
      let x = down ? (frontier[offset + k + 1] ?? 0) : (frontier[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      frontier[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, offset, n, m, d);
    }
  }
  return undefined;
}

function backtrack(
  trace: readonly Int32Array[],
  offset: number,
  n: number,
  m: number,
  depth: number,
): string[] {
  const steps: string[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d -= 1) {
    const frontier = trace[d] as Int32Array;
    const k = x - y;
    const down =
      k === -d || (k !== d && (frontier[offset + k - 1] ?? 0) < (frontier[offset + k + 1] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = frontier[offset + previousK] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      steps.push("=");
      x -= 1;
      y -= 1;
    }
    steps.push(down ? "+" : "-");
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    steps.push("=");
    x -= 1;
    y -= 1;
  }
  return steps.reverse();
}

/** A line hunk narrowed to the characters that differ. */
function refine(before: string, after: string, hunk: Hunk): TextEdit[] {
  let start = hunk.beforeStart;
  let afterStart = hunk.afterStart;
  let end = hunk.beforeEnd;
  let afterEnd = hunk.afterEnd;
  while (start < end && afterStart < afterEnd && before[start] === after[afterStart]) {
    start += 1;
    afterStart += 1;
  }
  while (end > start && afterEnd > afterStart && before[end - 1] === after[afterEnd - 1]) {
    end -= 1;
    afterEnd -= 1;
  }
  if (start === end && afterStart === afterEnd) return [];
  return [{ start, end, insert: after.slice(afterStart, afterEnd) }];
}
