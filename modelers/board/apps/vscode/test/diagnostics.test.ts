import type * as vscode from "vscode";
import { beforeEach, describe, expect, test } from "vitest";

import { Uri, vscodeMock } from "./__mocks__/vscode.js";
import { BOARD_DIAGNOSTICS, createBoardDiagnostics } from "../src/diagnostics.js";
import type { MemoryDiagnosticCollection } from "../src/files/memory-vscode.js";

/**
 * The board's entries in the Problems view against the `vscode` mock: which documents are
 * checked, when, and when an entry goes.
 */

const HEADER = '{"format":"structured-model","meta":{"title":"T","version":1},"version":1}\n';
const BROKEN = `${HEADER}{"id":\n`;
const BOARD = "/repo/a.board";
const OTHER = "/repo/b.board";
const TEXT = "/repo/notes.txt";

beforeEach(
  () =>
    void vscodeMock.reset(
      { [BOARD]: HEADER, [OTHER]: BROKEN, [TEXT]: BROKEN },
      { workspaceFolders: ["/repo"] },
    ),
);

const collection = (): MemoryDiagnosticCollection => {
  const found = vscodeMock.memory.diagnostics.at(-1);
  if (!found) throw new Error("no diagnostic collection was made");
  return found;
};
const entriesOf = (path: string) => collection().get(Uri.file(path));
const open = async (path: string): Promise<vscode.TextDocument> =>
  (await vscodeMock.memory.vscode.workspace.openTextDocument(
    Uri.file(path),
  )) as unknown as vscode.TextDocument;

describe("the board's entries in the Problems view", () => {
  test("are one error for a board text that cannot be read, with the reader's reason at its line, under the board's name", async () => {
    const diagnostics = createBoardDiagnostics();
    expect(collection().name).toBe(BOARD_DIAGNOSTICS);
    expect(diagnostics.refresh(await open(OTHER))).toEqual({ count: 1, errors: 1 });
    expect(entriesOf(OTHER)).toEqual([
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
        message: "Line 2 is no JSON. The board is read-only until you fix the text.",
        severity: 0,
        source: "board",
      },
    ]);
  });

  test("are on the line the document has: VS Code hands a carriage return that stands alone in the file as a line break, so the reader and VS Code count alike", async () => {
    // On disk the second line is valid JSON with a lone carriage return between two of its
    // tokens. The document has a line break there: two lines that are no JSON each.
    const onDisk = `${HEADER}{"id":"n1",\r"kind":"node"}\n`;
    vscodeMock.memory.disk.write("/repo/return.board", onDisk);
    const diagnostics = createBoardDiagnostics();
    const document = await open("/repo/return.board");
    expect(document.getText()).toBe(`${HEADER}{"id":"n1",\n"kind":"node"}\n`);
    expect(diagnostics.refresh(document)).toEqual({ count: 1, errors: 1 });
    expect(entriesOf("/repo/return.board")).toEqual([
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 11 } },
        message: "Line 2 is no JSON. The board is read-only until you fix the text.",
        severity: 0,
        source: "board",
      },
    ]);
  });

  test("are none for a text the board reads: the pill counts nothing", async () => {
    const diagnostics = createBoardDiagnostics();
    expect(diagnostics.refresh(await open(BOARD))).toEqual({ count: 0, errors: 0 });
    expect(collection().documents).toEqual([]);
  });

  test("follow the text: the entry comes when the text breaks and goes when it is valid again", async () => {
    const { memory } = vscodeMock;
    createBoardDiagnostics();
    await open(BOARD);
    expect(entriesOf(BOARD)).toBeUndefined();
    memory.type(BOARD, `${HEADER}broken\n`);
    expect(entriesOf(BOARD)).toHaveLength(1);
    memory.type(BOARD, `${HEADER}\nstill broken\n`);
    expect(entriesOf(BOARD)?.[0]?.range.start.line).toBe(2);
    memory.undo(BOARD);
    memory.undo(BOARD);
    expect(entriesOf(BOARD)).toBeUndefined();
  });

  test("check a board file VS Code opens, in whichever editor, and every one that is open already", async () => {
    await open(OTHER);
    createBoardDiagnostics();
    expect(collection().documents).toEqual([Uri.file(OTHER).toString()]);
    vscodeMock.memory.disk.write("/repo/c.BOARD", BROKEN);
    await open("/repo/c.BOARD");
    expect(entriesOf("/repo/c.BOARD")).toHaveLength(1);
  });

  test("check no file of another name by themselves, open, opened or changed", async () => {
    await open(TEXT);
    createBoardDiagnostics();
    vscodeMock.memory.disk.write("/repo/more.txt", BROKEN);
    await open("/repo/more.txt");
    vscodeMock.memory.type(TEXT, `${BROKEN}more\n`);
    expect(collection().documents).toEqual([]);
  });

  test("keep the entry of a file of another name that the board's editor showed in step until it is valid", async () => {
    const { memory } = vscodeMock;
    const diagnostics = createBoardDiagnostics();
    // a person opened notes.txt with the board's editor, which asks for its problems
    diagnostics.refresh(await open(TEXT));
    expect(entriesOf(TEXT)).toHaveLength(1);
    memory.type(TEXT, `${HEADER}\n\nbroken\n`);
    expect(entriesOf(TEXT)?.[0]?.range.start.line).toBe(3);
    memory.type(TEXT, HEADER);
    expect(entriesOf(TEXT)).toBeUndefined();
    // valid, it is a text file like any other again
    memory.type(TEXT, BROKEN);
    expect(entriesOf(TEXT)).toBeUndefined();
  });

  test("leave a save alone: its event changes no text", async () => {
    const { memory } = vscodeMock;
    createBoardDiagnostics();
    await open(OTHER);
    const before = entriesOf(OTHER);
    memory.type(OTHER, `${BROKEN}\n`);
    const typed = entriesOf(OTHER);
    expect(typed).not.toBe(before);
    memory.save(OTHER);
    expect(entriesOf(OTHER)).toBe(typed);
  });

  test("go when VS Code closes the document, valid or not", async () => {
    const { memory } = vscodeMock;
    createBoardDiagnostics();
    await open(OTHER);
    expect(entriesOf(OTHER)).toHaveLength(1);
    memory.closeDocument(OTHER);
    expect(collection().documents).toEqual([]);
  });

  test.each(["git", "gitlens", "vscode-scm"])(
    "are none for the copy of a board that %s shows: its problems are the file's",
    async (scheme) => {
      const diagnostics = createBoardDiagnostics();
      const document = await open(OTHER);
      const copy = { ...document, uri: Uri.parse(`${scheme}:/repo/b.board?ref=HEAD`) };
      expect(diagnostics.refresh(copy as unknown as vscode.TextDocument)).toEqual({
        count: 0,
        errors: 0,
      });
      expect(collection().documents).toEqual([Uri.file(OTHER).toString()]);
    },
  );

  test("end with the extension: nothing is listened to, and the collection is VS Code's to drop", async () => {
    const { memory } = vscodeMock;
    const diagnostics = createBoardDiagnostics();
    await open(OTHER);
    expect(memory.listening().documents).toBe(3);
    diagnostics.dispose();
    expect(memory.listening().documents).toBe(0);
    expect(collection().disposed).toBe(true);
    await open(BOARD);
    memory.type(BOARD, BROKEN);
    expect(collection().documents).toEqual([]);
  });
});
