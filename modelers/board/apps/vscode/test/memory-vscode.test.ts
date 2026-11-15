import { describe, expect, test } from "vitest";

import {
  createMemoryVsCode,
  globToRegExp,
  MemoryUri,
  type MemoryVsCode,
} from "../src/files/memory-vscode.js";
import { DIRECTORY, FILE, READONLY, SYMBOLIC_LINK } from "../src/files/vscode-like.js";

/**
 * The fake VS Code the files backend is tested against, held to what it claims about the real
 * one. Each test is one behaviour the backend depends on, read from VS Code's typings and source
 * and seen in no run: the board's guide lists them as what a real VS Code has to confirm.
 */

const TEA = "title Tea\ncomponent Cup [0.8, 0.6]\n";
const file = (path: string): MemoryUri => MemoryUri.file(path);

function workspace(files: Record<string, string> = { "/repo/models/tea.owm": TEA }): MemoryVsCode {
  return createMemoryVsCode(files, { workspaceFolders: ["/repo"] });
}

/** one edit that replaces the first line of a document */
function firstLine(memory: MemoryVsCode, path: string, text: string): Promise<boolean> {
  const { vscode } = memory;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(file(path), new vscode.Range(0, 0, 1, 0), text);
  return Promise.resolve(vscode.workspace.applyEdit(edit));
}

describe("a text document of the fake", () => {
  test("is the file's text at version 1, and the same object while it stays open", async () => {
    const memory = workspace();
    const first = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    const second = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    expect(first.getText()).toBe(TEA);
    expect(second).toBe(first);
    expect(memory.document("/repo/models/tea.owm")).toMatchObject({
      version: 1,
      isDirty: false,
      isClosed: false,
      lineCount: 3,
    });
    expect(first.lineAt(1).text).toBe("component Cup [0.8, 0.6]");
  });

  test("is not there for a file that is not there", async () => {
    const memory = workspace();
    await expect(
      memory.vscode.workspace.openTextDocument(file("/repo/models/none.owm")),
    ).rejects.toThrow("cannot open file:///repo/models/none.owm");
  });

  test("is let go of while clean: the close event names it, it is dead, and the next open makes another at version 1", async () => {
    const memory = workspace();
    const closed: unknown[] = [];
    memory.vscode.workspace.onDidCloseTextDocument((document) => closed.push(document));
    const first = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.type("/repo/models/tea.owm", "title Typed\n");
    memory.save("/repo/models/tea.owm");
    expect(memory.document("/repo/models/tea.owm")?.version).toBe(2);
    memory.closeDocument("/repo/models/tea.owm");
    expect(closed).toEqual([first]);
    expect((first as { isClosed?: boolean }).isClosed).toBe(true);
    expect(memory.document("/repo/models/tea.owm")).toBeUndefined();
    const again = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    expect(again).not.toBe(first);
    expect(again.getText()).toBe("title Typed\n");
    expect(memory.document("/repo/models/tea.owm")?.version).toBe(1);
  });

  test("is never let go of while it is dirty", async () => {
    const memory = workspace();
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.type("/repo/models/tea.owm", "title Typed\n");
    expect(() => memory.closeDocument("/repo/models/tea.owm")).toThrow("dirty");
  });
});

describe("an edit in the fake", () => {
  test("replaces its range, leaves the document dirty and the disk alone, and fires the change event before it resolves", async () => {
    const memory = workspace();
    const order: string[] = [];
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.vscode.workspace.onDidChangeTextDocument((event) => {
      order.push(`event ${event.contentChanges.length} ${event.document.getText().split("\n")[0]}`);
    });
    const applied = firstLine(memory, "/repo/models/tea.owm", "title Mine\n").then((result) => {
      order.push(`resolved ${result}`);
    });
    // nothing in the task that asked: VS Code applies an edit in another thread
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe(TEA);
    await applied;
    expect(order).toEqual(["event 1 title Mine", "resolved true"]);
    expect(memory.document("/repo/models/tea.owm")).toMatchObject({ version: 2, isDirty: true });
    expect(memory.disk.text("/repo/models/tea.owm")).toBe(TEA);
    expect(memory.applied).toHaveLength(1);
  });

  test("is refused whole when the document moved on between the ask and the apply", async () => {
    const memory = workspace();
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    const release = memory.holdEdits();
    const applied = firstLine(memory, "/repo/models/tea.owm", "title Mine\n");
    memory.type("/repo/models/tea.owm", "title Typed meanwhile\n");
    release();
    expect(await applied).toBe(false);
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe("title Typed meanwhile\n");
    expect(memory.applied).toHaveLength(0);
  });

  test("of a file VS Code has no document of opens one and is checked against nothing", async () => {
    const memory = workspace();
    const release = memory.holdEdits();
    const applied = firstLine(memory, "/repo/models/tea.owm", "title Blind\n");
    // another program writes the file while the edit waits: no version says so
    memory.disk.write("/repo/models/tea.owm", "title Changed on the disk\nmore\n");
    release();
    expect(await applied).toBe(true);
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe("title Blind\nmore\n");
  });

  test("writes an inserted line break as the document's own", async () => {
    const memory = workspace({ "/repo/models/tea.owm": "title Tea\r\nnote\r\n" });
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    await firstLine(memory, "/repo/models/tea.owm", "title Mine\nextra\n");
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe(
      "title Mine\r\nextra\r\nnote\r\n",
    );
  });

  test("is refused for a file that is read-only", async () => {
    const memory = workspace();
    memory.disk.readOnly("/repo/models/tea.owm");
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    expect(await firstLine(memory, "/repo/models/tea.owm", "title Mine\n")).toBe(false);
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe(TEA);
  });
});

describe("what else changes a document of the fake", () => {
  test("typing, an undo and a revert are each one more version and one event with a content change", async () => {
    const memory = workspace();
    const events: number[] = [];
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.vscode.workspace.onDidChangeTextDocument((event) => {
      events.push(event.contentChanges.length);
    });
    const versions: Array<number | undefined> = [];
    const version = (): void =>
      void versions.push(memory.document("/repo/models/tea.owm")?.version);
    memory.type("/repo/models/tea.owm", "title One\n");
    version();
    memory.type("/repo/models/tea.owm", "title Two\n");
    version();
    expect(memory.undo("/repo/models/tea.owm")).toBe(true);
    version();
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe("title One\n");
    memory.revert("/repo/models/tea.owm");
    version();
    expect(memory.document("/repo/models/tea.owm")).toMatchObject({ isDirty: false });
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe(TEA);
    expect(versions).toEqual([2, 3, 4, 5]);
    expect(events).toEqual([1, 1, 1, 1]);
  });

  test("a save changes no text: its event has no content change, the version stays, and the watcher hears the file", async () => {
    const memory = workspace();
    const { vscode } = memory;
    const events: number[] = [];
    const watched: string[] = [];
    await vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.type("/repo/models/tea.owm", "title Typed\n");
    vscode.workspace.onDidChangeTextDocument((event) => events.push(event.contentChanges.length));
    vscode.workspace
      .createFileSystemWatcher(new vscode.RelativePattern(file("/repo"), "**/*.owm"))
      .onDidChange((uri) => watched.push(uri.path));
    memory.save("/repo/models/tea.owm");
    expect(events).toEqual([0]);
    expect(watched).toEqual(["/repo/models/tea.owm"]);
    expect(memory.document("/repo/models/tea.owm")).toMatchObject({ version: 2, isDirty: false });
    expect(memory.disk.text("/repo/models/tea.owm")).toBe("title Typed\n");
  });

  test("a clean document reads its file again when another program writes it, a dirty one keeps its text", async () => {
    const memory = workspace({ "/repo/a.owm": "title A\n", "/repo/b.owm": "title B\n" });
    const events: string[] = [];
    await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    await memory.vscode.workspace.openTextDocument(file("/repo/b.owm"));
    memory.type("/repo/b.owm", "title B typed\n");
    memory.vscode.workspace.onDidChangeTextDocument((event) => {
      events.push(`${event.document.uri.path} ${event.contentChanges.length}`);
    });
    memory.disk.write("/repo/a.owm", "title A from Git\n");
    memory.disk.write("/repo/b.owm", "title B from Git\n");
    expect(events).toEqual(["/repo/a.owm 1"]);
    expect(memory.document("/repo/a.owm")).toMatchObject({ version: 2, isDirty: false });
    expect(memory.document("/repo/a.owm")?.getText()).toBe("title A from Git\n");
    expect(memory.document("/repo/b.owm")?.getText()).toBe("title B typed\n");
  });

  test("the document of a file another program removes stays open, clean or dirty, and a clean one reads the file again when it is back", async () => {
    const memory = workspace({ "/repo/a.owm": "title A\n", "/repo/b.owm": "title B\n" });
    const closed: string[] = [];
    memory.vscode.workspace.onDidCloseTextDocument((document) => {
      closed.push(String(document.uri.path));
    });
    const clean = await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    await memory.vscode.workspace.openTextDocument(file("/repo/b.owm"));
    memory.type("/repo/b.owm", "title B typed\n");
    memory.disk.remove("/repo/a.owm");
    memory.disk.remove("/repo/b.owm");
    expect(closed).toEqual([]);
    expect(memory.document("/repo/a.owm")).toBe(clean);
    expect(memory.document("/repo/a.owm")).toMatchObject({ isClosed: false, isDirty: false });
    expect(clean.getText()).toBe("title A\n");
    expect(memory.document("/repo/b.owm")?.getText()).toBe("title B typed\n");
    // back with another text: the same document has it
    memory.disk.write("/repo/a.owm", "title A again\n");
    expect(clean.getText()).toBe("title A again\n");
    expect(await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"))).toBe(clean);
  });

  test("the document of a file another program moves away stays open; of one a person renames in the Explorer, the clean one is let go of", async () => {
    const memory = workspace({ "/repo/a.owm": "title A\n", "/repo/b.owm": "title B\n" });
    const closed: string[] = [];
    memory.vscode.workspace.onDidCloseTextDocument((document) => {
      closed.push(String(document.uri.path));
    });
    await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    await memory.vscode.workspace.openTextDocument(file("/repo/b.owm"));
    memory.disk.move("/repo/a.owm", "/repo/a-moved.owm");
    expect(closed).toEqual([]);
    expect(memory.document("/repo/a.owm")).toMatchObject({ isClosed: false });
    memory.explorer.rename("/repo/b.owm", "/repo/b-renamed.owm");
    expect(closed).toEqual(["/repo/b.owm"]);
    expect(memory.document("/repo/b.owm")).toBeUndefined();
  });
});

describe("the disk of the fake as workspace.fs tells it", () => {
  test("stat names a file, a folder and a link to either, the size and a read-only file, and rejects for nothing", async () => {
    const memory = workspace({ "/repo/models/tea.owm": TEA, "/outside/secret.owm": "secret\n" });
    const { fs } = memory.vscode.workspace;
    memory.disk.link("/repo/models/link.owm", "/outside/secret.owm");
    memory.disk.link("/repo/linked", "/outside");
    memory.disk.readOnly("/outside/secret.owm");
    expect(await fs.stat(file("/repo/models/tea.owm"))).toEqual({ type: FILE, size: TEA.length });
    expect(await fs.stat(file("/repo/models"))).toEqual({ type: DIRECTORY, size: 0 });
    expect(await fs.stat(file("/repo/models/link.owm"))).toEqual({
      type: FILE | SYMBOLIC_LINK,
      size: 7,
      permissions: READONLY,
    });
    expect(await fs.stat(file("/repo/linked"))).toEqual({
      type: DIRECTORY | SYMBOLIC_LINK,
      size: 0,
    });
    await expect(fs.stat(file("/repo/models/none.owm"))).rejects.toThrow("EntryNotFound");
  });

  test("a file reached through a linked folder is a plain file to stat: the link on the way leaves no trace", async () => {
    const memory = workspace({ "/outside/secret.owm": "secret\n" });
    memory.disk.link("/repo/linked", "/outside");
    const stat = await memory.vscode.workspace.fs.stat(file("/repo/linked/secret.owm"));
    expect(stat.type).toBe(FILE);
    expect(
      new TextDecoder().decode(
        await memory.vscode.workspace.fs.readFile(file("/repo/linked/secret.owm")),
      ),
    ).toBe("secret\n");
  });

  test("createDirectory makes the folders above and takes one that is there; writeFile makes a file and replaces one", async () => {
    const memory = workspace();
    const { fs } = memory.vscode.workspace;
    await fs.createDirectory(file("/repo/assets/deep"));
    await fs.createDirectory(file("/repo/assets"));
    expect((await fs.stat(file("/repo/assets/deep"))).type).toBe(DIRECTORY);
    await fs.writeFile(file("/repo/assets/a.png"), new Uint8Array([1, 2, 3]));
    await fs.writeFile(file("/repo/assets/a.png"), new Uint8Array([9]));
    expect([...(await fs.readFile(file("/repo/assets/a.png")))]).toEqual([9]);
    expect(memory.calls.writeFile).toEqual(["/repo/assets/a.png", "/repo/assets/a.png"]);
  });
});

describe("the search of the fake", () => {
  const FILES = {
    "/repo/models/tea.owm": TEA,
    "/repo/models/sample.ttm.json": "{}",
    "/repo/readme.md": "# Repo\n",
    "/repo/node_modules/pkg/example.owm": TEA,
    "/repo/.git/stash/old.owm": TEA,
    "/repo/.github/drafts/idea.owm": TEA,
    "/elsewhere/other.owm": TEA,
  };
  const found = async (
    memory: MemoryVsCode,
    base: string,
    glob: string,
    exclude?: string | null,
  ): Promise<string[]> => {
    const { vscode } = memory;
    const pattern = new vscode.RelativePattern(file(base), glob);
    return (await vscode.workspace.findFiles(pattern, exclude)).map((uri) => uri.path).sort();
  };

  test("finds by the glob below the pattern's folder, whether or not that is a workspace folder", async () => {
    const memory = createMemoryVsCode(FILES, { workspaceFolders: ["/elsewhere"] });
    expect(await found(memory, "/repo", "**/*.{owm,ttm.json}", null)).toEqual([
      "/repo/.git/stash/old.owm",
      "/repo/.github/drafts/idea.owm",
      "/repo/models/sample.ttm.json",
      "/repo/models/tea.owm",
      "/repo/node_modules/pkg/example.owm",
    ]);
    expect(await found(memory, "/repo", "models/**/*.owm", null)).toEqual(["/repo/models/tea.owm"]);
  });

  test("an exclude glob leaves VS Code's files.exclude in force: .git is not searched, another dot folder is", async () => {
    const memory = createMemoryVsCode(FILES);
    expect(await found(memory, "/repo", "**/*.owm", "**/node_modules/**")).toEqual([
      "/repo/.github/drafts/idea.owm",
      "/repo/models/tea.owm",
    ]);
    expect(await found(memory, "/repo", "**/*.owm")).toEqual([
      "/repo/.github/drafts/idea.owm",
      "/repo/models/tea.owm",
      "/repo/node_modules/pkg/example.owm",
    ]);
  });

  test("answers later than it was asked, and a test can hold the answer", async () => {
    const memory = createMemoryVsCode(FILES);
    const release = memory.holdSearches();
    let answer: string[] | undefined;
    void found(memory, "/repo", "**/*.md", null).then((paths) => (answer = paths));
    await Promise.resolve();
    expect(answer).toBeUndefined();
    memory.disk.write("/repo/late.md", "# Late\n");
    release();
    await expect.poll(() => answer).toEqual(["/repo/late.md", "/repo/readme.md"]);
  });
});

describe("a watcher of the fake", () => {
  function watched(memory: MemoryVsCode, base: string, glob: string): string[] {
    const { vscode } = memory;
    const heard: string[] = [];
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(file(base), glob),
    );
    watcher.onDidCreate((uri) => heard.push(`created ${uri.path}`));
    watcher.onDidChange((uri) => heard.push(`changed ${uri.path}`));
    watcher.onDidDelete((uri) => heard.push(`deleted ${uri.path}`));
    return heard;
  }

  test("names a file that came, changed or went where its glob matches, below its folder only, in or out of the workspace", () => {
    const memory = createMemoryVsCode({}, { workspaceFolders: ["/elsewhere"] });
    const heard = watched(memory, "/repo", "**/*.owm");
    memory.disk.write("/repo/models/tea.owm", TEA);
    memory.disk.write("/repo/models/tea.owm", "title Tea 2\n");
    memory.disk.write("/repo/models/notes.md", "# Notes\n");
    memory.disk.write("/elsewhere/other.owm", TEA);
    memory.disk.remove("/repo/models/tea.owm");
    expect(heard).toEqual([
      "created /repo/models/tea.owm",
      "changed /repo/models/tea.owm",
      "deleted /repo/models/tea.owm",
    ]);
  });

  test("hears one word for a folder another program removes or moves, the folder's own: a glob of files alone hears nothing", () => {
    const memory = workspace({ "/repo/models/a.owm": TEA, "/repo/models/b.owm": TEA });
    const files = watched(memory, "/repo", "**/*.owm");
    const everything = watched(memory, "/repo", "**/*");
    memory.disk.move("/repo/models", "/repo/maps");
    expect(memory.disk.has("/repo/maps/a.owm")).toBe(true);
    memory.disk.remove("/repo/maps");
    expect(memory.disk.has("/repo/maps/a.owm")).toBe(false);
    expect(files).toEqual([]);
    expect(everything).toEqual([
      "deleted /repo/models",
      "created /repo/maps",
      "deleted /repo/maps",
    ]);
  });

  test("names a folder that is made, before the file that is written into it", () => {
    const memory = workspace({});
    const everything = watched(memory, "/repo", "**/*");
    memory.disk.write("/repo/new/deep/a.owm", TEA);
    memory.disk.folder("/repo/empty");
    memory.disk.write("/repo/new/deep/b.owm", TEA);
    expect(everything).toEqual([
      "created /repo/new",
      "created /repo/new/deep",
      "created /repo/new/deep/a.owm",
      "created /repo/empty",
      "created /repo/new/deep/b.owm",
    ]);
  });

  test("is silent once it is disposed", () => {
    const memory = workspace({});
    const { vscode } = memory;
    const heard: string[] = [];
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(file("/repo"), "**/*.owm"),
    );
    watcher.onDidCreate((uri) => heard.push(uri.path));
    watcher.dispose();
    memory.disk.write("/repo/tea.owm", TEA);
    expect(heard).toEqual([]);
  });
});

describe("VS Code's own file events in the fake", () => {
  test("fire once for what a person does in the explorer, a folder as one entry, and never for another program", () => {
    const memory = workspace({ "/repo/models/a.owm": TEA, "/repo/models/b.owm": TEA });
    const { workspace: api } = memory.vscode;
    const heard: string[] = [];
    api.onDidCreateFiles(({ files }) => heard.push(`created ${files.map((uri) => uri.path)}`));
    api.onDidDeleteFiles(({ files }) => heard.push(`deleted ${files.map((uri) => uri.path)}`));
    api.onDidRenameFiles(({ files }) =>
      heard.push(
        `renamed ${files.map(({ oldUri, newUri }) => `${oldUri.path} to ${newUri.path}`)}`,
      ),
    );
    memory.disk.write("/repo/models/c.owm", TEA);
    memory.disk.move("/repo/models/c.owm", "/repo/models/d.owm");
    memory.disk.remove("/repo/models/d.owm");
    expect(heard).toEqual([]);
    memory.explorer.create("/repo/new.owm", TEA);
    memory.explorer.rename("/repo/models", "/repo/maps");
    memory.explorer.delete("/repo/maps");
    expect(heard).toEqual([
      "created /repo/new.owm",
      "renamed /repo/models to /repo/maps",
      "deleted /repo/maps",
    ]);
    expect(memory.disk.has("/repo/maps/a.owm")).toBe(false);
  });
});

describe("the workspace folders of the fake", () => {
  test("getWorkspaceFolder is the innermost folder that holds a file, and a change of the folders fires the event", () => {
    const memory = createMemoryVsCode({}, { workspaceFolders: ["/work", "/work/inner"] });
    const { workspace: api } = memory.vscode;
    let changes = 0;
    api.onDidChangeWorkspaceFolders(() => (changes += 1));
    expect(api.getWorkspaceFolder(file("/work/inner/x.board"))?.uri.path).toBe("/work/inner");
    expect(api.getWorkspaceFolder(file("/work/x.board"))?.uri.path).toBe("/work");
    expect(api.getWorkspaceFolder(file("/workbench/x.board"))).toBeUndefined();
    memory.setWorkspaceFolders([]);
    expect(changes).toBe(1);
    expect(api.workspaceFolders).toBeUndefined();
    expect(api.getWorkspaceFolder(file("/work/x.board"))).toBeUndefined();
  });
});

describe("the fake's URIs and globs", () => {
  test("a URI of a file prints with three slashes, joins segments and keeps its scheme in with()", () => {
    const uri = MemoryUri.joinPath(file("/repo/"), "models", "tea.owm");
    expect(uri.toString()).toBe("file:///repo/models/tea.owm");
    expect(uri.with({ path: "/repo" }).toString()).toBe("file:///repo");
    expect(MemoryUri.parse("untitled:Untitled-1")).toMatchObject({
      scheme: "untitled",
      path: "Untitled-1",
    });
    expect(MemoryUri.parse("vscode-remote://ssh+box/home/x.board")).toMatchObject({
      scheme: "vscode-remote",
      authority: "ssh+box",
      path: "/home/x.board",
    });
  });

  test.each([
    ["**/*.owm", "tea.owm", true],
    ["**/*.owm", "models/deep/tea.owm", true],
    ["**/*.owm", "models/tea.owm.bak", false],
    ["**/*.{owm,ttm.json}", "a/sample.ttm.json", true],
    ["**/*.{owm,ttm.json}", "a/sample.json", false],
    ["assets/**/*.{png,svg}", "assets/logo.svg", true],
    ["assets/**/*.{png,svg}", "docs/assets/logo.svg", false],
    ["**/node_modules/**", "node_modules/pkg/a.owm", true],
    ["**/node_modules/**", "apps/x/node_modules/a.owm", true],
    ["**/node_modules/**", "models/a.owm", false],
    ["*.owm", "models/tea.owm", false],
  ])("the glob %s on %s: %s", (glob, path, matches) => {
    expect(globToRegExp(glob).test(path)).toBe(matches);
  });
});
