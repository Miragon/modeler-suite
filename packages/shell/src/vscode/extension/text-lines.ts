import type { PositionLike } from "./types.js";

/** Replace the text between `start` and `end` with `text`, whose line breaks are `\n`. */
export interface LineEdit {
  start: PositionLike;
  end: PositionLike;
  text: string;
}

/** The lines of `text` without their line breaks, as `TextDocument.lineAt(i).text` reports them. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

/**
 * The smallest whole-line edit that turns a document of `oldLines` (without line breaks) into
 * `newText`: the lines both share at the start and at the end stay untouched. A full-range replace
 * would move every cursor of a side-by-side text editor to the end of the file; touching only the
 * changed lines keeps cursors, scroll position and the diff of the edit small. `undefined` when only
 * the line break style differs. The inserted text uses `\n`, which VS Code writes as the document's
 * line break.
 */
export function minimalLineEdit(
  oldLines: readonly string[],
  newText: string,
): LineEdit | undefined {
  const newLines = splitLines(newText);
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const shorter = Math.min(oldCount, newCount);

  let prefix = 0;
  while (prefix < shorter && oldLines[prefix] === newLines[prefix]) prefix++;
  if (prefix === oldCount && prefix === newCount) return undefined;

  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    oldLines[oldCount - 1 - suffix] === newLines[newCount - 1 - suffix]
  ) {
    suffix++;
  }

  const inserted = newLines.slice(prefix, newCount - suffix);
  if (suffix > 0) {
    return {
      start: { line: prefix, character: 0 },
      end: { line: oldCount - suffix, character: 0 },
      text: inserted.map((line) => `${line}\n`).join(""),
    };
  }

  // The last line has no line break of its own: anchor at the end of the line before, so removed
  // or added lines take their preceding break with them.
  const lastLine = oldCount - 1;
  const end = { line: lastLine, character: oldLines[lastLine]?.length ?? 0 };
  if (prefix === 0) return { start: { line: 0, character: 0 }, end, text: inserted.join("\n") };
  return {
    start: { line: prefix - 1, character: oldLines[prefix - 1]?.length ?? 0 },
    end,
    text: inserted.map((line) => `\n${line}`).join(""),
  };
}
