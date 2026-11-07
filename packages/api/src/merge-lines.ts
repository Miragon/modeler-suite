import type { MergeResult } from "./merge.js";

/** The lines of `text` with their line breaks, so a text without a final break merges as written. */
function linesOf(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/** Past this many cells the line matching would take too long, and the merge gives up. */
const MAX_MATCH_CELLS = 4_000_000;

/**
 * For each line of `a`, the index of the line of `b` it matches in a longest common subsequence,
 * or -1; `undefined` when the changed middle is too large to match.
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
  if (rows * columns > MAX_MATCH_CELLS) return undefined;
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
  return match;
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

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
  const base = linesOf(lastSynced);
  const outside = linesOf(external);
  const mine = linesOf(draft);
  const toOutside = matchLines(base, outside);
  const toMine = matchLines(base, mine);
  if (!toOutside || !toMine) return { conflictingIds: ["the whole text"] };
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
    if (sameLines(outsideRegion, baseRegion)) merged.push(...mineRegion);
    else if (sameLines(mineRegion, baseRegion) || sameLines(outsideRegion, mineRegion)) {
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
