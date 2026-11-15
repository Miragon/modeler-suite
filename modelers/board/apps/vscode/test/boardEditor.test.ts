import { PROTOCOL } from "@miragon/board-files";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { vscodeMock } from "./__mocks__/vscode.js";
import { openBoard, registerEditor, type FakePanel } from "./support/panel.js";
import { settled } from "./support/wire.js";

/**
 * The extension as `activate` registers it, against the `vscode` mock: the shell's plumbing for
 * the board file, the files server and the VS Code backend together.
 */

const BOARD = "/work/repo/boards/a.board";
const OTHER_BOARD = "/work/repo/boards/b.board";
const MODEL = "/work/repo/models/tea.owm";
const TEA = "title Tea\ncomponent Cup [0.8, 0.6]\n";
const MINE = "title Tea\ncomponent Mug [0.8, 0.6]\n";
const LISTED = ["assets/logo.svg", "models/tea.owm"];

const FILES = {
  "/work/repo/.git/config": "[core]\n",
  [BOARD]: '{"id":"n1","type":"note"}\n',
  [OTHER_BOARD]: "",
  [MODEL]: TEA,
  "/work/repo/readme.md": "# Repo\n",
  "/work/repo/assets/logo.svg": "<svg/>",
};

beforeEach(() => void vscodeMock.reset(FILES, { workspaceFolders: ["/work/repo"] }));

/** the list the page was told last */
function paths(panel: FakePanel): unknown {
  const told = panel.posted.filter(
    (message): message is { type: string; paths: string[] } =>
      (message as { type?: unknown }).type === "board.paths",
  );
  return told.at(-1)?.paths;
}

async function greeted(
  path: string = BOARD,
  provider = registerEditor().provider,
): Promise<FakePanel> {
  const panel = await openBoard(path, provider);
  await panel.receive({ type: "board.hello", protocol: PROTOCOL });
  await vi.waitFor(() => expect(paths(panel)).toEqual(LISTED));
  panel.taken();
  return panel;
}

describe("the board editor in VS Code", () => {
  test("serves the files of the board's repository to its webview once the page said hello", async () => {
    const panel = await openBoard(BOARD);
    // the root is found and its files are searched, and still nothing is pushed before the hello
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(panel.taken()).toEqual([]);
    await panel.receive({ type: "board.hello", protocol: PROTOCOL });
    expect(panel.taken()).toEqual([{ type: "board.paths", paths: LISTED }]);
  });

  test("answers a hello that comes before the files are found with the empty list, and tells the files after", async () => {
    const panel = await openBoard(BOARD);
    await panel.receive({ type: "board.hello", protocol: PROTOCOL });
    expect(panel.posted).toContainEqual({ type: "board.paths", paths: [] });
    await vi.waitFor(() => expect(paths(panel)).toEqual(LISTED));
  });

  test("keeps the board file VS Code's document: the text on ready, and a canvas change as an edit of that document", async () => {
    const { memory } = vscodeMock;
    const panel = await openBoard(BOARD);
    await panel.receive({ type: "ready" });
    expect(panel.posted).toContainEqual({ type: "init", text: '{"id":"n1","type":"note"}\n' });
    await panel.receive({
      type: "edit",
      text: '{"id":"n1","type":"note"}\n{"id":"n2","type":"note"}\n',
    });
    expect(memory.applied).toHaveLength(1);
    expect(memory.applied[0]).toMatchObject({ text: '{"id":"n2","type":"note"}\n' });
    expect(memory.document(BOARD)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(BOARD)).toBe('{"id":"n1","type":"note"}\n');
  });

  test("edits a model through the model's own document, which turns dirty, and never the board's", async () => {
    const { memory } = vscodeMock;
    const panel = await greeted();
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(panel.taken()).toEqual([
      {
        type: "board.text.opened",
        requestId: 1,
        path: "models/tea.owm",
        text: TEA,
        readOnly: false,
        version: 1,
      },
    ]);
    await panel.receive({
      type: "board.text.edit",
      path: "models/tea.owm",
      text: MINE,
      version: 1,
    });
    await settled();
    expect(memory.document(MODEL)?.getText()).toBe(MINE);
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    expect(memory.document(BOARD)).toMatchObject({ isDirty: false });
    // nothing is saved: the person saves the model as any other file
    expect(memory.disk.text(MODEL)).toBe(TEA);
    expect(memory.calls.writeFile).toEqual([]);
    // and a text editor beside the board reaches the node
    memory.type(MODEL, "title Typed beside the board\n");
    expect(panel.taken()).toEqual([
      {
        type: "board.text.update",
        path: "models/tea.owm",
        text: "title Typed beside the board\n",
        version: 2,
      },
    ]);
  });

  test("never asks VS Code for a file a board does not reach: the server refuses the path first", async () => {
    const { memory } = vscodeMock;
    const panel = await greeted();
    const asked = memory.calls.stat.length;
    const opens = memory.calls.openTextDocument.length;
    await panel.receive({ type: "board.text.open", requestId: 1, path: "readme.md" });
    await panel.receive({ type: "board.text.open", requestId: 2, path: ".git/config" });
    await panel.receive({ type: "board.text.open", requestId: 3, path: "../repo/models/tea.owm" });
    await panel.receive({ type: "board.text.open", requestId: 4, path: "boards/b.board" });
    await panel.receive({ type: "board.bytes.read", requestId: 5, path: "models/tea.owm" });
    await panel.receive({ type: "board.bytes.read", requestId: 6, path: "/etc/passwd.png" });
    // the board file of this very editor: its text is the editor's document and never a file
    await panel.receive({ type: "board.text.open", requestId: 7, path: "boards/a.board" });
    await panel.receive({ type: "board.bytes.read", requestId: 8, path: "boards/a.board" });
    await settled();
    expect(panel.taken().map((message) => message.message)).toEqual([
      "readme.md is no model a board shows here",
      "a board reaches no dot file and no file in a dot folder",
      "this path is outside the repository",
      "boards/b.board is no model a board shows here",
      "models/tea.owm is no picture a board shows here",
      "this path is outside the repository",
      "boards/a.board is no model a board shows here",
      "boards/a.board is no picture a board shows here",
    ]);
    expect(memory.calls.stat).toHaveLength(asked);
    expect(memory.calls.openTextDocument).toHaveLength(opens);
    expect(memory.calls.readFile).toEqual([]);
  });

  test("answers two boards of one repository from one index, each in its own webview", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    const first = await greeted(BOARD, provider);
    const second = await greeted(OTHER_BOARD, provider);
    // one search for the models and one for the pictures, whatever the number of boards
    expect(memory.calls.findFiles).toHaveLength(2);
    memory.disk.write("/work/repo/models/coffee.owm", TEA);
    await vi.waitFor(() => {
      expect(paths(first)).toEqual([...LISTED, "models/coffee.owm"].sort());
      expect(paths(second)).toEqual([...LISTED, "models/coffee.owm"].sort());
    });
  });

  test("ends an editor's files with its panel and leaves the other board's", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    const first = await greeted(BOARD, provider);
    const second = await greeted(OTHER_BOARD, provider);
    first.dispose();
    memory.disk.write("/work/repo/models/coffee.owm", TEA);
    await vi.waitFor(() => expect(paths(second)).toContain("models/coffee.owm"));
    expect(first.taken()).toEqual([]);
  });

  test("lands the edit that reached the host though the person closed the board in the middle of it", async () => {
    const { memory } = vscodeMock;
    const panel = await greeted();
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    const release = memory.holdEdits();
    await panel.receive({
      type: "board.text.edit",
      path: "models/tea.owm",
      text: MINE,
      version: 1,
    });
    await settled();
    panel.dispose();
    release();
    await settled();
    expect(memory.document(MODEL)?.getText()).toBe(MINE);
    expect(memory.errors).toEqual([]);
  });

  test("lets go of the indexes when the extension is deactivated", async () => {
    const { memory } = vscodeMock;
    const { provider, registration } = registerEditor();
    const panel = await greeted(BOARD, provider);
    registration.dispose();
    expect(vscodeMock.registeredEditors().at(-1)?.disposed).toBe(true);
    const searches = memory.calls.findFiles.length;
    memory.disk.write("/work/repo/models/coffee.owm", TEA);
    memory.setWorkspaceFolders(["/work/repo", "/work"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(panel.taken()).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(searches);
  });
});
