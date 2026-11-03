import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { FileType, RelativePattern, Uri, vscodeMock, workspace } from "./__mocks__/vscode";
import { WorkspaceMaps } from "../src/workspaceMaps.js";

let maps: WorkspaceMaps;
let changes: number;

function startIndex(): WorkspaceMaps {
  maps = new WorkspaceMaps();
  changes = 0;
  maps.onDidChange(() => changes++);
  return maps;
}

/** Lets the scan's search answer and the burst of events settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(150);
}

function knows(path: string): boolean {
  return maps.includes(Uri.file(path) as unknown as vscode.Uri);
}

beforeEach(() => {
  vscodeMock.reset();
  vi.useFakeTimers();
  workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }, { uri: Uri.file("/second") }];
  vscodeMock.setFileTypes({
    "/workspace/overview.wmap": FileType.File,
    "/workspace/details/payment.wmap": FileType.File,
    "/workspace/details/legacy.owm": FileType.File,
    "/workspace/details/notes.txt": FileType.File,
    "/workspace/details": FileType.Directory,
    "/second/shared.wmap": FileType.File,
    "/outside/elsewhere.wmap": FileType.File,
  });
});

afterEach(() => {
  maps.dispose();
  vi.useRealTimers();
});

describe("the map files of the workspace", () => {
  it("knows none until its first search has answered, then tells its listeners once", async () => {
    startIndex();

    expect(maps.ready).toBe(false);
    expect(knows("/workspace/overview.wmap")).toBe(false);

    await settle();

    expect(maps.ready).toBe(true);
    expect(changes).toBe(1);
  });

  it("holds the maps of every workspace folder, and only maps", async () => {
    startIndex();
    await settle();

    expect(knows("/workspace/overview.wmap")).toBe(true);
    expect(knows("/workspace/details/legacy.owm")).toBe(true);
    expect(knows("/second/shared.wmap")).toBe(true);
    expect(knows("/workspace/details/notes.txt")).toBe(false);
    expect(knows("/outside/elsewhere.wmap")).toBe(false);
  });

  it("follows the watcher when a map appears or goes away, once per burst", async () => {
    startIndex();
    await settle();

    vscodeMock.fireFileWatcher("create", "/workspace/details/new.wmap");
    vscodeMock.fireFileWatcher("delete", "/workspace/overview.wmap");
    vscodeMock.fireFileWatcher("create", "/workspace/details/readme.md");
    await settle();

    expect(knows("/workspace/details/new.wmap")).toBe(true);
    expect(knows("/workspace/overview.wmap")).toBe(false);
    expect(changes).toBe(2);
  });

  it("tells nobody about a watcher event that changes nothing", async () => {
    startIndex();
    await settle();

    vscodeMock.fireFileWatcher("create", "/workspace/overview.wmap");
    vscodeMock.fireFileWatcher("delete", "/workspace/missing.wmap");
    await settle();

    expect(changes).toBe(1);
  });

  it("moves the maps of a folder VS Code renamed, of which the watcher says nothing", async () => {
    startIndex();
    await settle();

    vscodeMock.fireFileWatcher("delete", "/workspace/details");
    vscodeMock.fireFileWatcher("create", "/workspace/archive");
    vscodeMock.fireDidRenameFiles([["/workspace/details", "/workspace/archive"]]);
    await settle();

    expect(knows("/workspace/details/payment.wmap")).toBe(false);
    expect(knows("/workspace/archive/payment.wmap")).toBe(true);
    expect(knows("/workspace/archive/legacy.owm")).toBe(true);
    expect(knows("/workspace/overview.wmap")).toBe(true);
  });

  it("drops the maps of a folder VS Code deleted, and only those", async () => {
    vscodeMock.setFileTypes({
      ...Object.fromEntries(vscodeMock.fileTypes()),
      "/workspace/details-old/kept.wmap": FileType.File,
    });
    startIndex();
    await settle();

    vscodeMock.fireDidDeleteFiles(["/workspace/details"]);
    await settle();

    expect(knows("/workspace/details/payment.wmap")).toBe(false);
    expect(knows("/workspace/details-old/kept.wmap")).toBe(true);
  });

  it("searches a folder VS Code created, a pasted one with maps, say", async () => {
    startIndex();
    await settle();
    vscodeMock.setFileTypes({
      ...Object.fromEntries(vscodeMock.fileTypes()),
      "/workspace/copy": FileType.Directory,
      "/workspace/copy/payment.wmap": FileType.File,
      "/workspace/copy/deeper/legacy.owm": FileType.File,
      "/workspace/notes.md": FileType.File,
    });

    vscodeMock.fireDidCreateFiles(["/workspace/copy", "/workspace/notes.md"]);
    await settle();

    expect(knows("/workspace/copy/payment.wmap")).toBe(true);
    expect(knows("/workspace/copy/deeper/legacy.owm")).toBe(true);
    const searched = vscodeMock.findFilesCalls().filter((call) => call instanceof RelativePattern);
    expect(searched.map((pattern) => (pattern as RelativePattern).baseUri.path)).toEqual([
      "/workspace/copy",
    ]);
  });

  it("searches the workspace again when its folders change", async () => {
    startIndex();
    await settle();

    workspace.workspaceFolders = [{ uri: Uri.file("/outside") }];
    vscodeMock.fireDidChangeWorkspaceFolders();
    await settle();

    expect(knows("/outside/elsewhere.wmap")).toBe(true);
    expect(knows("/workspace/overview.wmap")).toBe(false);
  });

  it("keeps what changed while it searched", async () => {
    let answer: (files: Uri[]) => void = () => undefined;
    const findFiles = vi
      .spyOn(workspace, "findFiles")
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    startIndex();

    vscodeMock.fireFileWatcher("create", "/workspace/early.wmap");
    vscodeMock.fireDidRenameFiles([["/workspace/details", "/workspace/archive"]]);
    answer([Uri.file("/workspace/overview.wmap"), Uri.file("/workspace/details/payment.wmap")]);
    await settle();

    expect(knows("/workspace/early.wmap")).toBe(true);
    expect(knows("/workspace/archive/payment.wmap")).toBe(true);
    expect(knows("/workspace/details/payment.wmap")).toBe(false);
    findFiles.mockRestore();
  });

  it("stays unready when its search fails, rather than knowing no map", async () => {
    const findFiles = vi
      .spyOn(workspace, "findFiles")
      .mockRejectedValueOnce(new Error("search failed"));
    startIndex();
    await settle();

    expect(maps.ready).toBe(false);
    expect(changes).toBe(0);
    findFiles.mockRestore();
  });

  it("stops listening once disposed", async () => {
    startIndex();
    await settle();
    maps.dispose();

    vscodeMock.fireFileWatcher("create", "/workspace/late.wmap");
    vscodeMock.fireDidRenameFiles([["/workspace/details", "/workspace/archive"]]);
    await settle();

    expect(knows("/workspace/late.wmap")).toBe(false);
    expect(knows("/workspace/details/payment.wmap")).toBe(true);
  });
});
