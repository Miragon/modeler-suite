import { createMemoryBackend, PROTOCOL, type MemoryBackend } from "@miragon/board-files";
import { registerModelerEditor, type ModelerEditor } from "@miragon/modeler-shell/vscode/extension";
import { createVsCodeHostStub } from "@miragon/modeler-shell/testing/vscode-stub";
import { describe, expect, test } from "vitest";

import {
  BOARD_FILES_RULE,
  BOARD_VIEW_TYPE,
  boardEditorOptions,
  MODEL_SUFFIXES,
  type BoardBackend,
} from "../src/boardEditorOptions.js";
import { settled } from "./support/wire.js";

/**
 * The editor's options on the shell's own VS Code stub and a backend in memory: the plumbing a
 * test page of the webview registers, with no `vscode` and no VS Code backend in it.
 */

const TEA = "title Tea\n";
const FILES = {
  "models/tea.owm": TEA,
  "readme.md": "# Repo\n",
  ".github/idea.owm": TEA,
  "assets/logo.svg": { bytes: new TextEncoder().encode("<svg/>"), mime: "image/svg+xml" },
};

type Posted = { type: string } & Record<string, unknown>;

async function opened(backendFor: (board: { path: string }) => BoardBackend | undefined) {
  const stub = createVsCodeHostStub();
  registerModelerEditor(
    stub.vscode,
    { extensionUri: stub.extensionUri },
    boardEditorOptions(backendFor),
  );
  const open = async (path: string) => {
    const document = stub.openTextDocument(path, "");
    const panel = await stub.openCustomEditor(BOARD_VIEW_TYPE, document);
    const board = (): Posted[] =>
      (panel.posted as Posted[]).filter((message) => String(message.type).startsWith("board."));
    return { document, panel, board };
  };
  return { stub, open };
}

describe("the board editor's options", () => {
  test("name the manifest's view type, a title and the one theme the board draws", () => {
    const options = boardEditorOptions(() => undefined);
    expect(options).toMatchObject({ viewType: "board.boardEditor", title: "Board" });
    expect(options.themes).toEqual(["light"]);
    expect(BOARD_VIEW_TYPE).toBe("board.boardEditor");
  });

  test("take the models from the suite's suffix table, and a board's pictures", () => {
    expect(MODEL_SUFFIXES).toEqual([
      ".wmap",
      ".owm",
      ".storm",
      ".tt",
      ".ttm.json",
      ".cm",
      ".cm.json",
      ".vc",
      ".vc.json",
      ".c4",
      ".bmc",
      ".bpmn",
    ]);
    expect(BOARD_FILES_RULE.model("models/tea.owm")).toBe(true);
    expect(BOARD_FILES_RULE.model("models/TEAM.TTM.JSON")).toBe(true);
    expect(BOARD_FILES_RULE.model("boards/other.board")).toBe(false);
    expect(BOARD_FILES_RULE.model("src/extension.ts")).toBe(false);
    expect(BOARD_FILES_RULE.picture("assets/logo.svg")).toBe(true);
    expect(BOARD_FILES_RULE.picture("models/tea.owm")).toBe(false);
  });

  test("serve the files a backend has to the editor's webview, over the panel the board file's sync uses", async () => {
    const backend = createMemoryBackend(FILES);
    const boards: string[] = [];
    const { open } = await opened((board) => {
      boards.push(board.path);
      return backend;
    });
    const { panel, board } = await open("/repo/boards/a.board");
    expect(boards).toEqual(["/repo/boards/a.board"]);
    // nothing of the files before the page's hello
    expect(board()).toEqual([]);
    await panel.receive({ type: "board.hello", protocol: PROTOCOL });
    // The page is told what a board reaches: no other file, and none in a dot folder. A
    // repository in memory has no editor to show a file in, and the welcome says so.
    expect(board()).toEqual([
      { type: "board.welcome", shows: false },
      { type: "board.paths", paths: ["assets/logo.svg", "models/tea.owm"] },
    ]);
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(board().at(-1)).toMatchObject({ type: "board.text.opened", text: TEA, version: 1 });
  });

  test("write a model into the backend and leave the board file's document alone", async () => {
    const backend = createMemoryBackend(FILES);
    const { stub, open } = await opened(() => backend);
    const { panel, document } = await open("/repo/boards/a.board");
    await panel.receive({ type: "board.hello", protocol: PROTOCOL });
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    await panel.receive({
      type: "board.text.edit",
      path: "models/tea.owm",
      text: "title Mine\n",
      version: 1,
    });
    await settled();
    expect(backend.textOf("models/tea.owm")).toBe("title Mine\n");
    expect(stub.appliedEdits).toEqual([]);
    expect(document.getText()).toBe("");
  });

  test("leave the shell's own messages to the shell: the board file is still its document", async () => {
    const backend = createMemoryBackend(FILES);
    const { stub, open } = await opened(() => backend);
    const { panel, document } = await open("/repo/boards/a.board");
    await panel.receive({ type: "ready" });
    expect(panel.posted).toContainEqual({ type: "init", text: "" });
    await panel.receive({ type: "edit", text: '{"id":"n1"}\n' });
    expect(document.getText()).toBe('{"id":"n1"}\n');
    expect(stub.appliedEdits).toHaveLength(1);
    // and a message that is neither the shell's nor the board's goes nowhere
    await panel.receive({ type: "export", format: "png" });
    await panel.receive("board.hello");
    expect(backend.writes).toEqual([]);
  });

  test("give each open editor a server of its own", async () => {
    const backends: MemoryBackend[] = [];
    const { open } = await opened(() => {
      const backend = createMemoryBackend(FILES);
      backends.push(backend);
      return backend;
    });
    const first = await open("/repo/boards/a.board");
    const second = await open("/repo/boards/b.board");
    expect(backends).toHaveLength(2);
    await second.panel.receive({ type: "board.hello", protocol: PROTOCOL });
    expect(second.board().map((message) => message.type)).toEqual(["board.welcome", "board.paths"]);
    expect(first.board()).toEqual([]);
    await first.panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    expect(first.board()).toEqual([
      { type: "board.failed", requestId: 1, message: "the page has not said hello" },
    ]);
  });

  test("end the server and then the backend when the editor closes, and leave another editor's running", async () => {
    const ended: string[] = [];
    const { open } = await opened((board) => {
      const memory = createMemoryBackend(FILES);
      return {
        ...memory,
        // the server listens to the list from the page's hello until it is disposed
        onListChanged(listener) {
          const off = memory.onListChanged(listener);
          return () => {
            ended.push(`server of ${board.path}`);
            off();
          };
        },
        dispose: () => ended.push(`backend of ${board.path}`),
      };
    });
    const first = await open("/repo/boards/a.board");
    const second = await open("/repo/boards/b.board");
    await first.panel.receive({ type: "board.hello", protocol: PROTOCOL });
    await second.panel.receive({ type: "board.hello", protocol: PROTOCOL });
    first.panel.dispose();
    expect(ended).toEqual(["server of /repo/boards/a.board", "backend of /repo/boards/a.board"]);
    await second.panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(second.board().at(-1)).toMatchObject({ type: "board.text.opened", requestId: 1 });
  });

  test("answer every request of a board that was handed no backend, so that no node waits for ever", async () => {
    const { open } = await opened(() => undefined);
    const { panel, board } = await open("/repo/boards/a.board");
    await panel.receive({ type: "board.hello", protocol: PROTOCOL });
    await panel.receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await panel.receive({ type: "board.bytes.read", requestId: 2, path: "assets/logo.svg" });
    await panel.receive({
      type: "board.file.create",
      requestId: 3,
      path: "assets/new.png",
      base64: "AAAA",
      mime: "image/png",
    });
    await settled();
    await panel.receive({ type: "board.file.show", requestId: 4, path: "readme.md" });
    expect(board()).toEqual([
      { type: "board.welcome", shows: false },
      { type: "board.paths", paths: [] },
      { type: "board.failed", requestId: 1, message: "this board has no files" },
      { type: "board.bytes", requestId: 2, path: "assets/logo.svg", base64: null, mime: "" },
      { type: "board.failed", requestId: 3, message: "this board has no files" },
      { type: "board.failed", requestId: 4, message: "this host cannot show a file" },
    ]);
  });

  test("keep a write on its way when the panel that would be told is gone and throws", async () => {
    const backend = createMemoryBackend(FILES);
    const options = boardEditorOptions(() => backend);
    let mode: "throws" | "rejects" = "throws";
    const editor = {
      document: { uri: { scheme: "file", path: "/repo/a.board" } },
      post() {
        if (mode === "throws") throw new Error("Webview is disposed");
        return Promise.reject(new Error("Webview is disposed"));
      },
    } as unknown as ModelerEditor;
    options.onDidOpen?.(editor);
    const receive = (message: unknown): unknown => options.onMessage?.(message as never, editor);
    receive({ type: "board.hello", protocol: PROTOCOL });
    receive({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    mode = "rejects";
    receive({ type: "board.text.edit", path: "models/tea.owm", text: "title Mine\n", version: 1 });
    // answered into a panel that rejects the post: nobody is left to hear it, and nothing fails
    receive({ type: "board.text.settle", requestId: 2 });
    await settled();
    expect(backend.textOf("models/tea.owm")).toBe("title Mine\n");
  });
});
