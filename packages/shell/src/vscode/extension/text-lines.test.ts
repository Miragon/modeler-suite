import { describe, expect, it } from "vitest";

import { minimalLineEdit, splitLines } from "./index.js";

/** Applies an edit as VS Code does: the inserted `\n` become the document's line break. */
function applied(before: string, after: string): string {
  const edit = minimalLineEdit(splitLines(before), after);
  if (!edit) return before;
  const eol = before.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitLines(before);
  const offsetOf = ({ line, character }: { line: number; character: number }): number =>
    lines.slice(0, line).reduce((sum, text) => sum + text.length + eol.length, 0) + character;
  return (
    before.slice(0, offsetOf(edit.start)) +
    edit.text.replace(/\n/g, eol) +
    before.slice(offsetOf(edit.end))
  );
}

describe("splitLines", () => {
  it("splits at both line breaks, as TextDocument.lineAt reports the lines", () => {
    expect(splitLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines("a\n")).toEqual(["a", ""]);
    expect(splitLines("")).toEqual([""]);
  });
});

describe("minimalLineEdit", () => {
  it("is undefined for the same text and for a difference in line breaks only", () => {
    expect(minimalLineEdit(splitLines("a\nb\n"), "a\nb\n")).toBeUndefined();
    expect(minimalLineEdit(splitLines("a\r\nb\r\n"), "a\nb\n")).toBeUndefined();
  });

  it("touches the one line that changed", () => {
    expect(minimalLineEdit(splitLines("a\nb\nc\n"), "a\nB\nc\n")).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
      text: "B\n",
    });
    expect(applied("a\nb\nc\n", "a\nB\nc\n")).toBe("a\nB\nc\n");
  });

  it.each([
    ["insert in the middle", "a\nc\n", "a\nb\nc\n"],
    ["delete in the middle", "a\nb\nc\n", "a\nc\n"],
    ["append a line (trailing newline)", "a\nb\n", "a\nb\nc\n"],
    ["append to a file without a trailing newline", "a\nb", "a\nb\nc"],
    ["delete the last line (no trailing newline)", "a\nb\nc", "a\nb"],
    ["change the last line (no trailing newline)", "a\nb", "a\nB"],
    ["add a trailing newline", "a\nb", "a\nb\n"],
    ["remove the trailing newline", "a\nb\n", "a\nb"],
    ["replace everything", "x\ny", "p\nq\nr"],
    ["fill an empty document", "", "title A\n"],
    ["clear the document", "title A\n", ""],
    ["repeated lines", "a\na\na\n", "a\na\n"],
    ["one line among repeated ones", "a\na\na\n", "a\nb\na\n"],
  ])("%s", (_name, before, after) => {
    expect(applied(before, after)).toBe(after);
  });

  it("keeps the document's CRLF line breaks", () => {
    expect(applied("a\r\nb\r\nc\r\n", "a\nB\nc\n")).toBe("a\r\nB\r\nc\r\n");
  });
});
