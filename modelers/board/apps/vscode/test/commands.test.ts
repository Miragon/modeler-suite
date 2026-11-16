import * as vscode from "vscode";
import { beforeEach, describe, expect, test } from "vitest";

import { TabInputCustom, Uri, ViewColumn, vscodeMock } from "./__mocks__/vscode.js";
import { BOARD_VIEW_TYPE } from "../src/boardEditorOptions.js";
import {
  NEW_BOARD_COMMAND,
  NEW_BOARD_FROM_EXAMPLE_COMMAND,
  NO_BOARD_MESSAGE,
  OPEN_SOURCE_COMMAND,
  revealRestoredTab,
} from "../src/commands.js";
import { EXAMPLE } from "../src/example-files.js";
import { openBoard, registerEditor } from "./support/panel.js";

/**
 * The extension's commands as `activate` registers them, against the `vscode` mock: a person
 * runs each from the Command Palette, the New File menu, the editor title or the walkthrough.
 */

const BOARD = "/work/repo/boards/a.board";
const FILES = {
  "/work/repo/.git/HEAD": "",
  [BOARD]: "",
  "/work/repo/models/tea.owm": "title My own tea\n",
};

beforeEach(() => void vscodeMock.reset(FILES, { workspaceFolders: ["/work/repo"] }));

const run = (command: string, ...rest: unknown[]): Thenable<unknown> =>
  vscode.commands.executeCommand(command, ...rest);
/** what VS Code was asked to open, without the commands a test ran itself */
const opened = (): unknown[][] =>
  vscodeMock.executedCommands().filter(([command]) => String(command).startsWith("vscode."));

describe("New Board", () => {
  test("asks where the board goes, writes an empty file there and opens it in the board's editor", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/boards/workshop.board"));
    await run(NEW_BOARD_COMMAND);
    expect(vscodeMock.saveDialogs()).toEqual([
      {
        title: "New Board",
        saveLabel: "Create board",
        filters: { Board: ["board"] },
        defaultUri: Uri.file("/work/repo/untitled.board"),
      },
    ]);
    // an empty file is a new board
    expect(memory.disk.text("/work/repo/boards/workshop.board")).toBe("");
    expect(opened()).toEqual([
      ["vscode.openWith", Uri.file("/work/repo/boards/workshop.board"), BOARD_VIEW_TYPE],
    ]);
  });

  test("gives the file the name the board's editor opens, and asks before that replaces a file the dialog did not ask about", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    memory.disk.write("/work/repo/plan.board", "kept\n");
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/plan"));
    await run(NEW_BOARD_COMMAND);
    expect(vscodeMock.shownMessages()).toEqual([
      {
        severity: "warning",
        message: "plan.board already exists. Do you want to replace it?",
        items: ["Replace"],
        modal: true,
      },
    ]);
    expect(memory.disk.text("/work/repo/plan.board")).toBe("kept\n");
    expect(opened()).toEqual([]);
    vscodeMock.press("Replace");
    await run(NEW_BOARD_COMMAND);
    expect(memory.disk.text("/work/repo/plan.board")).toBe("");
    expect(memory.disk.has("/work/repo/plan")).toBe(false);
    // a name that ends as a board's does, in whatever letters, is taken as it is
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/Plan.BOARD"));
    await run(NEW_BOARD_COMMAND);
    expect(memory.disk.text("/work/repo/Plan.BOARD")).toBe("");
    expect(memory.disk.has("/work/repo/Plan.BOARD.board")).toBe(false);
  });

  test("writes and opens nothing when the person closes the dialog", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    await run(NEW_BOARD_COMMAND);
    expect(vscodeMock.saveDialogs()).toHaveLength(1);
    expect(memory.calls.writeFile).toEqual([]);
    expect(opened()).toEqual([]);
  });
});

describe("New Board from Example", () => {
  test("writes the example's files beside the board, then the board, and opens it", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/play/example.board"));
    await run(NEW_BOARD_FROM_EXAMPLE_COMMAND);
    expect(vscodeMock.saveDialogs()).toEqual([
      {
        title: "New Board from Example",
        saveLabel: "Create board",
        filters: { Board: ["board"] },
        defaultUri: Uri.file("/work/repo/example.board"),
      },
    ]);
    const written = Object.keys(EXAMPLE.files).map((path) => `/work/repo/play/${path}`);
    expect(memory.calls.writeFile).toEqual([...written, "/work/repo/play/example.board"]);
    // each folder of the example is made once, however many files go into it
    expect(memory.calls.createDirectory).toEqual([
      "/work/repo/play/assets",
      "/work/repo/play/models",
    ]);
    for (const [path, text] of Object.entries(EXAMPLE.files)) {
      expect(memory.disk.text(`/work/repo/play/${path}`), path).toBe(text);
    }
    // the board names its files from the repository's root, where a board looks for them
    expect(memory.disk.text("/work/repo/play/example.board")).toContain(
      '"file":"play/models/tea.owm"',
    );
    expect(opened()).toEqual([
      ["vscode.openWith", Uri.file("/work/repo/play/example.board"), BOARD_VIEW_TYPE],
    ]);
    expect(vscodeMock.shownMessages()).toEqual([]);
  });

  test("never writes over a file that is there, and says which the board shows in its place", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/example.board"));
    await run(NEW_BOARD_FROM_EXAMPLE_COMMAND);
    expect(memory.disk.text("/work/repo/models/tea.owm")).toBe("title My own tea\n");
    expect(memory.disk.text("/work/repo/models/sample.tt")).toBe(EXAMPLE.files["models/sample.tt"]);
    expect(vscodeMock.shownMessages()).toEqual([
      {
        severity: "info",
        message: "models/tea.owm was already there. It was left as it is, and the board shows it.",
        items: [],
        modal: false,
      },
    ]);
    expect(opened()).toHaveLength(1);
  });

  test("writes nothing at all where the person does not want a board of that name replaced", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    memory.disk.write("/work/repo/play/example.board", "kept\n");
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/play/example"));
    await run(NEW_BOARD_FROM_EXAMPLE_COMMAND);
    expect(memory.calls.writeFile).toEqual([]);
    expect(memory.disk.has("/work/repo/play/models/tea.owm")).toBe(false);
    expect(opened()).toEqual([]);
  });

  test("says so and opens nothing where the example could not be written", async () => {
    const { memory } = vscodeMock;
    registerEditor();
    // a file where the example needs a folder
    memory.disk.write("/work/repo/play/models", "in the way\n");
    const { createDirectory } = memory.vscode.workspace.fs;
    memory.vscode.workspace.fs.createDirectory = (uri) =>
      uri.path === "/work/repo/play/models"
        ? Promise.reject(new Error("a file is in the way"))
        : createDirectory(uri);
    vscodeMock.answerSaveDialog(Uri.file("/work/repo/play/example.board"));
    await run(NEW_BOARD_FROM_EXAMPLE_COMMAND);
    expect(vscodeMock.shownMessages()).toEqual([
      {
        severity: "error",
        message: "Couldn't create example.board. Try again, or choose another folder.",
        items: [],
        modal: false,
      },
    ]);
    expect(memory.disk.has("/work/repo/play/example.board")).toBe(false);
    expect(opened()).toEqual([]);
  });
});

describe("Open Source to the Side", () => {
  const beside = (path: string): unknown[] => [
    "vscode.openWith",
    Uri.file(path),
    "default",
    ViewColumn.Beside,
  ];

  test("opens the text of the board whose title button was pressed, beside it", async () => {
    registerEditor();
    await run(OPEN_SOURCE_COMMAND, Uri.file("/work/repo/boards/other.board"));
    expect(opened()).toEqual([beside("/work/repo/boards/other.board")]);
  });

  test("means the board that had the focus last where it is run without a file, as from the Command Palette", async () => {
    await openBoard(BOARD);
    await run(OPEN_SOURCE_COMMAND);
    expect(opened()).toEqual([beside(BOARD)]);
    // something that is no file, as a keybinding of a person's own may pass, is no file either
    await run(OPEN_SOURCE_COMMAND, "/work/repo/boards/other.board");
    expect(opened()).toEqual([beside(BOARD), beside(BOARD)]);
    // and the title button of another board means that board, whichever had the focus last
    await run(OPEN_SOURCE_COMMAND, Uri.file("/work/repo/boards/other.board"));
    expect(opened().at(-1)).toEqual(beside("/work/repo/boards/other.board"));
  });

  test("shows a board's tab that VS Code restored and has not resolved yet, and opens its text", async () => {
    registerEditor();
    const restored = Uri.file("/work/repo/boards/restored.board");
    vscodeMock.setTabGroups([
      { inputs: [{ walkthrough: true }], activeTab: 0, active: true },
      {
        inputs: [
          new TabInputCustom(restored, "other.editor"),
          new TabInputCustom(restored, BOARD_VIEW_TYPE),
        ],
        activeTab: 0,
      },
    ]);
    await run(OPEN_SOURCE_COMMAND);
    expect(opened()).toEqual([
      ["vscode.openWith", restored, BOARD_VIEW_TYPE, 2],
      beside("/work/repo/boards/restored.board"),
    ]);
  });

  test("tells a person to open a board first where there is none", async () => {
    registerEditor();
    await run(OPEN_SOURCE_COMMAND);
    expect(opened()).toEqual([]);
    expect(vscodeMock.shownMessages()).toEqual([
      { severity: "info", message: NO_BOARD_MESSAGE, items: [], modal: false },
    ]);
  });
});

describe("a restored tab of the board", () => {
  const board = (name: string): TabInputCustom =>
    new TabInputCustom(Uri.file(`/work/repo/${name}.board`), BOARD_VIEW_TYPE);

  test("is looked for in the active group first, then among the tabs the groups show, then anywhere", async () => {
    vscodeMock.setTabGroups([
      { inputs: [board("hidden"), { text: true }], activeTab: 1 },
      { inputs: [{ text: true }, board("active-group")], activeTab: 0, active: true },
      { inputs: [board("shown")], activeTab: 0 },
    ]);
    expect((await revealRestoredTab(BOARD_VIEW_TYPE))?.path).toBe("/work/repo/active-group.board");
    vscodeMock.setTabGroups([
      { inputs: [board("hidden"), { text: true }], activeTab: 1, active: true },
      { inputs: [board("shown")], activeTab: 0 },
    ]);
    expect((await revealRestoredTab(BOARD_VIEW_TYPE))?.path).toBe("/work/repo/hidden.board");
    vscodeMock.setTabGroups([
      { inputs: [{ text: true }], activeTab: 0, active: true },
      { inputs: [board("behind"), { text: true }], activeTab: 1 },
      { inputs: [{ text: true }, board("shown")], activeTab: 1 },
    ]);
    expect((await revealRestoredTab(BOARD_VIEW_TYPE))?.path).toBe("/work/repo/shown.board");
    expect(opened().at(-1)).toEqual([
      "vscode.openWith",
      Uri.file("/work/repo/shown.board"),
      BOARD_VIEW_TYPE,
      3,
    ]);
    vscodeMock.setTabGroups([
      { inputs: [{ text: true }], activeTab: 0, active: true },
      { inputs: [board("behind"), { text: true }], activeTab: 1 },
    ]);
    expect((await revealRestoredTab(BOARD_VIEW_TYPE))?.path).toBe("/work/repo/behind.board");
  });

  test("is none where no tab is the board's", async () => {
    vscodeMock.setTabGroups([
      { inputs: [{ text: true }, new TabInputCustom(Uri.file("/a"), "x")] },
    ]);
    expect(await revealRestoredTab(BOARD_VIEW_TYPE)).toBeUndefined();
    expect(opened()).toEqual([]);
  });
});
