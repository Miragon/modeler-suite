import { describe, expect, test } from "vitest";

import { boardProblem } from "../src/problems.js";

/**
 * A board text the board's reader refuses, as the entry the Problems view shows: the reader's
 * reason, and the line VS Code has for the line the reader names.
 */

const HEADER = '{"format":"structured-model","meta":{"title":"T","version":1},"version":1}';
const NOTE = '{"id":"n1","kind":"node","type":"text"}';
const AFTER = "The board is read-only until you fix the text.";

describe("the problem of a board text", () => {
  test("is none for a text the board reads: an empty one, a header alone, a header and its elements", () => {
    expect(boardProblem("")).toBeUndefined();
    expect(boardProblem(`${HEADER}\n`)).toBeUndefined();
    expect(boardProblem(`${HEADER}\n${NOTE}\n`)).toBeUndefined();
  });

  test("is the reader's reason as a sentence, with what follows for the board, at the line the reader names", () => {
    expect(boardProblem(`${HEADER}\n${NOTE}\n{"id":\n`)).toEqual({
      message: `Line 3 is no JSON. ${AFTER}`,
      line: 2,
      length: 6,
    });
    expect(boardProblem(`${HEADER}\n${NOTE}\n${NOTE}\n`)).toEqual({
      message: `Line 3 repeats the element id n1. ${AFTER}`,
      line: 2,
      length: NOTE.length,
    });
  });

  test("names the first line for a first line that is wrong, and for a text that has no header at all", () => {
    expect(boardProblem("not a board\nmore\n")).toMatchObject({ line: 0, length: 11 });
    expect(boardProblem(`${NOTE}\n`)).toEqual({
      message: `The text has no header line: not a board file. ${AFTER}`,
      line: 0,
      length: NOTE.length,
    });
  });

  test("counts a line as VS Code does: one line break for a carriage return with its line feed", () => {
    expect(boardProblem(`${HEADER}\r\n${NOTE}\r\nbroken\r\n`)).toEqual({
      message: `Line 3 is no JSON. ${AFTER}`,
      line: 2,
      // without the carriage return, which is the line's break and none of its characters
      length: 6,
    });
  });

  test("counts a carriage return that stands alone as a line break of VS Code's, which the reader does not", () => {
    // the reader's line 2 is `{"id":"n1"}\r{"id":"n2"}`, which is no JSON: VS Code shows it as lines 2 and 3
    const text = `${HEADER}\n{"id":"n1"}\r{"id":"n2"}\n${NOTE}\nbroken`;
    expect(boardProblem(text)).toMatchObject({ message: `Line 2 is no JSON. ${AFTER}`, line: 1 });
    // and the reader's line 4 is VS Code's fifth
    const later = `${HEADER}\n{"id":"n1",\r"kind":"node"}\n${NOTE.replace("n1", "n2")}\nbroken`;
    expect(boardProblem(later)).toEqual({
      message: `Line 4 is no JSON. ${AFTER}`,
      line: 4,
      length: 6,
    });
  });

  test("reaches the last line of a text that does not end in a line break", () => {
    expect(boardProblem(`${HEADER}\n${NOTE}\nbroken`)).toMatchObject({ line: 2, length: 6 });
  });
});
