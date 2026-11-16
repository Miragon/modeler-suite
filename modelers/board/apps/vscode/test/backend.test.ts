import {
  PICTURE_SUFFIXES,
  PROTOCOL,
  serveFiles,
  toBase64,
  type HostMessage,
} from "@miragon/board-files";
import { describe, expect, test, vi } from "vitest";

import { BOARD_FILES_RULE, MODEL_SUFFIXES } from "../src/boardEditorOptions.js";
import { createVsCodeBackend, NO_ROOT, type VsCodeBackend } from "../src/files/backend.js";
import { createIndexPool } from "../src/files/file-index.js";
import { createMemoryVsCode, MemoryUri, type MemoryVsCode } from "../src/files/memory-vscode.js";
import { createWire, settled, type Wire } from "./support/wire.js";

/**
 * The backend behind the files server, as the extension runs the two: a page's messages on one
 * side, the fake VS Code on the other.
 */

const SUFFIXES = { models: MODEL_SUFFIXES, pictures: PICTURE_SUFFIXES };
const PATH = "models/tea.owm";
const FILE = "/work/repo/models/tea.owm";
const TEA = "title Tea\ncomponent Cup [0.8, 0.6]\ncomponent Tea [0.6, 0.5]\n";
const MINE = "title Tea\ncomponent Mug [0.8, 0.6]\ncomponent Tea [0.6, 0.5]\n";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const REPOSITORY = {
  "/work/repo/.git/HEAD": "ref: refs/heads/main\n",
  "/work/repo/boards/a.board": "",
  [FILE]: TEA,
  "/work/repo/models/teams/sample.tt": "",
  "/work/repo/assets/logo.svg": "<svg/>",
  "/work/repo/readme.md": "# Repo\n",
};
const LISTED = ["assets/logo.svg", "models/tea.owm", "models/teams/sample.tt"];

interface Served {
  readonly memory: MemoryVsCode;
  readonly backend: VsCodeBackend;
  readonly wire: Wire;
  readonly server: { dispose(): void };
  /** the list the page was told last */
  paths(): string[] | undefined;
}

/** a page that said hello to the backend of a board, once the root and its files are found */
async function served(
  files: Record<string, string> = REPOSITORY,
  options: { board?: string; folders?: readonly string[] } = {},
): Promise<Served> {
  const memory = createMemoryVsCode(files, { workspaceFolders: options.folders ?? ["/work/repo"] });
  const backend = createVsCodeBackend(memory.vscode, {
    board: MemoryUri.file(options.board ?? "/work/repo/boards/a.board"),
    suffixes: SUFFIXES,
    // no rest: the list's own rest has its tests, and these wait by polling
    indexes: createIndexPool(memory.vscode, SUFFIXES, { restMs: 0 }),
  });
  const wire = createWire();
  const server = serveFiles(wire.host, backend, BOARD_FILES_RULE);
  wire.send({ type: "board.hello", protocol: PROTOCOL });
  await backend.ready();
  await settled();
  let last: string[] | undefined;
  const paths = (): string[] | undefined => {
    for (const message of wire.fromHost) if (message.type === "board.paths") last = message.paths;
    return last;
  };
  return { memory, backend, wire, server, paths };
}

/** the answers to requests, in the order of the requests: each comes when its own work is done */
function byRequest(messages: readonly HostMessage[]): HostMessage[] {
  const answers = messages.filter((message) => "requestId" in message);
  const idOf = (message: HostMessage): number => ("requestId" in message ? message.requestId : 0);
  return answers.sort((one, other) => idOf(one) - idOf(other));
}

/** the same, with the model open and the answers so far taken off the wire */
async function opened(files?: Record<string, string>): Promise<Served> {
  const all = await served(files);
  all.wire.send({ type: "board.text.open", requestId: 1, path: PATH });
  await settled();
  expect(all.wire.fromHost.at(-1)).toEqual({
    type: "board.text.opened",
    requestId: 1,
    path: PATH,
    text: TEA,
    readOnly: false,
    version: 1,
  });
  all.paths();
  all.wire.taken();
  return all;
}

describe("the root of a board's files", () => {
  test("is its repository: the page is told the empty list at once and the repository's files once they are found", async () => {
    const { wire } = await served(REPOSITORY, { folders: ["/work/repo/boards"] });
    expect(wire.fromHost).toEqual([
      // VS Code has an editor for every file: the page may ask to have one shown
      { type: "board.welcome", shows: true },
      { type: "board.paths", paths: [] },
      { type: "board.paths", paths: LISTED },
    ]);
  });

  test("is the folder VS Code has open where there is no repository", async () => {
    const { paths } = await served(
      { "/work/boards/a.board": "", "/work/models/tea.owm": TEA, "/elsewhere/other.owm": TEA },
      { board: "/work/boards/a.board", folders: ["/work"] },
    );
    expect(paths()).toEqual(["models/tea.owm"]);
  });

  test("is none for a single file: the list stays empty, no model opens, no bytes are read, and a new picture fails with the reason", async () => {
    const { memory, wire } = await served(
      { "/downloads/a.board": "", "/downloads/models/tea.owm": TEA },
      { board: "/downloads/a.board", folders: [] },
    );
    expect(wire.taken()).toEqual([
      { type: "board.welcome", shows: true },
      { type: "board.paths", paths: [] },
    ]);
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "assets/logo.png" });
    wire.send({
      type: "board.file.create",
      requestId: 3,
      path: "assets/new.png",
      base64: toBase64(PNG),
      mime: "image/png",
    });
    await settled();
    wire.send({ type: "board.file.show", requestId: 4, path: "models/tea.owm" });
    await settled();
    expect(byRequest(wire.taken())).toEqual([
      { type: "board.failed", requestId: 1, message: NO_ROOT },
      { type: "board.bytes", requestId: 2, path: "assets/logo.png", base64: null, mime: "" },
      { type: "board.failed", requestId: 3, message: NO_ROOT },
      { type: "board.failed", requestId: 4, message: NO_ROOT },
    ]);
    expect(memory.executed).toEqual([]);
    expect(memory.calls.findFiles).toEqual([]);
    expect(memory.calls.openTextDocument).toEqual([]);
    expect(memory.calls.writeFile).toEqual([]);
  });

  test("follows a folder that VS Code opens and closes while the board is open: the list, and an open text with it", async () => {
    const { memory, wire, paths } = await served(
      { "/work/boards/a.board": "", "/work/models/tea.owm": TEA },
      { board: "/work/boards/a.board", folders: [] },
    );
    expect(paths()).toEqual([]);
    memory.setWorkspaceFolders(["/work"]);
    await vi.waitFor(() => expect(paths()).toEqual(["models/tea.owm"]));
    wire.taken();
    wire.send({ type: "board.text.open", requestId: 1, path: PATH });
    await settled();
    expect(wire.taken()).toMatchObject([{ type: "board.text.opened", text: TEA, version: 1 }]);
    memory.setWorkspaceFolders([]);
    await vi.waitFor(() => expect(paths()).toEqual([]));
    expect(wire.taken()).toEqual([
      { type: "board.text.gone", path: PATH },
      { type: "board.paths", paths: [] },
    ]);
    // without a root an edit has no file to land in
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.applied).toEqual([]);
    memory.setWorkspaceFolders(["/work"]);
    await vi.waitFor(() => expect(paths()).toEqual(["models/tea.owm"]));
    expect(wire.fromHost).toContainEqual({
      type: "board.text.update",
      path: PATH,
      text: TEA,
      version: 2,
    });
  });
});

describe("a root that stays", () => {
  test("keeps its index and its open texts when the folders change and the repository is the same", async () => {
    const { memory, backend, wire } = await opened();
    const list = backend.list();
    const searches = memory.calls.findFiles.length;
    memory.setWorkspaceFolders(["/work/repo", "/elsewhere"]);
    await backend.ready();
    await settled();
    // the index searched again, as it does for every change of the folders, and is the same one
    expect(memory.calls.findFiles).toHaveLength(searches + 2);
    expect(backend.list()).toBe(list);
    expect(wire.fromHost).toEqual([]);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
  });
});

describe("the list a page is told", () => {
  test("follows a file that is made, one that is deleted, and a folder a person renames in VS Code", async () => {
    const { memory, paths } = await served();
    memory.disk.write("/work/repo/models/coffee.owm", TEA);
    await vi.waitFor(() => expect(paths()).toEqual([...LISTED, "models/coffee.owm"].sort()));
    memory.disk.remove("/work/repo/models/coffee.owm");
    await vi.waitFor(() => expect(paths()).toEqual(LISTED));
    memory.explorer.rename("/work/repo/models", "/work/repo/maps");
    await vi.waitFor(() =>
      expect(paths()).toEqual(["assets/logo.svg", "maps/tea.owm", "maps/teams/sample.tt"]),
    );
  });

  test("comes from one index for two boards of a repository, and the second board has it at once", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const indexes = createIndexPool(memory.vscode, SUFFIXES, { restMs: 0 });
    const board = MemoryUri.file("/work/repo/boards/a.board");
    const first = createVsCodeBackend(memory.vscode, { board, suffixes: SUFFIXES, indexes });
    await first.ready();
    const second = createVsCodeBackend(memory.vscode, { board, suffixes: SUFFIXES, indexes });
    let told = 0;
    second.onListChanged(() => (told += 1));
    await second.ready();
    expect(second.list()).toBe(first.list());
    expect(second.list()).toEqual(LISTED);
    expect(told).toBe(1);
    expect(memory.calls.findFiles).toHaveLength(2);
    first.dispose();
    memory.disk.write("/work/repo/models/later.owm", TEA);
    expect(second.list()).toContain("models/later.owm");
  });
});

describe("a model's text between a page and VS Code", () => {
  test("is written as one minimal edit of the file's document, and the echo of that edit posts nothing", async () => {
    const { memory, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.applied).toHaveLength(1);
    expect(memory.applied[0]).toMatchObject({
      range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
      text: "component Mug [0.8, 0.6]\n",
    });
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(FILE)).toBe(TEA);
    expect(wire.fromHost).toEqual([]);
    // the page's next edit, made on the version it knows, is taken: no echo moved the version
    wire.send({ type: "board.text.edit", path: PATH, text: TEA, version: 1 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(TEA);
    expect(wire.fromHost).toEqual([]);
  });

  test("posts a change the page did not make as the next version, and drops an edit made on the one before", async () => {
    const { memory, wire } = await opened();
    memory.type(FILE, "title Typed beside the board\n");
    expect(wire.taken()).toEqual([
      { type: "board.text.update", path: PATH, text: "title Typed beside the board\n", version: 2 },
    ]);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe("title Typed beside the board\n");
    expect(memory.applied).toEqual([]);
    // the page has the other text already, and is told that its own edit is not in the file
    expect(wire.taken()).toEqual([{ type: "board.text.dropped", path: PATH, reason: "crossed" }]);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 2 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
  });

  test("answers an edit VS Code refused with the document's text, once", async () => {
    const { memory, wire } = await opened();
    const release = memory.holdEdits();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    // the person types while the edit is on its way to VS Code's main thread
    memory.type(FILE, "title Typed meanwhile\n");
    release();
    await settled();
    expect(memory.document(FILE)?.getText()).toBe("title Typed meanwhile\n");
    // VS Code refused it because the document moved on: a crossing, and told as one
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: PATH, text: "title Typed meanwhile\n", version: 2 },
      { type: "board.text.dropped", path: PATH, reason: "crossed" },
    ]);
  });

  test("answers an edit that would make the file larger than a board opens with the document's text: VS Code is handed no edit", async () => {
    const { memory, wire } = await opened();
    const huge = `title Tea\n${"a".repeat(2 * 1024 * 1024)}`;
    wire.send({ type: "board.text.edit", path: PATH, text: huge, version: 1 });
    await settled();
    expect(memory.applied).toEqual([]);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false, version: 1 });
    expect(wire.taken()).toEqual([
      { type: "board.text.update", path: PATH, text: TEA, version: 2 },
      { type: "board.text.dropped", path: PATH, reason: "too-large" },
    ]);
    // the page shows the document's text again, and its next edit is made on that
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 2 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
    expect(wire.fromHost).toEqual([]);
  });

  test("opens a document VS Code let go of again before the next write", async () => {
    const { memory, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.save(FILE);
    memory.closeDocument(FILE);
    expect(memory.document(FILE)).toBeUndefined();
    const opens = memory.calls.openTextDocument.length;
    wire.send({ type: "board.text.edit", path: PATH, text: TEA, version: 1 });
    await settled();
    expect(memory.calls.openTextDocument).toHaveLength(opens + 1);
    expect(memory.document(FILE)?.getText()).toBe(TEA);
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(wire.fromHost).toEqual([]);
  });

  test("answers an edit made on a text the file no longer has with the file's text, and writes nothing over it", async () => {
    const { memory, wire } = await opened();
    memory.closeDocument(FILE);
    // a checkout that no watcher told of
    memory.disk.unwatched(() => memory.disk.write(FILE, "title From a checkout\n"));
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.applied).toEqual([]);
    expect(memory.document(FILE)?.getText()).toBe("title From a checkout\n");
    expect(wire.taken()).toEqual([
      { type: "board.text.update", path: PATH, text: "title From a checkout\n", version: 2 },
      { type: "board.text.dropped", path: PATH, reason: "crossed" },
    ]);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 2 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
  });

  test("posts the text of a file another program changed while VS Code had no document of it", async () => {
    const { memory, wire } = await opened();
    memory.closeDocument(FILE);
    memory.disk.write(FILE, "title From Git\n");
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: PATH, text: "title From Git\n", version: 2 },
    ]);
  });

  test("says when the file went and posts its text when it is back; the list follows", async () => {
    const { memory, wire, paths } = await opened();
    memory.disk.remove(FILE);
    expect(wire.fromHost).toContainEqual({ type: "board.text.gone", path: PATH });
    await vi.waitFor(() => expect(paths()).not.toContain(PATH));
    wire.taken();
    memory.disk.write(FILE, TEA);
    await vi.waitFor(() => expect(paths()).toContain(PATH));
    expect(wire.fromHost).toContainEqual({
      type: "board.text.update",
      path: PATH,
      text: TEA,
      version: 2,
    });
  });

  test("opens no link and no file above the size limit, and says why", async () => {
    const { memory, wire } = await served({
      ...REPOSITORY,
      "/outside/secret.owm": "secret\n",
    });
    memory.disk.link("/work/repo/models/link.owm", "/outside/secret.owm");
    memory.disk.write("/work/repo/models/huge.owm", new Uint8Array(2 * 1024 * 1024 + 1));
    wire.taken();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/link.owm" });
    wire.send({ type: "board.text.open", requestId: 2, path: "models/huge.owm" });
    wire.send({ type: "board.text.open", requestId: 3, path: "models/none.owm" });
    await settled();
    expect(byRequest(wire.fromHost)).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "models/link.owm is a link, and a board opens no link",
      },
      {
        type: "board.failed",
        requestId: 2,
        message: "models/huge.owm is larger than 2 MiB, too large for a board",
      },
      { type: "board.failed", requestId: 3, message: "models/none.owm does not exist" },
    ]);
    expect(memory.calls.openTextDocument).toEqual([]);
  });

  test("opens no model and reads no picture behind a linked folder, which may lead out of the repository", async () => {
    const { memory, wire } = await served({
      ...REPOSITORY,
      "/outside/secret.owm": "secret\n",
      "/outside/secret.png": "secret",
    });
    memory.disk.link("/work/repo/linked", "/outside");
    wire.taken();
    wire.send({ type: "board.text.open", requestId: 1, path: "linked/secret.owm" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "linked/secret.png" });
    await settled();
    expect(byRequest(wire.fromHost)).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "linked/secret.owm is behind a link, and a board opens no link",
      },
      {
        type: "board.failed",
        requestId: 2,
        message: "linked/secret.png is behind a link, and a board reads no link",
      },
    ]);
    expect(memory.calls.openTextDocument).toEqual([]);
    expect(memory.calls.readFile).toEqual([]);
    // an edit of that path finds no open text, and nothing outside is written
    wire.send({
      type: "board.text.edit",
      path: "linked/secret.owm",
      text: "written\n",
      version: 1,
    });
    await settled();
    expect(memory.applied).toEqual([]);
    expect(memory.disk.text("/outside/secret.owm")).toBe("secret\n");
  });
});

describe("a file a person renames or moves in VS Code", () => {
  const types = (wire: Wire): string[] => wire.fromHost.map((message) => message.type);

  test("is told as a move, before the old path's text says that its file went; the list follows", async () => {
    const { memory, wire, paths } = await opened();
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    expect(wire.fromHost.slice(0, 2)).toEqual([
      { type: "board.moved", moves: [{ from: PATH, to: "models/green-tea.owm" }] },
      { type: "board.text.gone", path: PATH },
    ]);
    await vi.waitFor(() => expect(paths()).toContain("models/green-tea.owm"));
    expect(paths()).not.toContain(PATH);
    // the page follows: the file opens at its new path
    wire.taken();
    wire.send({ type: "board.text.open", requestId: 2, path: "models/green-tea.owm" });
    await settled();
    expect(wire.fromHost).toMatchObject([{ type: "board.text.opened", text: TEA, version: 1 }]);
  });

  test("is every listed file below a folder, mapped by the folder's old name, in one message", async () => {
    const { memory, wire } = await opened();
    memory.explorer.rename("/work/repo/models", "/work/repo/maps");
    expect(wire.fromHost[0]).toEqual({
      type: "board.moved",
      moves: [
        { from: "models/tea.owm", to: "maps/tea.owm" },
        { from: "models/teams/sample.tt", to: "maps/teams/sample.tt" },
      ],
    });
    expect(types(wire).filter((type) => type === "board.moved")).toHaveLength(1);
  });

  test("is one message for several files moved in one gesture, and a picture's bytes are new at both paths", async () => {
    const { memory, wire } = await served();
    wire.taken();
    memory.explorer.move([
      [FILE, "/work/repo/archive/tea.owm"],
      ["/work/repo/assets/logo.svg", "/work/repo/assets/mark.svg"],
    ]);
    expect(wire.fromHost).toEqual([
      {
        type: "board.moved",
        moves: [
          { from: PATH, to: "archive/tea.owm" },
          { from: "assets/logo.svg", to: "assets/mark.svg" },
        ],
      },
      { type: "board.bytes.changed", paths: ["assets/logo.svg"] },
      { type: "board.bytes.changed", paths: ["assets/mark.svg"] },
      // the watcher's later word of the old name
      { type: "board.bytes.changed", paths: ["assets/logo.svg"] },
    ]);
  });

  test("keeps its unsaved text: VS Code moves the document with the file, and the page reads it at the new path", async () => {
    const { memory, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    wire.taken();
    wire.send({ type: "board.text.open", requestId: 2, path: "models/green-tea.owm" });
    await settled();
    expect(wire.fromHost).toContainEqual(
      expect.objectContaining({ type: "board.text.opened", requestId: 2, text: MINE }),
    );
    expect(memory.disk.text("/work/repo/models/green-tea.owm")).toBe(TEA);
  });

  test("is a file that is gone, and no move, where it leaves the repository or gets a path a board does not reach", async () => {
    const outside = await opened();
    outside.memory.explorer.rename(FILE, "/elsewhere/tea.owm");
    expect(types(outside.wire)).toContain("board.text.gone");
    expect(types(outside.wire)).not.toContain("board.moved");

    const hidden = await opened();
    hidden.memory.explorer.rename(FILE, "/work/repo/.attic/tea.owm");
    expect(types(hidden.wire)).toContain("board.text.gone");
    expect(types(hidden.wire)).not.toContain("board.moved");

    const renamed = await opened();
    renamed.memory.explorer.rename(FILE, "/work/repo/models/tea.txt");
    expect(types(renamed.wire)).toContain("board.text.gone");
    expect(types(renamed.wire)).not.toContain("board.moved");
  });

  test("stays a file that went and one that came where another program moved it", async () => {
    const { memory, wire, paths } = await opened();
    memory.disk.move(FILE, "/work/repo/models/green-tea.owm");
    await vi.waitFor(() => expect(paths()).toContain("models/green-tea.owm"));
    expect(types(wire)).toContain("board.text.gone");
    expect(types(wire)).not.toContain("board.moved");
  });

  test("reaches every open board of the repository, and none whose editor closed", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const indexes = createIndexPool(memory.vscode, SUFFIXES, { restMs: 0 });
    const board = (path: string) => {
      const backend = createVsCodeBackend(memory.vscode, {
        board: MemoryUri.file(path),
        suffixes: SUFFIXES,
        indexes,
      });
      const moves: unknown[] = [];
      backend.onMoved((moved) => moves.push(...moved));
      return { backend, moves };
    };
    const first = board("/work/repo/boards/a.board");
    const second = board("/work/repo/boards/b.board");
    const closed = board("/work/repo/boards/c.board");
    await Promise.all([first.backend.ready(), second.backend.ready(), closed.backend.ready()]);
    closed.backend.dispose();
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    const move = { from: PATH, to: "models/green-tea.owm" };
    expect(first.moves).toEqual([move]);
    expect(second.moves).toEqual([move]);
    expect(closed.moves).toEqual([]);
  });

  test("is told to nobody who stopped listening", async () => {
    const { memory, backend } = await served();
    const moves: unknown[] = [];
    const stop = backend.onMoved((moved) => moves.push(...moved));
    stop();
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    expect(moves).toEqual([]);
  });
});

describe("a file the page asks to have shown", () => {
  const OPEN = "vscode.open";
  const README = "/work/repo/readme.md";

  test("is opened in VS Code's own way, whatever the board's rule says of it, and the page gets nothing of the file", async () => {
    const { memory, wire } = await served();
    wire.taken();
    wire.send({ type: "board.file.show", requestId: 1, path: "readme.md" });
    wire.send({ type: "board.file.show", requestId: 2, path: "boards/a.board" });
    await settled();
    expect(wire.taken()).toEqual([
      { type: "board.done", requestId: 1 },
      { type: "board.done", requestId: 2 },
    ]);
    expect(memory.executed).toEqual([
      [OPEN, MemoryUri.file(README)],
      [OPEN, MemoryUri.file("/work/repo/boards/a.board")],
    ]);
    expect(memory.calls.readFile).toEqual([]);
    expect(memory.calls.openTextDocument).toEqual([]);
  });

  test("is not opened where it is not there, is a folder, is a link or lies behind one: each says why, and VS Code is not asked", async () => {
    const { memory, wire } = await served({ ...REPOSITORY, "/outside/secret.txt": "secret\n" });
    memory.disk.link("/work/repo/link.txt", "/outside/secret.txt");
    memory.disk.link("/work/repo/linked", "/outside");
    wire.taken();
    // one after the other, as a person presses one card at a time: the server lets one wait
    const paths = ["none.txt", "models", "link.txt", "linked/secret.txt", ".git/HEAD"];
    for (const [at, path] of [...paths, "../repo/readme.md"].entries()) {
      wire.send({ type: "board.file.show", requestId: at + 1, path });
      await settled();
    }
    expect(
      byRequest(wire.taken()).map((message) => "message" in message && message.message),
    ).toEqual([
      "none.txt does not exist",
      "models is no file",
      "link.txt is a link, and a board shows no link",
      "linked/secret.txt is behind a link, and a board shows no link",
      "a board reaches no dot file and no file in a dot folder",
      "this path is outside the repository",
    ]);
    expect(memory.executed).toEqual([]);
  });

  test("checks the path itself too: handed one outside the repository or in a dot folder, it asks VS Code nothing", async () => {
    const { memory, backend } = await served();
    const asked = memory.calls.stat.length;
    await expect(backend.showFile("../repo/readme.md")).rejects.toThrow(
      "../repo/readme.md is no file of this repository",
    );
    await expect(backend.showFile(".git/HEAD")).rejects.toThrow(
      ".git/HEAD is no file of this repository",
    );
    expect(memory.calls.stat).toHaveLength(asked);
    expect(memory.executed).toEqual([]);
  });

  test("says so where VS Code could not open it, with what VS Code said", async () => {
    const { memory, backend, wire } = await served();
    memory.failCommand(OPEN, new Error("no editor takes this file"));
    wire.taken();
    wire.send({ type: "board.file.show", requestId: 1, path: "readme.md" });
    await settled();
    // a rejection that is no error is its own text
    memory.failCommand(OPEN, "cancelled");
    wire.send({ type: "board.file.show", requestId: 2, path: "readme.md" });
    await settled();
    expect(wire.taken()).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "VS Code could not open readme.md: no editor takes this file",
      },
      {
        type: "board.failed",
        requestId: 2,
        message: "VS Code could not open readme.md: cancelled",
      },
    ]);
    // and what VS Code rejected with is kept behind the sentence, for whoever logs it
    const refused = new Error("refused by VS Code");
    memory.failCommand(OPEN, refused);
    const failure: unknown = await backend.showFile("readme.md").catch((error: unknown) => error);
    expect((failure as Error).cause).toBe(refused);
  });

  test("waits for the root like every request: asked before the repository is found, the file is shown once it is", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const backend = createVsCodeBackend(memory.vscode, {
      board: MemoryUri.file("/work/repo/boards/a.board"),
      suffixes: SUFFIXES,
    });
    await backend.showFile("readme.md");
    expect(memory.executed).toEqual([[OPEN, MemoryUri.file(README)]]);
  });

  test("is shown one at a time, whoever asks: the next file is looked at when VS Code is done with the one before, also after one that failed", async () => {
    const { memory, backend } = await served();
    const log: string[] = [];
    const { stat } = memory.vscode.workspace.fs;
    memory.vscode.workspace.fs.stat = (uri) => {
      log.push(`look ${uri.path}`);
      return stat(uri);
    };
    const { executeCommand } = memory.vscode.commands;
    memory.vscode.commands.executeCommand = (command, ...rest) => {
      log.push(`${command} ${(rest[0] as MemoryUri).path}`);
      return executeCommand(command, ...rest);
    };
    const outcomes = await Promise.allSettled([
      backend.showFile("readme.md"),
      backend.showFile("none.txt"),
      backend.showFile("models/tea.owm"),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(log).toEqual([
      `look ${README}`,
      `${OPEN} ${README}`,
      "look /work/repo/none.txt",
      "look /work/repo/models",
      `look ${FILE}`,
      `${OPEN} ${FILE}`,
    ]);
  });
});

describe("the documents a board made dirty", () => {
  const names = (backend: VsCodeBackend): string[] =>
    backend.unsaved().map((document) => document.uri.path);

  test("are the ones its page wrote into, for as long as they are unsaved", async () => {
    const { memory, backend, wire } = await opened();
    expect(names(backend)).toEqual([]);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(names(backend)).toEqual([FILE]);
    expect(backend.unsaved()[0]).toBe(memory.document(FILE));
    // A person saves it, in its own tab or with Save All: what the page wrote is in the file.
    // What the person types there afterwards is the person's alone, and not this board's to save.
    memory.save(FILE);
    memory.type(FILE, "title Typed in its own tab\n");
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(names(backend)).toEqual([]);
  });

  test("are not a document the page only opened, nor one somebody else changed, nor one whose edit was dropped", async () => {
    const { memory, backend, wire } = await opened();
    memory.type(FILE, "title Typed beside the board\n");
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(names(backend)).toEqual([]);
  });

  test("are forgotten once a person reverted one: it is clean, and a later change of it is not the board's", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.revert(FILE);
    expect(names(backend)).toEqual([]);
    memory.type(FILE, "title Typed after the revert\n");
    expect(names(backend)).toEqual([]);
  });

  test("are forgotten by the revert itself, whether or not anybody asked in between", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    // nobody asks for the list between the revert and the typing: a board is not saved that often
    memory.revert(FILE);
    memory.type(FILE, "title Typed after the revert\n");
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(names(backend)).toEqual([]);
  });

  test("are forgotten once an undo in the model's own tab took one back to the saved text", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    // the person takes the board's change back by typing the file's text again, then goes on
    memory.type(FILE, TEA);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false });
    memory.type(FILE, "title Typed in its own tab\n");
    expect(names(backend)).toEqual([]);
  });

  test("are the board's again once its page wrote into one that was clean in between", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.revert(FILE);
    await settled();
    // the page was told the reverted text as version 2
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 2 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
    expect(names(backend)).toEqual([FILE]);
  });

  test("follow a file a person renames while it is unsaved, alone or with a folder above it", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    expect(names(backend)).toEqual(["/work/repo/models/green-tea.owm"]);
    memory.explorer.rename("/work/repo/models", "/work/repo/maps");
    expect(names(backend)).toEqual(["/work/repo/maps/green-tea.owm"]);
    // a folder whose name only starts the same way is another folder
    memory.explorer.rename("/work/repo/map", "/work/repo/other");
    expect(names(backend)).toEqual(["/work/repo/maps/green-tea.owm"]);
  });

  test("are not a document that was clean when its file was renamed: nothing unsaved moved with it", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    // saved a moment ago, and renamed within the moment a clean document is remembered
    memory.save(FILE);
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    // VS Code has a clean document at the new name: what is typed there is the person's
    expect(memory.document("/work/repo/models/green-tea.owm")).toMatchObject({ isDirty: false });
    memory.type("/work/repo/models/green-tea.owm", "title Typed after the rename\n");
    expect(names(backend)).toEqual([]);
  });

  test("are not a document that was typed into after a revert and then renamed: the unsaved text that moved is the person's", async () => {
    const { memory, backend, wire } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    memory.revert(FILE);
    memory.type(FILE, "title Typed after the revert\n");
    // within the moment a clean document is remembered for a rename
    memory.explorer.rename(FILE, "/work/repo/models/green-tea.owm");
    expect(memory.document("/work/repo/models/green-tea.owm")).toMatchObject({ isDirty: true });
    expect(names(backend)).toEqual([]);
  });

  test("are each board's own: what another board's page wrote is not among them", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const indexes = createIndexPool(memory.vscode, SUFFIXES, { restMs: 0 });
    const board = (path: string): VsCodeBackend =>
      createVsCodeBackend(memory.vscode, {
        board: MemoryUri.file(path),
        suffixes: SUFFIXES,
        indexes,
      });
    const first = board("/work/repo/boards/a.board");
    const second = board("/work/repo/boards/b.board");
    const text = await first.openText(PATH);
    expect(await text.write(MINE, TEA)).toBe(true);
    expect(names(first)).toEqual([FILE]);
    expect(names(second)).toEqual([]);
  });
});

describe("a text the page closes", () => {
  test("is let go of: the backend listens to its document no longer, and to it again when it is opened anew", async () => {
    const { memory, wire } = await opened();
    // the text's two, and the one of the backend's own record of what its page wrote: a
    // change, which is how VS Code says that a document is clean
    expect(memory.listening().documents).toBe(3);
    wire.send({ type: "board.text.close", path: PATH });
    await settled();
    expect(memory.listening().documents).toBe(1);
    memory.type(FILE, "title Typed while nobody reads\n");
    expect(wire.fromHost).toEqual([]);
    wire.send({ type: "board.text.open", requestId: 2, path: PATH });
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.text.opened",
        requestId: 2,
        path: PATH,
        text: "title Typed while nobody reads\n",
        readOnly: false,
        version: 1,
      },
    ]);
  });
});

describe("a webview that closes in the middle of a write", () => {
  test("leaves the edit that reached the host applied whole: one edit, the whole text, after the panel went", async () => {
    const { memory, wire, server, backend } = await opened();
    const release = memory.holdEdits();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    await settled();
    expect(memory.document(FILE)?.getText()).toBe(TEA);
    // the person closes the tab: the extension disposes the server and the backend at once
    server.dispose();
    backend.dispose();
    // the text of a write that is on its way stays until that write settled
    expect(memory.listening().documents).toBe(2);
    release();
    await settled();
    expect(memory.applied).toHaveLength(1);
    expect(memory.document(FILE)?.getText()).toBe(MINE);
    expect(memory.errors).toEqual([]);
    // and the text was let go of after it, not before: nothing listens to the document now
    expect(memory.listening()).toEqual({ documents: 0, files: 0, folders: 0, watchers: 0 });
  });

  test("also where VS Code first had to open the document again", async () => {
    const { memory, wire, server, backend } = await opened();
    memory.closeDocument(FILE);
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    // the edit is at the host, and the document is still being opened when the panel goes
    await Promise.resolve();
    await Promise.resolve();
    server.dispose();
    backend.dispose();
    expect(memory.applied).toEqual([]);
    await settled();
    expect(memory.applied).toHaveLength(1);
    expect(memory.document(FILE)?.getText()).toBe(MINE);
  });

  test("drops an edit the host had not received whole: nothing of it is written", async () => {
    const { memory, wire, server, backend } = await opened();
    wire.send({ type: "board.text.edit", path: PATH, text: MINE, version: 1 });
    // posted by the page, and the panel is gone before the message is delivered
    server.dispose();
    backend.dispose();
    await settled();
    expect(memory.applied).toEqual([]);
    expect(memory.document(FILE)?.getText()).toBe(TEA);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false });
  });
});

describe("pictures between a page and VS Code", () => {
  test("are read as bytes, and a link is not", async () => {
    const { memory, wire } = await served({ ...REPOSITORY, "/outside/secret.png": "secret" });
    memory.disk.link("/work/repo/assets/link.png", "/outside/secret.png");
    wire.taken();
    wire.send({ type: "board.bytes.read", requestId: 1, path: "assets/logo.svg" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "assets/link.png" });
    wire.send({ type: "board.bytes.read", requestId: 3, path: "assets/none.png" });
    await settled();
    expect(byRequest(wire.fromHost)).toEqual([
      {
        type: "board.bytes",
        requestId: 1,
        path: "assets/logo.svg",
        base64: toBase64(new TextEncoder().encode("<svg/>")),
        mime: "image/svg+xml",
      },
      {
        type: "board.failed",
        requestId: 2,
        message: "assets/link.png is a link, and a board reads no link",
      },
      { type: "board.bytes", requestId: 3, path: "assets/none.png", base64: null, mime: "" },
    ]);
  });

  test("are stored as a new file under assets, which the page is told of at once; a name in use is refused and kept", async () => {
    const { memory, wire, paths } = await served();
    wire.taken();
    const create = { type: "board.file.create", base64: toBase64(PNG), mime: "image/png" } as const;
    wire.send({ ...create, requestId: 1, path: "assets/new.png" });
    await settled();
    expect(wire.fromHost.slice(0, 2)).toEqual([
      { type: "board.bytes.changed", paths: ["assets/new.png"] },
      { type: "board.done", requestId: 1 },
    ]);
    await vi.waitFor(() => expect(paths()).toContain("assets/new.png"));
    expect(memory.calls.writeFile).toEqual(["/work/repo/assets/new.png"]);
    wire.taken();
    wire.send({ ...create, requestId: 2, path: "assets/logo.svg" });
    await settled();
    expect(wire.taken()).toEqual([
      { type: "board.failed", requestId: 2, message: "assets/logo.svg exists already" },
    ]);
    expect(memory.disk.text("/work/repo/assets/logo.svg")).toBe("<svg/>");
    expect(memory.calls.writeFile).toEqual(["/work/repo/assets/new.png"]);
  });

  test("are listed and told when they are stored, without the watcher's word, which may come late or never", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const deaf = { dispose: () => {} };
    memory.vscode.workspace.createFileSystemWatcher = () => ({
      onDidCreate: () => deaf,
      onDidChange: () => deaf,
      onDidDelete: () => deaf,
      dispose: () => {},
    });
    const backend = createVsCodeBackend(memory.vscode, {
      board: MemoryUri.file("/work/repo/boards/a.board"),
      suffixes: SUFFIXES,
    });
    await backend.ready();
    const changed: string[] = [];
    backend.onBytesChanged((paths) => changed.push(...paths));
    await backend.createFile("assets/new.png", PNG, "image/png");
    expect(changed).toEqual(["assets/new.png"]);
    expect(backend.list()).toContain("assets/new.png");
  });

  test("are told when another program changes one", async () => {
    const { memory, wire } = await served();
    wire.taken();
    memory.disk.write("/work/repo/assets/logo.svg", "<svg></svg>");
    memory.disk.write("/work/repo/readme.md", "# Changed\n");
    expect(wire.fromHost).toEqual([{ type: "board.bytes.changed", paths: ["assets/logo.svg"] }]);
  });
});

describe("a backend that is disposed", () => {
  test("hears nothing more: no list, no bytes, no search, and the watchers of its own index are gone", async () => {
    const memory = createMemoryVsCode(REPOSITORY, { workspaceFolders: ["/work/repo"] });
    const backend = createVsCodeBackend(memory.vscode, {
      board: MemoryUri.file("/work/repo/boards/a.board"),
      suffixes: SUFFIXES,
    });
    await backend.ready();
    let told = 0;
    backend.onListChanged(() => (told += 1));
    backend.onBytesChanged(() => (told += 1));
    expect(memory.listening()).toEqual({ documents: 1, files: 4, folders: 2, watchers: 1 });
    backend.dispose();
    backend.dispose();
    expect(memory.listening()).toEqual({ documents: 0, files: 0, folders: 0, watchers: 0 });
    const searches = memory.calls.findFiles.length;
    memory.disk.write("/work/repo/models/later.owm", TEA);
    memory.disk.write("/work/repo/assets/logo.svg", "<svg></svg>");
    memory.setWorkspaceFolders([]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(told).toBe(0);
    expect(backend.list()).toEqual([]);
    expect(memory.calls.findFiles).toHaveLength(searches);
  });
});
