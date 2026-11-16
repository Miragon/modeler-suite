import { encodeBoard } from "@miragon/board-schema-model";
import { describe, expect, test } from "vitest";
import {
  boardFileText,
  downloadName,
  holdsNothing,
  namesFiles,
  unreadableFile,
} from "../src/board-file.js";

const node = (type: string, more: Record<string, unknown>): Record<string, unknown> => ({
  kind: "node",
  type,
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  z: "a",
  ...more,
});
const board = (elements: Record<string, Record<string, unknown>>): string =>
  encodeBoard({ meta: { title: "A board" }, elements });

describe("the name of a download", () => {
  test.each([
    ["team.board", "team.board"],
    ["Team Plan.board", "Team Plan.board"],
    // the suffix is told whatever its case, and kept as a board file has it
    ["TEAM.BOARD", "TEAM.board"],
    // a file that holds a board under another name keeps that name in front
    ["notes.txt", "notes.txt.board"],
    ["  spaced.board  ", "spaced.board"],
  ])("of %s is %s", (name, expected) => {
    expect(downloadName(name)).toBe(expected);
  });

  test.each([undefined, "", "   ", ".board"])("of a board without a name (%s)", (name) => {
    expect(downloadName(name)).toBe("untitled.board");
  });

  test("never carries a folder", () => {
    expect(downloadName("boards/team.board")).toBe("team.board");
    expect(downloadName("C:\\boards\\team.board")).toBe("team.board");
    expect(downloadName("boards/")).toBe("untitled.board");
  });
});

describe("a file as a board text", () => {
  test("a board is handed back as it is, canonical or not", () => {
    const text = board({ n_note: node("text", { text: "A note" }) });
    const reordered = text.split("\n").filter(Boolean).reverse().join("\n");

    expect(boardFileText(text)).toEqual({ ok: true, text });
    expect(boardFileText(reordered)).toEqual({ ok: true, text: reordered });
    // an empty file is a new board
    expect(boardFileText("")).toEqual({ ok: true, text: "" });
  });

  test("another file is refused with the reader's reason", () => {
    expect(boardFileText("title Tea Shop\n")).toEqual({ ok: false, reason: "line 1 is no JSON" });
    expect(boardFileText('{"id":"n_a","kind":"node"}\n')).toEqual({
      ok: false,
      reason: "the text has no header line: not a board file",
    });
  });
});

describe("what the page says of a file that is no board", () => {
  test("names the file, gives the reason as a sentence, and says what to check", () => {
    expect(unreadableFile("tea.owm", "line 1 is no JSON")).toBe(
      "Couldn't read “tea.owm”. Line 1 is no JSON. Check that it is a .board file.",
    );
    expect(unreadableFile("a.json", "the text has no header line: not a board file")).toBe(
      "Couldn't read “a.json”. The text has no header line: not a board file. Check that it is a .board file.",
    );
    expect(unreadableFile("a.board", "Ends in a stop.")).toBe(
      "Couldn't read “a.board”. Ends in a stop. Check that it is a .board file.",
    );
  });
});

describe("a board that holds nothing", () => {
  test("is one without an element, whatever its header says", () => {
    expect(holdsNothing("")).toBe(true);
    expect(holdsNothing(board({}))).toBe(true);
    expect(holdsNothing(encodeBoard({ meta: {}, elements: {} }))).toBe(true);
  });

  test("is no board with an element, and no text that is no board", () => {
    expect(holdsNothing(board({ n_note: node("text", { text: "" }) }))).toBe(false);
    expect(holdsNothing(board({ n_group: node("group", { text: "Group" }) }))).toBe(false);
    // what cannot be read is not known to be empty: it is kept
    expect(holdsNothing("not a board at all")).toBe(false);
  });
});

describe("a board that shows files of its repository", () => {
  test("has a model or a picture that names one", () => {
    expect(namesFiles(board({ n_model: node("model", { file: "models/tea.owm" }) }))).toBe(true);
    expect(namesFiles(board({ n_logo: node("image", { file: "assets/logo.svg" }) }))).toBe(true);
  });

  test("is none of notes, groups and arrows, nor one whose nodes name no file", () => {
    expect(
      namesFiles(
        board({
          n_note: node("text", { text: "models/tea.owm" }),
          n_group: node("group", { text: "Group" }),
          n_nameless: node("model", { file: "" }),
          n_none: node("image", {}),
          e_arrow: { kind: "edge", source: "n_note", target: "n_group", label: "assets/a.png" },
        }),
      ),
    ).toBe(false);
    expect(namesFiles("")).toBe(false);
    expect(namesFiles("not a board at all")).toBe(false);
  });
});
