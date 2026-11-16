import { connectBackend, PICTURE_SUFFIXES, type BoardFiles } from "@miragon/board-files";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BOARD_FILES_RULE, MODEL_SUFFIXES } from "../src/boardEditorOptions.js";
import { createVsCodeBackend } from "../src/files/backend.js";
import { createIndexPool } from "../src/files/file-index.js";
import { createMemoryVsCode, type MemoryVsCode, MemoryUri } from "../src/files/memory-vscode.js";

/**
 * The page's own port (`BoardFiles`) over the VS Code backend, client and server on a message
 * channel as in a webview: what a node's text session sees of a file that VS Code keeps.
 */

const SUFFIXES = { models: MODEL_SUFFIXES, pictures: PICTURE_SUFFIXES };
const PATH = "models/tea.owm";
const FILE = "/work/repo/models/tea.owm";
const TEA = "title Tea\ncomponent Cup [0.8, 0.6]\n";
const MINE = "title Tea\ncomponent Mug [0.8, 0.6]\n";

let open: BoardFiles | undefined;
afterEach(() => {
  open?.dispose();
  open = undefined;
});

async function page(): Promise<{ memory: MemoryVsCode; files: BoardFiles }> {
  const memory = createMemoryVsCode(
    {
      "/work/repo/.git/HEAD": "",
      "/work/repo/boards/a.board": "",
      [FILE]: TEA,
      "/work/repo/assets/logo.svg": "<svg/>",
    },
    { workspaceFolders: ["/work/repo"] },
  );
  const backend = createVsCodeBackend(memory.vscode, {
    board: MemoryUri.file("/work/repo/boards/a.board"),
    suffixes: SUFFIXES,
    indexes: createIndexPool(memory.vscode, SUFFIXES, { restMs: 0 }),
  });
  const files = connectBackend(backend, BOARD_FILES_RULE);
  open = files;
  await vi.waitFor(() => expect(files.paths()).toEqual(["assets/logo.svg", PATH]));
  return { memory, files };
}

describe("a page's files over the VS Code backend", () => {
  test("a session writes into the file's document and never hears its own write", async () => {
    const { memory, files } = await page();
    const session = await files.openText(PATH);
    const replaced: string[] = [];
    session.onReplace((text) => replaced.push(text));
    expect(session.text()).toBe(TEA);
    session.write(MINE);
    await files.settled();
    expect(memory.document(FILE)?.getText()).toBe(MINE);
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    expect(memory.applied).toHaveLength(1);
    expect(replaced).toEqual([]);
    // and the write after it is taken too: the echo of the first moved no version
    session.write(TEA);
    await files.settled();
    expect(memory.document(FILE)?.getText()).toBe(TEA);
    expect(replaced).toEqual([]);
  });

  test("a session hears what a person types beside the board", async () => {
    const { memory, files } = await page();
    const session = await files.openText(PATH);
    const replaced: string[] = [];
    session.onReplace((text) => replaced.push(text));
    memory.type(FILE, "title Typed\n");
    await vi.waitFor(() => expect(replaced).toEqual(["title Typed\n"]));
    expect(session.text()).toBe("title Typed\n");
  });

  test("an edit and a change from outside that cross leave page and document on one text: the outside's", async () => {
    const { memory, files } = await page();
    const session = await files.openText(PATH);
    // the page writes, and before its message is at the host a person types in the file
    session.write(MINE);
    memory.type(FILE, "title Typed at the same moment\n");
    await files.settled();
    await vi.waitFor(() => expect(session.text()).toBe("title Typed at the same moment\n"));
    expect(memory.document(FILE)?.getText()).toBe("title Typed at the same moment\n");
    expect(memory.applied).toEqual([]);
  });

  test("a session is told when its file goes and when it is back", async () => {
    const { memory, files } = await page();
    const session = await files.openText(PATH);
    const available: boolean[] = [];
    const replaced: string[] = [];
    session.onAvailable((there) => available.push(there));
    session.onReplace((text) => replaced.push(text));
    memory.disk.remove(FILE);
    await vi.waitFor(() => expect(available).toEqual([false]));
    await vi.waitFor(() => expect(files.paths()).not.toContain(PATH));
    memory.disk.write(FILE, "title Back\n");
    await vi.waitFor(() => expect(available).toEqual([false, true]));
    expect(replaced).toEqual(["title Back\n"]);
    await vi.waitFor(() => expect(files.paths()).toContain(PATH));
  });

  test("a picture is read as a Blob and a new one is a file under assets", async () => {
    const { memory, files } = await page();
    const logo = await files.readBytes("assets/logo.svg");
    expect(logo?.type).toBe("image/svg+xml");
    expect(await logo?.text()).toBe("<svg/>");
    await files.createFile?.("assets/new.png", new Blob([new Uint8Array([1, 2, 3])]));
    expect(memory.disk.has("/work/repo/assets/new.png")).toBe(true);
    await vi.waitFor(() => expect(files.paths()).toContain("assets/new.png"));
    await expect(
      files.createFile?.("assets/logo.svg", new Blob([new Uint8Array([1])])),
    ).rejects.toThrow("assets/logo.svg exists already");
    await expect(files.openText("assets/logo.svg")).rejects.toThrow(
      "assets/logo.svg is no model a board shows here",
    );
  });
});
