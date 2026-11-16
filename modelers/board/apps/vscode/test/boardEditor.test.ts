import { PROTOCOL, type BoardFiles, type TextSession } from "@miragon/board-files";
import { bindTextSession, type TextBinding } from "@miragon/board-host";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Uri, vscodeMock } from "./__mocks__/vscode.js";
import { BOARD_SETTINGS, SAVE_MODELS_SETTING } from "../src/boardEditor.js";
import { AFTER_DELAY_SAVE } from "../src/files/memory-vscode.js";
import { pageOf, type FakePage } from "./support/page.js";
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
    expect(panel.taken()).toEqual([
      { type: "board.welcome", shows: true },
      { type: "board.paths", paths: LISTED },
    ]);
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
    // With the last board's panel its backend goes, and the repository's index with it: all
    // that still listens is the extension's own, for the Problems view and for the record of
    // the documents the boards' pages wrote, which outlives an editor.
    second.dispose();
    expect(memory.listening()).toEqual({ documents: 4, files: 1, folders: 0, watchers: 0 });
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
    expect(memory.registeredCommands()).toHaveLength(3);
    registration.dispose();
    expect(vscodeMock.registeredEditors().at(-1)?.disposed).toBe(true);
    // its commands are free again, and its entries in the Problems view are VS Code's to drop
    expect(memory.registeredCommands()).toEqual([]);
    expect(memory.diagnostics.at(-1)?.disposed).toBe(true);
    const searches = memory.calls.findFiles.length;
    memory.disk.write("/work/repo/models/coffee.owm", TEA);
    memory.setWorkspaceFolders(["/work/repo", "/work"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(panel.taken()).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(searches);
  });
});

describe("files that move, a file that is shown", () => {
  test("tells the page of every open board when a person renames a model in VS Code", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    const first = await greeted(BOARD, provider);
    const second = await greeted(OTHER_BOARD, provider);
    memory.explorer.rename(MODEL, "/work/repo/models/green-tea.owm");
    const moved = {
      type: "board.moved",
      moves: [{ from: "models/tea.owm", to: "models/green-tea.owm" }],
    };
    expect(first.taken()[0]).toEqual(moved);
    expect(second.taken()[0]).toEqual(moved);
  });

  test("opens a file the page asks to have shown in VS Code's own way", async () => {
    const { memory } = vscodeMock;
    const panel = await greeted();
    await panel.receive({ type: "board.file.show", requestId: 1, path: "readme.md" });
    await settled();
    expect(panel.taken()).toEqual([{ type: "board.done", requestId: 1 }]);
    expect(memory.executed).toEqual([["vscode.open", Uri.file("/work/repo/readme.md")]]);
  });
});

describe("an edit that crosses a rename", () => {
  const RENAMED = "/work/repo/models/green-tea.owm";

  /**
   * A model node as the board's host package runs it, without its canvas: the real binding on
   * the real files client, a modeler that is its text, and the node's part when its file moves
   * (the session of the old path let go of, the one of the new path followed).
   */
  function nodeOn(files: BoardFiles, first: string) {
    let canvas = "";
    let path = first;
    let session: TextSession | undefined;
    let binding: TextBinding | undefined;
    const changed = new Set<() => void>();
    const notices: string[] = [];
    const modeler = {
      exportText: () => canvas,
      importText: (next: string) => {
        canvas = next;
        return Promise.resolve();
      },
      onContentChanged(listener: () => void) {
        changed.add(listener);
        return () => void changed.delete(listener);
      },
      getViewState: () => ({}),
      setViewState: () => undefined,
    };
    const open = async (): Promise<void> => {
      const opened = await files.openText(path);
      session = opened;
      if (binding) return binding.follow(opened);
      binding = bindTextSession(opened)(
        modeler as never,
        () => undefined,
        (notice) => notices.push(notice.kind === "dropped" ? `dropped ${notice.reason}` : "edited"),
      );
      await binding.ready;
    };
    files.onMoved((moves) => {
      const move = moves.find((one) => one.from === path);
      if (!move) return;
      binding?.follow(undefined);
      session?.close();
      path = move.to;
      void open();
    });
    return {
      opened: open(),
      /** the person changes the model */
      edit(next: string) {
        canvas = next;
        for (const listener of [...changed]) listener();
      },
      facts: () => ({ path, canvas, notices: [...notices] }),
    };
  }

  async function armed(): Promise<{ page: FakePage; node: ReturnType<typeof nodeOn> }> {
    const panel = await openBoard(BOARD, registerEditor().provider);
    const page = pageOf(panel);
    await vi.waitFor(() => {
      page.pump();
      expect(page.files.paths()).toContain("models/tea.owm");
    });
    const node = nodeOn(page.files, "models/tea.owm");
    await page.rest();
    await node.opened;
    expect(node.facts()).toEqual({ path: "models/tea.owm", canvas: TEA, notices: [] });
    return { page, node };
  }

  test("is said in words where the rename came first: the file moved under the edit, and nobody else says that it is gone", async () => {
    const { memory } = vscodeMock;
    const { page, node } = await armed();
    // the edit is on its way to the extension when VS Code tells the rename
    page.hold((message) => message.type === "board.text.edit");
    node.edit(MINE);
    memory.explorer.rename(MODEL, RENAMED);
    await page.rest();
    await page.release();

    // the model is as its file has it, under the new path, and the node said that the change went
    expect(node.facts()).toEqual({
      path: "models/green-tea.owm",
      canvas: TEA,
      notices: ["edited", "dropped crossed"],
    });
    expect(memory.disk.text(RENAMED)).toBe(TEA);
    // the edit named a path the page had closed by then: nothing took it
    expect(memory.document(MODEL)).toBeUndefined();
    expect(memory.document(RENAMED)?.isDirty ?? false).toBe(false);
  });

  test("is in the renamed file where it landed first: the unsaved text moved with the file, and nothing is said", async () => {
    const { memory } = vscodeMock;
    const { page, node } = await armed();
    node.edit(MINE);
    await page.rest();
    memory.explorer.rename(MODEL, RENAMED);
    await page.rest();

    expect(node.facts()).toEqual({
      path: "models/green-tea.owm",
      canvas: MINE,
      notices: ["edited"],
    });
    expect(memory.document(RENAMED)).toMatchObject({ isDirty: true });
    expect(memory.document(RENAMED)?.getText()).toBe(MINE);
  });

  test("is said too where VS Code applied it to the document of the old name after the rename", async () => {
    const { memory } = vscodeMock;
    const { page, node } = await armed();
    // VS Code applies an edit later than it is asked to: the rename comes in between
    const apply = memory.holdEdits();
    node.edit(MINE);
    await page.rest();
    memory.explorer.rename(MODEL, RENAMED);
    await page.rest();
    apply();
    await page.rest();

    expect(node.facts()).toEqual({
      path: "models/green-tea.owm",
      canvas: TEA,
      notices: ["edited", "dropped crossed"],
    });
    expect(memory.disk.text(RENAMED)).toBe(TEA);
  });
});

describe("the board file's entry in the Problems view", () => {
  const HEADER = '{"format":"structured-model","meta":{"title":"T","version":1},"version":1}\n';
  const problems = (panel: FakePanel): unknown[] =>
    panel.posted.filter((message) => (message as { type?: unknown }).type === "problems");
  const entries = (path: string) => vscodeMock.memory.diagnostics.at(-1)?.get(Uri.file(path));

  test("is there for a board whose text cannot be read as soon as its editor opens, and the page's pill is told the count", async () => {
    const { memory } = vscodeMock;
    memory.disk.write(BOARD, `${HEADER}broken\n`);
    const panel = await openBoard(BOARD);
    expect(entries(BOARD)).toMatchObject([
      {
        message: "Line 2 is no JSON. The board is read-only until you fix the text.",
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
      },
    ]);
    // nothing of it before the page is ready, which is when it has a pill
    expect(problems(panel)).toEqual([]);
    await panel.receive({ type: "ready" });
    expect(problems(panel)).toEqual([{ type: "problems", count: 1, errors: 1 }]);
  });

  test("goes when the text is valid again, from the canvas or from a text editor, and the pill follows", async () => {
    const { memory } = vscodeMock;
    memory.disk.write(BOARD, HEADER);
    const panel = await openBoard(BOARD);
    await panel.receive({ type: "ready" });
    expect(entries(BOARD)).toBeUndefined();
    memory.type(BOARD, `${HEADER}\nbroken\n`);
    expect(entries(BOARD)?.[0]?.range.start.line).toBe(2);
    memory.type(BOARD, HEADER);
    expect(entries(BOARD)).toBeUndefined();
    expect(problems(panel)).toEqual([
      { type: "problems", count: 0, errors: 0 },
      { type: "problems", count: 1, errors: 1 },
      { type: "problems", count: 0, errors: 0 },
    ]);
  });

  test("stays while the document is open after the board's tab closed, follows the text there, and goes when VS Code closes the document", async () => {
    const { memory } = vscodeMock;
    memory.disk.write(BOARD, `${HEADER}broken\n`);
    const panel = await openBoard(BOARD);
    panel.dispose();
    expect(entries(BOARD)).toHaveLength(1);
    memory.type(BOARD, `${HEADER}\n\nbroken\n`);
    expect(entries(BOARD)?.[0]?.range.start.line).toBe(3);
    memory.revert(BOARD);
    memory.closeDocument(BOARD);
    expect(entries(BOARD)).toBeUndefined();
  });
});

describe("saving the models with the board", () => {
  const SETTING = `${BOARD_SETTINGS}.${SAVE_MODELS_SETTING}`;

  /** a board whose page edited the model: the model's document is unsaved */
  async function edited(path: string = BOARD, provider = registerEditor().provider) {
    const panel = await greeted(path, provider);
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    await panel.receive({
      type: "board.text.edit",
      path: "models/tea.owm",
      text: MINE,
      version: 1,
    });
    await settled();
    expect(vscodeMock.memory.document(MODEL)).toMatchObject({ isDirty: true });
    return panel;
  }

  test("is off unless a person turns it on: the board is saved, and the model stays unsaved", async () => {
    const { memory } = vscodeMock;
    await edited();
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(MODEL)).toBe(TEA);
    // any other value than true is off as well
    vscodeMock.setConfiguration(SETTING, "true");
    memory.save(BOARD);
    await settled();
    expect(memory.disk.text(MODEL)).toBe(TEA);
  });

  test("saves the model this board's page wrote when a person saves the board, with the setting on", async () => {
    const { memory } = vscodeMock;
    await edited();
    vscodeMock.setConfiguration(SETTING, true);
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: false });
    expect(memory.disk.text(MODEL)).toBe(MINE);
  });

  test("saves a model whole: what a person typed into it in its own tab is the same document", async () => {
    const { memory } = vscodeMock;
    await edited();
    vscodeMock.setConfiguration(SETTING, true);
    memory.type(MODEL, `${MINE}note typed in its own tab\n`);
    memory.save(BOARD);
    await settled();
    expect(memory.disk.text(MODEL)).toBe(`${MINE}note typed in its own tab\n`);
  });

  test("saves no model for auto save, and none that only another board's page wrote", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    await edited(BOARD, provider);
    await greeted(OTHER_BOARD, provider);
    vscodeMock.setConfiguration(SETTING, true);
    memory.type(BOARD, '{"id":"n1","type":"note"}\n{"id":"n2","type":"note"}\n');
    memory.save(BOARD, AFTER_DELAY_SAVE);
    memory.save(OTHER_BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(MODEL)).toBe(TEA);
  });

  test("saves one round and no second: a model it saves that is open in a board editor of its own saves no models of that one", async () => {
    const { memory } = vscodeMock;
    const TEAM = "/work/repo/models/team.tt";
    const { provider } = registerEditor();
    // the first board's page wrote tea.owm
    await edited(BOARD, provider);
    memory.disk.write(TEAM, "team\n");
    // a person opened tea.owm in the board's editor as well, and that page wrote team.tt
    const second = await openBoard(MODEL, provider);
    await second.receive({ type: "board.hello", protocol: PROTOCOL });
    await vi.waitFor(() => expect(paths(second)).toContain("models/team.tt"));
    await second.receive({ type: "board.text.open", requestId: 1, path: "models/team.tt" });
    await settled();
    await second.receive({
      type: "board.text.edit",
      path: "models/team.tt",
      text: "team\nedited\n",
      version: 1,
    });
    await settled();
    vscodeMock.setConfiguration(SETTING, true);
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: false });
    expect(memory.document(TEAM)).toMatchObject({ isDirty: true });
    // the person's own save of tea.owm is that board's moment
    memory.type(MODEL, `${MINE}more\n`);
    memory.save(MODEL);
    await settled();
    expect(memory.document(TEAM)).toMatchObject({ isDirty: false });
  });

  test("saves nothing once the board's editor closed: a save of its text is a text file's save", async () => {
    const { memory } = vscodeMock;
    const panel = await edited();
    vscodeMock.setConfiguration(SETTING, true);
    panel.dispose();
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
  });

  test("still saves the model a board made unsaved after the board's editor was closed and opened again", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    const panel = await edited(BOARD, provider);
    vscodeMock.setConfiguration(SETTING, true);
    panel.dispose();
    // VS Code builds a new editor, and with it a new backend, for the board that is opened again
    await greeted(BOARD, provider);
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: false });
    expect(memory.disk.text(MODEL)).toBe(MINE);
  });

  test("still saves it after the board file itself was renamed, for which VS Code builds a new editor too", async () => {
    const { memory } = vscodeMock;
    const RENAMED_BOARD = "/work/repo/boards/renamed.board";
    const { provider } = registerEditor();
    const panel = await edited(BOARD, provider);
    vscodeMock.setConfiguration(SETTING, true);
    memory.explorer.rename(BOARD, RENAMED_BOARD);
    panel.dispose();
    await greeted(RENAMED_BOARD, provider);
    // another board of the repository saves nothing of it
    await greeted(OTHER_BOARD, provider);
    memory.save(OTHER_BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    memory.save(RENAMED_BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: false });
    expect(memory.disk.text(MODEL)).toBe(MINE);
  });

  test("saves no model whose only unsaved change is not the board's: reverted in its own tab, then typed into", async () => {
    const { memory } = vscodeMock;
    await edited();
    vscodeMock.setConfiguration(SETTING, true);
    memory.revert(MODEL);
    memory.type(MODEL, `${TEA}# a line of the person's own, not finished\n`);
    memory.save(BOARD);
    await settled();
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(MODEL)).toBe(TEA);
  });

  test("saves the unsaved text of a model a person renamed after the board edited it", async () => {
    const { memory } = vscodeMock;
    const RENAMED = "/work/repo/models/green-tea.owm";
    await edited();
    vscodeMock.setConfiguration(SETTING, true);
    // VS Code says that the old document is clean and closes it before it tells the rename
    memory.explorer.rename(MODEL, RENAMED);
    expect(memory.document(RENAMED)).toMatchObject({ isDirty: true });
    memory.save(BOARD);
    await settled();
    expect(memory.document(RENAMED)).toMatchObject({ isDirty: false });
    expect(memory.disk.text(RENAMED)).toBe(MINE);
  });

  test("does not write again a model file that another program removed: the model stays unsaved", async () => {
    const { memory } = vscodeMock;
    await edited();
    vscodeMock.setConfiguration(SETTING, true);
    memory.disk.remove(MODEL);
    memory.save(BOARD);
    await settled();
    expect(memory.disk.has(MODEL)).toBe(false);
    expect(memory.document(MODEL)).toMatchObject({ isDirty: true });
    expect(memory.document(MODEL)?.getText()).toBe(MINE);
    // VS Code was not asked to save it, so it said nothing either
    expect(memory.notices).toEqual([]);
  });

  test("saves a model once where two editors show the same board", async () => {
    const { memory } = vscodeMock;
    const { provider } = registerEditor();
    await edited(BOARD, provider);
    // the same board in a second editor group
    await greeted(BOARD, provider);
    vscodeMock.setConfiguration(SETTING, true);
    const saves: string[] = [];
    memory.vscode.workspace.onWillSaveTextDocument(({ document }) =>
      saves.push(String(document.uri.path)),
    );
    memory.save(BOARD);
    await settled();
    expect(saves).toEqual([BOARD, MODEL]);
    expect(memory.disk.text(MODEL)).toBe(MINE);
  });
});
