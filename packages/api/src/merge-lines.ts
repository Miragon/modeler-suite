import { type MergeResult, sameStrings } from "./merge.js";

/** The lines of `text` with their line breaks, so a text without a final break merges as written. */
function linesOf(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * The work the line matching may spend on the changed middle of two texts: the cells of its table,
 * or, past them, about as many line comparisons along a shortest edit script.
 */
const MAX_MATCH_CELLS = 4_000_000;

/** Matches the middle along a longest common subsequence, from a table of rows × columns cells. */
function matchByTable(
  a: readonly string[],
  b: readonly string[],
  start: number,
  rows: number,
  columns: number,
  match: Int32Array,
): void {
  const width = columns + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      lengths[i * width + j] =
        a[start + i] === b[start + j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (a[start + i] === b[start + j]) {
      match[start + i] = start + j;
      i += 1;
      j += 1;
    } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) i += 1;
    else j += 1;
  }
}

/**
 * Whether the edit that reaches `diagonal` after `edits` edits inserts a line of `b` (coming from
 * `diagonal + 1`) rather than drops one of `a` (from `diagonal - 1`); `index` is the position of
 * `diagonal` in `reach`, the furthest line of `a` on each diagonal after `edits - 1` edits.
 */
function arrivesByInsertion(
  reach: Int32Array,
  index: number,
  diagonal: number,
  edits: number,
): boolean {
  return diagonal === -edits || (diagonal !== edits && reach[index - 1]! < reach[index + 1]!);
}

/**
 * Myers' shortest edit script ("An O(ND) Difference Algorithm and Its Variations", 1986) on the
 * middle: for each number of edits short of the script's length, the furthest line of `a` reached
 * on each diagonal from `-edits` to `edits`; `undefined` when the script needs more than
 * `maxEdits` edits. Each diagonal compares a line pair at most once, so the work is about
 * `(rows + columns) × maxEdits` comparisons.
 */
function furthestReachPerEdit(
  a: readonly string[],
  b: readonly string[],
  start: number,
  rows: number,
  columns: number,
  maxEdits: number,
): Int32Array[] | undefined {
  const center = maxEdits + 1;
  const furthest = new Int32Array(2 * maxEdits + 3);
  const trace: Int32Array[] = [];
  for (let edits = 0; edits <= maxEdits; edits++) {
    for (let diagonal = -edits; diagonal <= edits; diagonal += 2) {
      const index = center + diagonal;
      let x = arrivesByInsertion(furthest, index, diagonal, edits)
        ? furthest[index + 1]!
        : furthest[index - 1]! + 1;
      let y = x - diagonal;
      while (x < rows && y < columns && a[start + x] === b[start + y]) {
        x += 1;
        y += 1;
      }
      furthest[index] = x;
      if (x >= rows && y >= columns) return trace;
    }
    trace.push(furthest.slice(center - edits, center + edits + 1));
  }
  return undefined;
}

/** Matches the middle along the edit script `trace` holds, walking it back from its end. */
function matchAlongEditScript(
  trace: readonly Int32Array[],
  start: number,
  rows: number,
  columns: number,
  match: Int32Array,
): void {
  let x = rows;
  let y = columns;
  for (let edits = trace.length; edits > 0; edits--) {
    const reach = trace[edits - 1]!;
    const diagonal = x - y;
    const previousDiagonal = arrivesByInsertion(reach, diagonal + edits - 1, diagonal, edits)
      ? diagonal + 1
      : diagonal - 1;
    const previousX = reach[previousDiagonal + edits - 1]!;
    const previousY = previousX - previousDiagonal;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
      match[start + x] = start + y;
    }
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    match[start + x] = start + y;
  }
}

/**
 * For each line of `a`, the index of the line of `b` it matches in a longest common subsequence,
 * or -1. A changed middle of up to MAX_MATCH_CELLS cells matches by the table; a larger one along
 * a shortest edit script, which a few changes keep short. `undefined` when that script needs more
 * than MAX_MATCH_CELLS / (rows + columns) edits, which keeps its work within the table's.
 */
function matchLines(a: readonly string[], b: readonly string[]): Int32Array | undefined {
  const match = new Int32Array(a.length).fill(-1);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    match[start] = start;
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
    match[endA] = endB;
  }
  const rows = endA - start;
  const columns = endB - start;
  if (rows === 0 || columns === 0) return match;
  if (rows * columns <= MAX_MATCH_CELLS) {
    matchByTable(a, b, start, rows, columns, match);
    return match;
  }
  const maxEdits = Math.floor(MAX_MATCH_CELLS / (rows + columns));
  const trace = furthestReachPerEdit(a, b, start, rows, columns, maxEdits);
  if (!trace) return undefined;
  matchAlongEditScript(trace, start, rows, columns, match);
  return match;
}

/**
 * The three-way merge of two texts line by line (diff3): between the lines neither side changed,
 * the side that changed a region wins, both sides making the same change agree, and two different
 * changes of one region (two insertions at one place included) conflict. The conflicts name the
 * regions as lines of `lastSynced`. For a notation whose text is its own source (a DSL kept
 * losslessly), which the modeler then has to parse to know the result is valid.
 */
export function mergeTextLines(
  lastSynced: string,
  external: string,
  draft: string,
): MergeResult<string> {
  // M1 holds for any two texts: these return before the line matching, which gives up on a side
  // that rewrote too much of a large text.
  if (external === lastSynced || external === draft) return { merged: draft };
  if (draft === lastSynced) return { merged: external };
  const base = linesOf(lastSynced);
  const outside = linesOf(external);
  const mine = linesOf(draft);
  const toOutside = matchLines(base, outside);
  if (!toOutside) return { conflictingIds: ["the whole text"] };
  const toMine = matchLines(base, mine);
  if (!toMine) return { conflictingIds: ["the whole text"] };
  const merged: string[] = [];
  const conflictingIds: string[] = [];
  let baseStart = 0;
  let outsideStart = 0;
  let mineStart = 0;
  for (;;) {
    let stable = baseStart;
    while (stable < base.length && (toOutside[stable] === -1 || toMine[stable] === -1)) stable += 1;
    const outsideEnd = stable < base.length ? toOutside[stable]! : outside.length;
    const mineEnd = stable < base.length ? toMine[stable]! : mine.length;
    const baseRegion = base.slice(baseStart, stable);
    const outsideRegion = outside.slice(outsideStart, outsideEnd);
    const mineRegion = mine.slice(mineStart, mineEnd);
    if (sameStrings(outsideRegion, baseRegion)) merged.push(...mineRegion);
    else if (sameStrings(mineRegion, baseRegion) || sameStrings(outsideRegion, mineRegion)) {
      merged.push(...outsideRegion);
    } else conflictingIds.push(`lines ${baseStart + 1}-${Math.max(stable, baseStart + 1)}`);
    if (stable >= base.length) break;
    merged.push(base[stable]!);
    baseStart = stable + 1;
    outsideStart = outsideEnd + 1;
    mineStart = mineEnd + 1;
  }
  return conflictingIds.length > 0 ? { conflictingIds } : { merged: merged.join("") };
}
