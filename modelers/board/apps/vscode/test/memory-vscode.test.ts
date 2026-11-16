import { describe, expect, test } from "vitest";

import {
  AFTER_DELAY_SAVE,
  createMemoryVsCode,
  globToRegExp,
  MemoryUri,
  type MemoryDocument,
  type MemoryVsCode,
} from "../src/files/memory-vscode.js";
import { DIRECTORY, FILE, MANUAL_SAVE, READONLY, SYMBOLIC_LINK } from "../src/files/vscode-like.js";

/**
 * The fake VS Code the files backend is tested against, held to what it claims about the real
 * one. Each test is one behaviour the backend depends on. They were read from VS Code's typings
 * and source first; the board's guide says of each how a real VS Code then showed it, and
 * where one differed the fake says what was seen.
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

  test("has one line break, the one most of its file's breaks are: a lone carriage return is a line break of the document and none of its characters", async () => {
    const memory = workspace({
      "/repo/lone.txt": "one\ntwo\rthree\nfour\n",
      "/repo/mostly-lf.txt": "one\ntwo\r\nthree\nfour\n",
      "/repo/mostly-crlf.txt": "one\r\ntwo\nthree\r\nfour\r\n",
      "/repo/returns.txt": "one\rtwo\rthree\r",
      "/repo/half.txt": "one\r\ntwo\n",
    });
    const read = async (path: string): Promise<string> =>
      (await memory.vscode.workspace.openTextDocument(file(path))).getText();
    expect(await read("/repo/lone.txt")).toBe("one\ntwo\nthree\nfour\n");
    expect(await read("/repo/mostly-lf.txt")).toBe("one\ntwo\nthree\nfour\n");
    expect(await read("/repo/mostly-crlf.txt")).toBe("one\r\ntwo\r\nthree\r\nfour\r\n");
    expect(await read("/repo/returns.txt")).toBe("one\r\ntwo\r\nthree\r\n");
    expect(await read("/repo/half.txt")).toBe("one\ntwo\n");
    // another text than its file's, and still no unsaved change; the file is as it was
    expect(memory.document("/repo/lone.txt")).toMatchObject({ isDirty: false, lineCount: 5 });
    expect(memory.document("/repo/lone.txt")?.lineAt(2).text).toBe("three");
    expect(memory.disk.text("/repo/lone.txt")).toBe("one\ntwo\rthree\nfour\n");
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
  test("replaces its range, leaves the document dirty and the disk alone, and fires the change events before it resolves", async () => {
    const memory = workspace();
    const order: string[] = [];
    const tea = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.vscode.workspace.onDidChangeTextDocument((event) => {
      const changes = event.contentChanges.length;
      const dirty = (tea as MemoryDocument).isDirty ? "unsaved" : "clean";
      order.push(`event ${changes} ${dirty} ${event.document.getText().split("\n")[0]}`);
    });
    const applied = firstLine(memory, "/repo/models/tea.owm", "title Mine\n").then((result) => {
      order.push(`resolved ${result}`);
    });
    // nothing in the task that asked: VS Code applies an edit in another thread
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe(TEA);
    await applied;
    // the first change of a clean document is told while it still calls itself clean, and that
    // it is unsaved is a second event without a content change
    expect(order).toEqual([
      "event 1 clean title Mine",
      "event 0 unsaved title Mine",
      "resolved true",
    ]);
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

  test("writes a carriage return that an edit inserts alone as the document's line break too, and a save writes the document's text", async () => {
    const memory = workspace({ "/repo/models/tea.owm": "title Tea\nnote\r\nend\n" });
    await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    await firstLine(memory, "/repo/models/tea.owm", "a\rb\nc\r\n");
    expect(memory.document("/repo/models/tea.owm")?.getText()).toBe("a\nb\nc\nnote\nend\n");
    expect(memory.save("/repo/models/tea.owm")).toBe(true);
    expect(memory.disk.text("/repo/models/tea.owm")).toBe("a\nb\nc\nnote\nend\n");
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
  test("typing, an undo and a revert are each one more version and one event with a content change, and a document says apart that it turned unsaved or clean", async () => {
    const memory = workspace();
    const events: string[] = [];
    const tea = await memory.vscode.workspace.openTextDocument(file("/repo/models/tea.owm"));
    memory.vscode.workspace.onDidChangeTextDocument((event) => {
      const dirty = (tea as MemoryDocument).isDirty ? "unsaved" : "clean";
      events.push(`${event.contentChanges.length} ${dirty}`);
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
    expect(events).toEqual([
      // the first typing: told while the document is clean, then that it is unsaved
      "1 clean",
      "0 unsaved",
      "1 unsaved",
      "1 unsaved",
      // the revert: clean before its text is told, and once more without a content change
      "1 clean",
      "0 clean",
    ]);
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

  test("a document that reads its file again takes the line break of the new text", async () => {
    const memory = workspace({ "/repo/a.owm": "one\n" });
    await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    memory.disk.write("/repo/a.owm", "x\r\ny\r\nz\n");
    expect(memory.document("/repo/a.owm")?.getText()).toBe("x\r\ny\r\nz\r\n");
    expect(memory.document("/repo/a.owm")?.isDirty).toBe(false);
    // and an edit made afterwards breaks its lines as the document does now
    await firstLine(memory, "/repo/a.owm", "first\nsecond\n");
    expect(memory.document("/repo/a.owm")?.getText()).toBe("first\r\nsecond\r\ny\r\nz\r\n");
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

  test("the document of a file another program moves away stays open; of one a person renames in the Explorer, the clean one is let go of after the rename is told, with a clean one open at the new path before it", async () => {
    const memory = workspace({ "/repo/a.owm": "title A\n", "/repo/b.owm": "title B\n" });
    const { workspace: api } = memory.vscode;
    const heard: string[] = [];
    api.onDidCloseTextDocument((document) => heard.push(`closed ${document.uri.path}`));
    await api.openTextDocument(file("/repo/a.owm"));
    await api.openTextDocument(file("/repo/b.owm"));
    memory.disk.move("/repo/a.owm", "/repo/a-moved.owm");
    expect(heard).toEqual([]);
    expect(memory.document("/repo/a.owm")).toMatchObject({ isClosed: false });
    api.onDidOpenTextDocument((document) => heard.push(`opened ${document.uri.path}`));
    api.onDidRenameFiles(({ files }) =>
      heard.push(`renamed ${files.map(({ newUri }) => newUri.path).join()}`),
    );
    memory.explorer.rename("/repo/b.owm", "/repo/b-renamed.owm");
    // the order a real VS Code tells it in, also for a file that no tab shows
    expect(heard).toEqual([
      "opened /repo/b-renamed.owm",
      "renamed /repo/b-renamed.owm",
      "closed /repo/b.owm",
    ]);
    expect(memory.document("/repo/b.owm")).toBeUndefined();
    expect(memory.document("/repo/b-renamed.owm")).toMatchObject({ isDirty: false, version: 1 });
    expect(memory.document("/repo/b-renamed.owm")?.getText()).toBe("title B\n");
  });

  test("the unsaved text of a file a person renames in the Explorer moves with it: the old document says that it is clean and is let go of, and an unsaved one is open at the new path before the rename is told", async () => {
    const memory = workspace({ "/repo/models/a.owm": "title A\n", "/repo/models/b.owm": "b\n" });
    const { workspace: api } = memory.vscode;
    const heard: string[] = [];
    await api.openTextDocument(file("/repo/models/a.owm"));
    memory.type("/repo/models/a.owm", "title A typed\n");
    api.onDidCloseTextDocument((document) => heard.push(`closed ${document.uri.path}`));
    api.onDidOpenTextDocument((document) => heard.push(`opened ${document.uri.path}`));
    api.onDidChangeTextDocument(({ document, contentChanges }) => {
      const dirty = (document as MemoryDocument).isDirty ? "unsaved" : "clean";
      heard.push(`changed ${document.uri.path} ${contentChanges.length} ${dirty}`);
    });
    api.onDidRenameFiles(({ files }) =>
      heard.push(`renamed ${files.map(({ newUri }) => newUri.path).join()}`),
    );
    // with a folder above it, which is all the event names
    memory.explorer.rename("/repo/models", "/repo/maps");
    // the order a real VS Code tells it in: whoever keeps a list of unsaved documents hears
    // that the old one is clean before it hears of the rename
    expect(heard).toEqual([
      "changed /repo/models/a.owm 0 clean",
      "closed /repo/models/a.owm",
      "opened /repo/maps/a.owm",
      "changed /repo/maps/a.owm 0 unsaved",
      "renamed /repo/maps",
    ]);
    expect(memory.document("/repo/models/a.owm")).toBeUndefined();
    expect(memory.document("/repo/maps/a.owm")).toMatchObject({ isDirty: true, version: 1 });
    expect(memory.document("/repo/maps/a.owm")?.getText()).toBe("title A typed\n");
    // the file moved as it was: the unsaved text is in the document alone
    expect(memory.disk.text("/repo/maps/a.owm")).toBe("title A\n");
    expect(memory.save("/repo/maps/a.owm")).toBe(true);
    expect(memory.disk.text("/repo/maps/a.owm")).toBe("title A typed\n");
  });
});

describe("a save in the fake", () => {
  const PATH = "/repo/models/tea.owm";

  /** a workspace whose document of tea.owm is open, with what VS Code tells of its saves */
  async function saving() {
    const memory = workspace();
    const { workspace: api } = memory.vscode;
    await api.openTextDocument(file(PATH));
    const heard: string[] = [];
    api.onWillSaveTextDocument(({ document: saved, reason }) =>
      heard.push(
        `will ${saved.uri.path} ${reason} dirty ${String(memory.document(PATH)?.isDirty)}`,
      ),
    );
    api.onDidChangeTextDocument((event) => heard.push(`change ${event.contentChanges.length}`));
    api.onDidSaveTextDocument((saved) =>
      heard.push(`did ${saved.uri.path} dirty ${String(memory.document(PATH)?.isDirty)}`),
    );
    return { memory, heard };
  }

  test("by a person tells will-save with the reason Manual, then the dirty state without a content change, then did-save", async () => {
    const { memory, heard } = await saving();
    memory.type(PATH, "title Typed\n");
    heard.length = 0;
    expect(memory.save(PATH)).toBe(true);
    expect(heard).toEqual([
      `will ${PATH} ${MANUAL_SAVE} dirty true`,
      "change 0",
      `did ${PATH} dirty false`,
    ]);
    expect(memory.disk.text(PATH)).toBe("title Typed\n");
  });

  test("by auto save carries another reason", async () => {
    const { memory, heard } = await saving();
    memory.type(PATH, "title Typed\n");
    heard.length = 0;
    memory.save(PATH, AFTER_DELAY_SAVE);
    expect(heard[0]).toBe(`will ${PATH} ${AFTER_DELAY_SAVE} dirty true`);
    expect(AFTER_DELAY_SAVE).not.toBe(MANUAL_SAVE);
  });

  test("of a clean document a person asks for is a save all the same: both events, and the file as it was", async () => {
    const { memory, heard } = await saving();
    expect(memory.save(PATH)).toBe(true);
    expect(heard).toEqual([
      `will ${PATH} ${MANUAL_SAVE} dirty false`,
      "change 0",
      `did ${PATH} dirty false`,
    ]);
    expect(memory.disk.text(PATH)).toBe(TEA);
  });

  test("by an extension, TextDocument.save(), is VS Code's own save with the reason Manual, answered true in a later task", async () => {
    const { memory, heard } = await saving();
    memory.type(PATH, "title Typed\n");
    heard.length = 0;
    const saved = memory.document(PATH)?.save();
    expect(heard).toEqual([]);
    expect(await saved).toBe(true);
    expect(heard).toEqual([
      `will ${PATH} ${MANUAL_SAVE} dirty true`,
      "change 0",
      `did ${PATH} dirty false`,
    ]);
    expect(memory.disk.text(PATH)).toBe("title Typed\n");
  });

  test("fails for a document whose file another program wrote meanwhile: will-save, no did-save, false, the document stays dirty and VS Code says why", async () => {
    const { memory, heard } = await saving();
    memory.type(PATH, "title Typed\n");
    memory.disk.write(PATH, "title From Git\n");
    heard.length = 0;
    expect(await memory.document(PATH)?.save()).toBe(false);
    expect(heard).toEqual([`will ${PATH} ${MANUAL_SAVE} dirty true`]);
    expect(memory.document(PATH)).toMatchObject({ isDirty: true });
    expect(memory.disk.text(PATH)).toBe("title From Git\n");
    expect(memory.notices).toEqual(["Failed to save 'tea.owm': The content of the file is newer."]);
    // a person's own save fails the same way
    expect(memory.save(PATH)).toBe(false);
    // and a revert makes the document the file's again, which saves
    memory.revert(PATH);
    memory.type(PATH, "title Typed again\n");
    expect(await memory.document(PATH)?.save()).toBe(true);
  });

  test("is none for a document VS Code let go of: save() answers false and tells nothing", async () => {
    const { memory, heard } = await saving();
    const document = memory.document(PATH);
    memory.closeDocument(PATH);
    expect(await document?.save()).toBe(false);
    expect(heard).toEqual([]);
  });
});

describe("the documents VS Code has open, in the fake", () => {
  test("are all in workspace.textDocuments, a dirty one among them, and none that was let go of", async () => {
    const memory = workspace({ "/repo/a.owm": "a\n", "/repo/b.owm": "b\n" });
    const { workspace: api } = memory.vscode;
    expect(api.textDocuments).toEqual([]);
    const first = await api.openTextDocument(file("/repo/a.owm"));
    const second = await api.openTextDocument(file("/repo/b.owm"));
    memory.type("/repo/b.owm", "b typed\n");
    expect(api.textDocuments).toEqual([first, second]);
    memory.closeDocument("/repo/a.owm");
    expect(api.textDocuments).toEqual([second]);
  });

  test("are told when they are opened: one read from a file, one an edit made, and never the same twice", async () => {
    const memory = workspace({ "/repo/a.owm": "a\n", "/repo/b.owm": "b\n" });
    const opened: string[] = [];
    memory.vscode.workspace.onDidOpenTextDocument((document) => opened.push(document.uri.path));
    await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    await memory.vscode.workspace.openTextDocument(file("/repo/a.owm"));
    expect(opened).toEqual(["/repo/a.owm"]);
    await firstLine(memory, "/repo/b.owm", "edited\n");
    expect(opened).toEqual(["/repo/a.owm", "/repo/b.owm"]);
  });
});

describe("the commands of the fake", () => {
  test("write down a command of VS Code's own and do nothing: vscode.open with the file it was handed", async () => {
    const memory = workspace();
    const { commands } = memory.vscode;
    expect(await commands.executeCommand("vscode.open", file("/repo/models/tea.owm"))).toBe(
      undefined,
    );
    expect(memory.executed).toEqual([["vscode.open", file("/repo/models/tea.owm")]]);
  });

  test("run a command an extension registered, with the arguments, in a later task, and answer what it answers", async () => {
    const memory = workspace();
    const { commands } = memory.vscode;
    const ran: unknown[][] = [];
    commands.registerCommand("board.test", (...rest) => {
      ran.push(rest);
      return "done";
    });
    const answer = commands.executeCommand("board.test", 1, "two");
    expect(ran).toEqual([]);
    expect(await answer).toBe("done");
    expect(ran).toEqual([[1, "two"]]);
  });

  test("reject for a command nobody has, for one a test makes fail, and with what a registered one throws", async () => {
    const memory = workspace();
    const { commands } = memory.vscode;
    await expect(commands.executeCommand("board.none")).rejects.toThrow(
      "command 'board.none' not found",
    );
    memory.failCommand("vscode.open", new Error("no editor"));
    await expect(commands.executeCommand("vscode.open")).rejects.toThrow("no editor");
    commands.registerCommand("board.throws", () => {
      throw new Error("thrown");
    });
    await expect(commands.executeCommand("board.throws")).rejects.toThrow("thrown");
  });

  test("take a name once: a second registration throws, and a disposed one frees the name", () => {
    const memory = workspace();
    const { commands } = memory.vscode;
    const first = commands.registerCommand("board.test", () => undefined);
    expect(() => commands.registerCommand("board.test", () => undefined)).toThrow(
      "command 'board.test' already exists",
    );
    first.dispose();
    const second = commands.registerCommand("board.test", () => "second");
    // the first one's dispose, called again, leaves the second alone
    first.dispose();
    expect(() => commands.registerCommand("board.test", () => undefined)).toThrow("already exists");
    second.dispose();
  });
});

describe("the diagnostics of the fake", () => {
  test("are kept by collection and document: set replaces, an empty list and delete take the entry away", () => {
    const memory = workspace();
    const { languages, Diagnostic, DiagnosticSeverity, Range } = memory.vscode;
    const collection = languages.createDiagnosticCollection("board");
    expect(memory.diagnostics).toEqual([collection]);
    expect(collection.name).toBe("board");
    const problem = new Diagnostic(new Range(1, 0, 1, 4), "Line 2 is no JSON.");
    // an error unless it says otherwise, as in VS Code
    expect(problem.severity).toBe(DiagnosticSeverity.Error);
    collection.set(file("/repo/a.board"), [problem]);
    collection.set(file("/repo/b.board"), [problem]);
    expect(collection.has(file("/repo/a.board"))).toBe(true);
    expect(collection.get(file("/repo/a.board"))).toEqual([problem]);
    collection.set(file("/repo/a.board"), []);
    expect(collection.has(file("/repo/a.board"))).toBe(false);
    expect(collection.get(file("/repo/a.board"))).toBeUndefined();
    collection.delete(file("/repo/b.board"));
    expect(collection.documents).toEqual([]);
    collection.set(file("/repo/b.board"), [problem]);
    collection.dispose();
    expect(collection.documents).toEqual([]);
    expect(collection.disposed).toBe(true);
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
    // of a move the new name first: VS Code hands over what came before what went
    expect(everything).toEqual([
      "created /repo/maps",
      "deleted /repo/models",
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

  test("name everything one edit renames in one event, and the watchers hear of all of it afterwards, what came before what went", () => {
    const memory = workspace({ "/repo/models/a.owm": TEA, "/repo/assets/logo.svg": "<svg/>" });
    const { workspace: api, RelativePattern } = memory.vscode;
    const heard: string[] = [];
    api.onDidRenameFiles(({ files }) =>
      heard.push(
        `renamed ${files.map(({ oldUri, newUri }) => `${oldUri.path} to ${newUri.path}`).join(", ")}`,
      ),
    );
    const watcher = api.createFileSystemWatcher(new RelativePattern(file("/repo"), "**/*"));
    watcher.onDidDelete((uri) => heard.push(`watched ${uri.path} go`));
    watcher.onDidCreate((uri) => heard.push(`watched ${uri.path} come`));
    memory.explorer.move([
      ["/repo/models/a.owm", "/repo/archive/a.owm"],
      ["/repo/assets", "/repo/pictures"],
    ]);
    expect(heard).toEqual([
      "renamed /repo/models/a.owm to /repo/archive/a.owm, /repo/assets to /repo/pictures",
      "watched /repo/archive/a.owm come",
      "watched /repo/pictures come",
      "watched /repo/models/a.owm go",
      "watched /repo/assets go",
    ]);
    expect(memory.disk.has("/repo/archive/a.owm")).toBe(true);
    expect(memory.disk.has("/repo/pictures/logo.svg")).toBe(true);
  });

  test("name everything a person drags in one gesture in one event, told after the last entry moved: the watchers have named the earlier ones by then", () => {
    const memory = workspace({
      "/repo/models/a.owm": TEA,
      "/repo/models/b.owm": TEA,
      "/repo/assets/logo.svg": "<svg/>",
    });
    const { workspace: api, RelativePattern } = memory.vscode;
    const heard: string[] = [];
    api.onDidRenameFiles(({ files }) =>
      heard.push(
        `renamed ${files.map(({ oldUri, newUri }) => `${oldUri.path} to ${newUri.path}`).join(", ")}`,
      ),
    );
    const watcher = api.createFileSystemWatcher(new RelativePattern(file("/repo"), "**/*"));
    watcher.onDidDelete((uri) => heard.push(`watched ${uri.path} go`));
    watcher.onDidCreate((uri) => heard.push(`watched ${uri.path} come`));
    memory.explorer.drag([
      ["/repo/models/a.owm", "/repo/archive/a.owm"],
      ["/repo/assets", "/repo/archive/assets"],
      ["/repo/models/b.owm", "/repo/archive/b.owm"],
    ]);
    expect(heard).toEqual([
      "watched /repo/archive/a.owm come",
      "watched /repo/models/a.owm go",
      "watched /repo/archive/assets come",
      "watched /repo/assets go",
      "renamed /repo/models/a.owm to /repo/archive/a.owm, /repo/assets to /repo/archive/assets, /repo/models/b.owm to /repo/archive/b.owm",
      "watched /repo/archive/b.owm come",
      "watched /repo/models/b.owm go",
    ]);
    expect(memory.disk.has("/repo/archive/assets/logo.svg")).toBe(true);
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
