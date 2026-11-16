import { describe, expect, test } from "vitest";

import { createMemoryVsCode, MemoryUri } from "../src/files/memory-vscode.js";
import { behindLink, fileAt, findRoot, foldersAbove, pathBelow } from "../src/files/root.js";

const file = (path: string): MemoryUri => MemoryUri.file(path);

describe("the repository root of a board file", () => {
  test("is the nearest folder above it with a .git, which is a folder in a clone and a file in a worktree", async () => {
    const memory = createMemoryVsCode(
      {
        "/work/repo/.git/HEAD": "ref: refs/heads/main\n",
        "/work/repo/part/.git": "gitdir: ../.git/worktrees/part\n",
        "/work/repo/part/boards/deep/a.board": "",
        "/work/repo/boards/b.board": "",
      },
      { workspaceFolders: ["/work"] },
    );
    const nearest = await findRoot(memory.vscode, file("/work/repo/part/boards/deep/a.board"));
    expect(nearest?.toString()).toBe("file:///work/repo/part");
    const clone = await findRoot(memory.vscode, file("/work/repo/boards/b.board"));
    expect(clone?.toString()).toBe("file:///work/repo");
  });

  test("is the repository also where VS Code has only a folder inside it open", async () => {
    const memory = createMemoryVsCode(
      { "/work/repo/.git/HEAD": "", "/work/repo/docs/boards/a.board": "" },
      { workspaceFolders: ["/work/repo/docs"] },
    );
    const root = await findRoot(memory.vscode, file("/work/repo/docs/boards/a.board"));
    expect(root?.path).toBe("/work/repo");
  });

  test("asks for .git alone, the nearest folder first, and no further than the first it finds", async () => {
    const memory = createMemoryVsCode({ "/work/repo/.git/HEAD": "", "/work/.git/HEAD": "" });
    await findRoot(memory.vscode, file("/work/repo/boards/deep/a.board"));
    expect(memory.calls.stat).toEqual([
      "/work/repo/boards/deep/.git",
      "/work/repo/boards/.git",
      "/work/repo/.git",
    ]);
    expect(memory.calls.readFile).toEqual([]);
    expect(memory.calls.findFiles).toEqual([]);
  });

  test("is the workspace folder the board is in where no folder above it has a .git: the innermost, without a slash at its end", async () => {
    const memory = createMemoryVsCode(
      { "/work/inner/boards/a.board": "" },
      { workspaceFolders: ["/work", "/work/inner"] },
    );
    expect((await findRoot(memory.vscode, file("/work/inner/boards/a.board")))?.path).toBe(
      "/work/inner",
    );
    const slashed = {
      Uri: memory.vscode.Uri,
      workspace: {
        fs: memory.vscode.workspace.fs,
        getWorkspaceFolder: () => ({ uri: file("/work/inner/") }),
      },
    };
    expect((await findRoot(slashed, file("/work/inner/boards/a.board")))?.path).toBe("/work/inner");
  });

  test("is none for a single file outside every repository and every open folder", async () => {
    const memory = createMemoryVsCode(
      { "/home/me/Downloads/a.board": "" },
      { workspaceFolders: ["/work"] },
    );
    expect(await findRoot(memory.vscode, file("/home/me/Downloads/a.board"))).toBeUndefined();
  });

  test("is none for a board that is no file yet, and nothing is asked for it", async () => {
    const memory = createMemoryVsCode({}, { workspaceFolders: ["/work"] });
    expect(await findRoot(memory.vscode, MemoryUri.parse("untitled:Untitled-1"))).toBeUndefined();
    expect(memory.calls.stat).toEqual([]);
  });

  test("keeps the scheme and the authority of the board, as on a remote machine", async () => {
    const stats: string[] = [];
    const remote = {
      Uri: MemoryUri,
      workspace: {
        getWorkspaceFolder: () => undefined,
        fs: {
          stat(uri: MemoryUri) {
            stats.push(uri.toString());
            return uri.path === "/srv/repo/.git"
              ? Promise.resolve({ type: 2, size: 0 })
              : Promise.reject(new Error("EntryNotFound"));
          },
        },
      },
    };
    const board = MemoryUri.parse("vscode-remote://ssh+box/srv/repo/boards/a.board");
    const root = await findRoot(remote, board);
    expect(root?.toString()).toBe("vscode-remote://ssh+box/srv/repo");
    expect(stats).toEqual([
      "vscode-remote://ssh+box/srv/repo/boards/.git",
      "vscode-remote://ssh+box/srv/repo/.git",
    ]);
  });
});

describe("a board that is shown from somewhere else than its file", () => {
  test("is asked for its folders without its query: Git's view of an old revision finds no repository in itself", async () => {
    const stats: string[] = [];
    const history = {
      Uri: MemoryUri,
      workspace: {
        getWorkspaceFolder: () => undefined,
        fs: {
          // Git's file system answers by the query alone: with it, every path is the board
          stat(uri: MemoryUri) {
            stats.push(uri.toString());
            return uri.query === ""
              ? Promise.reject(new Error("EntryNotFound"))
              : Promise.resolve({ type: 1, size: 10 });
          },
        },
      },
    };
    const board = MemoryUri.parse(
      'git:/work/repo/boards/a.board?{"path":"/work/repo/boards/a.board","ref":"HEAD"}',
    );
    expect(await findRoot(history, board)).toBeUndefined();
    expect(stats).toEqual([
      "git:///work/repo/boards/.git",
      "git:///work/repo/.git",
      "git:///work/.git",
      "git:///.git",
    ]);
  });
});

describe("the folders above a file", () => {
  test.each([
    ["/work/repo/a.board", ["/work/repo", "/work", "/"]],
    ["/a.board", ["/"]],
    ["/c:/Users/me/a.board", ["/c:/Users/me", "/c:/Users", "/c:", "/"]],
    ["Untitled-1", []],
    ["", []],
  ])("of %s", (path, folders) => {
    expect(foldersAbove(path)).toEqual(folders);
  });
});

describe("a file's path from the root", () => {
  const root = file("/work/repo");
  test.each([
    ["file:///work/repo/models/tea.owm", "models/tea.owm"],
    ["file:///work/repo/tea.owm", "tea.owm"],
    ["file:///work/repo/models/a b/ü.owm", "models/a b/ü.owm"],
    // the root itself is no file of it, and a folder that only starts with its name is beside it
    ["file:///work/repo", undefined],
    ["file:///work/repo/", undefined],
    ["file:///work/repository/tea.owm", undefined],
    ["file:///work/tea.owm", undefined],
    // compared as text: another case is another folder here, whatever the disk folds
    ["file:///work/Repo/models/tea.owm", undefined],
    ["vscode-remote:///work/repo/models/tea.owm", undefined],
    ["file://other-host/work/repo/models/tea.owm", undefined],
  ])("%s is %s", (uri, path) => {
    expect(pathBelow(root, MemoryUri.parse(uri))).toBe(path);
  });

  test("of a root that is the top folder", () => {
    expect(pathBelow(file("/"), file("/models/tea.owm"))).toBe("models/tea.owm");
  });

  test("and back: the file a path names below the root", () => {
    const memory = createMemoryVsCode();
    expect(fileAt(memory.vscode, root, "models/deep/tea.owm").toString()).toBe(
      "file:///work/repo/models/deep/tea.owm",
    );
  });
});

describe("a file behind a linked folder", () => {
  const linked = () => {
    const memory = createMemoryVsCode({
      "/repo/models/tea.owm": "",
      "/repo/a/b/c.owm": "",
      "/outside/secret.owm": "",
      "/outside/deep/secret.owm": "",
    });
    memory.disk.link("/repo/linked", "/outside");
    memory.disk.link("/repo/models/link.owm", "/outside/secret.owm");
    return memory;
  };
  const behind = (memory: ReturnType<typeof linked>, path: string): Promise<boolean> =>
    behindLink(memory.vscode, fileAt(memory.vscode, file("/repo"), path), path);

  test("is told by asking every folder between the root and the file, the outermost first, and never the file", async () => {
    const memory = linked();
    expect(await behind(memory, "a/b/c.owm")).toBe(false);
    expect(memory.calls.stat).toEqual(["/repo/a", "/repo/a/b"]);
  });

  test("is one below the link at any depth, and the asking stops at the link", async () => {
    const memory = linked();
    expect(await behind(memory, "linked/secret.owm")).toBe(true);
    expect(await behind(memory, "linked/deep/secret.owm")).toBe(true);
    expect(memory.calls.stat).toEqual(["/repo/linked", "/repo/linked"]);
  });

  test("is not a file at the root, nor a link to a file, which is the file's own check: nothing is asked", async () => {
    const memory = linked();
    expect(await behind(memory, "tea.owm")).toBe(false);
    expect(await behind(memory, "models/link.owm")).toBe(false);
    expect(memory.calls.stat).toEqual(["/repo/models"]);
  });

  test("is not one whose folder is not there", async () => {
    expect(await behind(linked(), "none/deep/tea.owm")).toBe(false);
  });

  test("is asked with the scheme and the authority of the file, as on a remote machine", async () => {
    const stats: string[] = [];
    const remote = {
      workspace: {
        fs: {
          stat(uri: MemoryUri) {
            stats.push(uri.toString());
            return Promise.resolve({ type: uri.path === "/srv/repo/linked" ? 66 : 2, size: 0 });
          },
        },
      },
    };
    const at = (path: string): MemoryUri =>
      MemoryUri.parse(`vscode-remote://ssh+box/srv/repo/${path}`);
    expect(await behindLink(remote, at("models/tea.owm"), "models/tea.owm")).toBe(false);
    expect(await behindLink(remote, at("linked/tea.owm"), "linked/tea.owm")).toBe(true);
    expect(stats).toEqual([
      "vscode-remote://ssh+box/srv/repo/models",
      "vscode-remote://ssh+box/srv/repo/linked",
    ]);
  });

  test("is taken for one where the file's URI does not name the folders its path has: nothing can be asked", async () => {
    const memory = linked();
    expect(
      await behindLink(memory.vscode, MemoryUri.parse("untitled:models/tea.owm"), "models/tea.owm"),
    ).toBe(true);
    expect(memory.calls.stat).toEqual([]);
  });
});
