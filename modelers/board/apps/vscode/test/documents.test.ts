import { describe, expect, test } from "vitest";

import {
  exceedsBytes,
  openDocumentText,
  TEXT_LIMIT_BYTES,
  type DocumentText,
} from "../src/files/documents.js";
import { createMemoryVsCode, MemoryUri, type MemoryVsCode } from "../src/files/memory-vscode.js";

/**
 * A model's text over VS Code's text documents, against the fake VS Code. The files server is
 * not here: each test calls the text as the server would and reads what it is told.
 */

const PATH = "models/tea.owm";
const FILE = "/repo/models/tea.owm";
const TEA = "title Tea\ncomponent Cup [0.8, 0.6]\ncomponent Tea [0.6, 0.5]\n";
const MINE = "title Tea\ncomponent Mug [0.8, 0.6]\ncomponent Tea [0.6, 0.5]\n";

interface Opened {
  readonly memory: MemoryVsCode;
  readonly text: DocumentText<MemoryUri>;
  /** every text the server was told, in order */
  readonly changes: string[];
  /** how often the server was told that the file went */
  gone(): number;
}

async function opened(files: Record<string, string> = { [FILE]: TEA }): Promise<Opened> {
  const memory = createMemoryVsCode(files, { workspaceFolders: ["/repo"] });
  const text = await openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE));
  const changes: string[] = [];
  let gone = 0;
  text.onChange((changed) => changes.push(changed));
  text.onGone(() => (gone += 1));
  return { memory, text, changes, gone: () => gone };
}

/** resolves once the fake VS Code and the text have nothing left on their way */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("a model's text in VS Code", () => {
  test("is the text of the file's document, which the open leaves clean", async () => {
    const { memory, text } = await opened();
    expect(text.text()).toBe(TEA);
    expect(text.readOnly).toBe(false);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false, version: 1 });
  });

  test("writes a change as one minimal edit of the document: the lines that differ, and the file is dirty, not saved", async () => {
    const { memory, text } = await opened();
    expect(await text.write(MINE, TEA)).toBe(true);
    expect(memory.applied).toHaveLength(1);
    expect(memory.applied[0]).toMatchObject({
      range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
      text: "component Mug [0.8, 0.6]\n",
    });
    expect(text.text()).toBe(MINE);
    expect(memory.document(FILE)).toMatchObject({ isDirty: true });
    // the person saves: nothing here does
    expect(memory.disk.text(FILE)).toBe(TEA);
    expect(memory.calls.writeFile).toEqual([]);
  });

  test("applies no edit for the text the document has", async () => {
    const { memory, text } = await opened();
    expect(await text.write(TEA, TEA)).toBe(true);
    expect(memory.applied).toEqual([]);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false });
  });

  test("tells nothing for the echo of its own write", async () => {
    const { text, changes } = await opened();
    await text.write(MINE, TEA);
    await text.write(TEA, MINE);
    await settled();
    expect(changes).toEqual([]);
  });

  test("tells a change it did not write: a person typing, an undo of its own write, a revert", async () => {
    const { memory, text, changes } = await opened();
    memory.type(FILE, "title Typed\n");
    expect(changes).toEqual(["title Typed\n"]);
    await text.write("title Mine\n", "title Typed\n");
    expect(changes).toHaveLength(1);
    expect(memory.undo(FILE)).toBe(true);
    expect(changes).toEqual(["title Typed\n", "title Typed\n"]);
    memory.revert(FILE);
    expect(changes.at(-1)).toBe(TEA);
    expect(text.text()).toBe(TEA);
  });

  test("tells its own text again when somebody else brings it back, after the echo was heard once", async () => {
    const { memory, text, changes } = await opened();
    await text.write(MINE, TEA);
    memory.undo(FILE);
    memory.type(FILE, MINE);
    expect(changes).toEqual([TEA, MINE]);
  });

  test("tells nothing for a save, whose event carries no change of the text", async () => {
    const { memory, text, changes } = await opened();
    await text.write(MINE, TEA);
    memory.save(FILE);
    text.file("changed");
    await settled();
    expect(changes).toEqual([]);
    expect(memory.disk.text(FILE)).toBe(MINE);
  });

  test("answers text() with the document's own line breaks after a write", async () => {
    const { text } = await opened({ [FILE]: "title Tea\r\nnote one\r\n" });
    expect(await text.write("title Tea\nnote two\n", "title Tea\r\nnote one\r\n")).toBe(true);
    expect(text.text()).toBe("title Tea\r\nnote two\r\n");
  });

  test("refuses a write made on another text than the document has, and changes nothing", async () => {
    const { memory, text } = await opened();
    expect(await text.write(MINE, "title Somebody else's\n")).toBe(false);
    expect(memory.applied).toEqual([]);
    expect(text.text()).toBe(TEA);
  });

  test("refuses a write VS Code refuses because the document moved between the ask and the apply, and tells the other text once", async () => {
    const { memory, text, changes } = await opened();
    const release = memory.holdEdits();
    const written = text.write(MINE, TEA);
    await settled();
    memory.type(FILE, "title Typed meanwhile\n");
    release();
    expect(await written).toBe(false);
    expect(changes).toEqual(["title Typed meanwhile\n"]);
    expect(text.text()).toBe("title Typed meanwhile\n");
    // the refused write left no echo behind: the same text from somebody else is told
    memory.type(FILE, MINE);
    expect(changes).toEqual(["title Typed meanwhile\n", MINE]);
  });

  test("is two texts for two pages on one file: what one writes, the other is told", async () => {
    const { memory, text, changes } = await opened();
    const other = await openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE));
    const told: string[] = [];
    other.onChange((changed) => told.push(changed));
    await text.write(MINE, TEA);
    expect(changes).toEqual([]);
    expect(told).toEqual([MINE]);
    await other.write(TEA, MINE);
    expect(changes).toEqual([TEA]);
    expect(told).toEqual([MINE]);
  });

  test("ends its listening with close()", async () => {
    const { memory, text, changes } = await opened();
    expect(memory.listening().documents).toBe(2);
    text.close();
    expect(memory.listening().documents).toBe(0);
    memory.type(FILE, "title Typed\n");
    expect(changes).toEqual([]);
    // and it writes no more, though the base is the text the document has
    expect(await text.write(MINE, "title Typed\n")).toBe(false);
    expect(memory.applied).toEqual([]);
    text.file("deleted");
    text.file("created");
    await settled();
    expect(memory.calls.openTextDocument).toHaveLength(1);
  });
});

describe("a document VS Code let go of", () => {
  /** open, written, saved by the person, and closed by VS Code a few minutes later */
  async function closed(): Promise<Opened & { first: unknown }> {
    const all = await opened();
    const first = all.memory.document(FILE);
    await all.text.write(MINE, TEA);
    all.memory.save(FILE);
    all.memory.closeDocument(FILE);
    return { ...all, first };
  }

  test("leaves the text at hand: text() answers the last one", async () => {
    const { memory, text } = await closed();
    expect(memory.document(FILE)).toBeUndefined();
    expect(text.text()).toBe(MINE);
  });

  test("is opened again before the next write, which lands in the new document", async () => {
    const { memory, text, first, changes } = await closed();
    const opens = memory.calls.openTextDocument.length;
    expect(await text.write(TEA, MINE)).toBe(true);
    expect(memory.calls.openTextDocument).toHaveLength(opens + 1);
    const live = memory.document(FILE);
    expect(live).not.toBe(first);
    expect(live?.getText()).toBe(TEA);
    expect(live).toMatchObject({ isDirty: true, version: 2 });
    expect(text.text()).toBe(TEA);
    expect(changes).toEqual([]);
    // and the one after it needs no open: the document is dirty and stays
    await text.write(MINE, TEA);
    expect(memory.calls.openTextDocument).toHaveLength(opens + 1);
  });

  test("is not written from its dead object: a file that changed without a word refuses the write, and text() is the file's", async () => {
    const { memory, text } = await closed();
    const edits = memory.applied.length;
    // nobody tells the text: a watcher that is late, or that never comes
    memory.disk.write(FILE, "title Changed on the disk\n");
    expect(await text.write(TEA, MINE)).toBe(false);
    expect(memory.applied).toHaveLength(edits);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false });
    expect(text.text()).toBe("title Changed on the disk\n");
    // made on the text the page was then told, the next write is taken
    expect(await text.write(TEA, "title Changed on the disk\n")).toBe(true);
    expect(memory.document(FILE)?.getText()).toBe(TEA);
  });

  test("is read again when the watcher names the file, and its text is told when it is another one", async () => {
    const { memory, text, changes } = await closed();
    text.file("changed");
    await settled();
    expect(changes).toEqual([]);
    memory.closeDocument(FILE);
    memory.disk.write(FILE, "title From Git\n");
    text.file("changed");
    text.file("changed");
    await settled();
    expect(changes).toEqual(["title From Git\n"]);
    expect(text.text()).toBe("title From Git\n");
  });

  test("is the one somebody else opens: its change is told, and the next write goes there without another open", async () => {
    const { memory, text, changes } = await closed();
    // the file's own editor, or a text editor: VS Code opens the document, the board did not
    await memory.vscode.workspace.openTextDocument(MemoryUri.file(FILE));
    memory.type(FILE, "title Typed in its own editor\n");
    expect(changes).toEqual(["title Typed in its own editor\n"]);
    const opens = memory.calls.openTextDocument.length;
    expect(await text.write(TEA, "title Typed in its own editor\n")).toBe(true);
    expect(memory.calls.openTextDocument).toHaveLength(opens);
    expect(memory.document(FILE)?.getText()).toBe(TEA);
  });

  test("leaves a change of the file to VS Code while the document is open: told once, by the document, and the file is not asked for", async () => {
    const { memory, text, changes } = await opened();
    const asked = memory.calls.stat.length;
    memory.disk.write(FILE, "title From Git\n");
    text.file("changed");
    text.file("created");
    await settled();
    expect(changes).toEqual(["title From Git\n"]);
    expect(memory.calls.stat).toHaveLength(asked);
  });
});

describe("a file that goes and comes back", () => {
  test("is told as gone once, refuses a write meanwhile, and tells its text when it is back, the same one too", async () => {
    const { memory, text, changes, gone } = await opened();
    memory.disk.remove(FILE);
    text.file("deleted");
    text.file("deleted");
    expect(gone()).toBe(1);
    expect(await text.write(MINE, TEA)).toBe(false);
    memory.disk.write(FILE, TEA);
    text.file("created");
    await settled();
    expect(changes).toEqual([TEA]);
    expect(await text.write(MINE, TEA)).toBe(true);
    expect(memory.document(FILE)?.getText()).toBe(MINE);
  });

  test("stays gone when what comes back is a link, and when it went again before it was read", async () => {
    const { memory, text, changes } = await opened({
      [FILE]: TEA,
      "/outside/secret.owm": "secret\n",
    });
    memory.disk.remove(FILE);
    text.file("deleted");
    memory.disk.link(FILE, "/outside/secret.owm");
    text.file("created");
    await settled();
    expect(changes).toEqual([]);
    expect(await text.write(MINE, TEA)).toBe(false);
    memory.disk.remove(FILE);
    text.file("created");
    await settled();
    expect(changes).toEqual([]);
  });

  test("keeps what a person types into the document of a file that is gone to itself", async () => {
    const { memory, text, changes } = await opened();
    memory.type(FILE, "title Typed\n");
    memory.disk.remove(FILE);
    text.file("deleted");
    // VS Code keeps the dirty document of a file that went: the board writes nothing into it
    expect(await text.write(MINE, "title Typed\n")).toBe(false);
    expect(memory.applied).toEqual([]);
    memory.type(FILE, "title Typed into a file that is gone\n");
    expect(changes).toEqual(["title Typed\n"]);
    // the person saves, which makes the file again
    memory.save(FILE);
    text.file("created");
    await settled();
    expect(changes.at(-1)).toBe("title Typed into a file that is gone\n");
  });

  test("follows a root that is another one: gone, then the text of the file the path names there", async () => {
    const { memory, text, changes, gone } = await opened({
      [FILE]: TEA,
      "/other/models/tea.owm": "title Other\n",
    });
    // the root is looked for again and is the one it was: nothing happens to the text
    text.moved(MemoryUri.file(FILE));
    await settled();
    expect(gone()).toBe(0);
    expect(changes).toEqual([]);
    text.moved(MemoryUri.file("/other/models/tea.owm"));
    expect(gone()).toBe(1);
    await settled();
    expect(changes).toEqual(["title Other\n"]);
    // the first file is nobody's now
    memory.type(FILE, "title Typed in the old file\n");
    expect(changes).toHaveLength(1);
    expect(await text.write("title Mine\n", "title Other\n")).toBe(true);
    expect(memory.document("/other/models/tea.owm")?.getText()).toBe("title Mine\n");
    text.moved(undefined);
    expect(gone()).toBe(2);
    expect(await text.write("title Late\n", "title Mine\n")).toBe(false);
    // the same root again changes nothing
    text.moved(undefined);
    expect(gone()).toBe(2);
  });
});

describe("a file VS Code names in another way than the board's path", () => {
  test("is followed by the document's own URI: a disk that folds case has one name for Tea.owm and tea.owm", async () => {
    const memory = createMemoryVsCode({ [FILE]: TEA }, { workspaceFolders: ["/repo"] });
    const { workspace } = memory.vscode;
    const folded = (uri: MemoryUri): MemoryUri => uri.with({ path: uri.path.toLowerCase() });
    const stat = workspace.fs.stat;
    const openTextDocument = workspace.openTextDocument;
    workspace.fs.stat = (uri) => stat(folded(uri));
    workspace.openTextDocument = (uri) => openTextDocument(folded(uri));
    const text = await openDocumentText(
      memory.vscode,
      "models/Tea.owm",
      MemoryUri.file("/repo/models/Tea.owm"),
    );
    const changes: string[] = [];
    text.onChange((changed) => changes.push(changed));
    expect(await text.write(MINE, TEA)).toBe(true);
    expect(memory.document(FILE)?.getText()).toBe(MINE);
    memory.type(FILE, "title Typed\n");
    expect(changes).toEqual(["title Typed\n"]);
    // the root is looked for again and names the file as the board does: it is the same file
    text.moved(MemoryUri.file("/repo/models/Tea.owm"));
    await settled();
    expect(changes).toEqual(["title Typed\n"]);
  });
});

describe("a read that answers after its root was left", () => {
  test("is dropped: the text holds no document of a file it no longer names", async () => {
    const { memory, text, changes } = await opened();
    memory.closeDocument(FILE);
    memory.disk.unwatched(() => memory.disk.write(FILE, "title Read too late\n"));
    // the file is read again, and the root goes while VS Code still opens it
    text.file("changed");
    text.moved(undefined);
    await settled();
    expect(changes).toEqual([]);
    expect(text.text()).toBe(TEA);
  });
});

describe("a file a board does not open as a model", () => {
  async function refused(prepare: (memory: MemoryVsCode) => void): Promise<{
    message: string;
    memory: MemoryVsCode;
  }> {
    const memory = createMemoryVsCode(
      { [FILE]: TEA, "/outside/secret.owm": "secret\n" },
      { workspaceFolders: ["/repo"] },
    );
    prepare(memory);
    const message = await openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE)).then(
      () => "opened",
      (error: Error) => error.message,
    );
    return { message, memory };
  }

  test("is one that is not there", async () => {
    const { message } = await refused((memory) => memory.disk.remove(FILE));
    expect(message).toBe("models/tea.owm does not exist");
  });

  test("is a link, which VS Code is never asked to open", async () => {
    const { message, memory } = await refused((disk) => {
      disk.disk.remove(FILE);
      disk.disk.link(FILE, "/outside/secret.owm");
    });
    expect(message).toBe("models/tea.owm is a link, and a board opens no link");
    expect(memory.calls.openTextDocument).toEqual([]);
    expect(memory.calls.readFile).toEqual([]);
  });

  test("is a folder of that name", async () => {
    const { message } = await refused((memory) => {
      memory.disk.remove(FILE);
      memory.disk.folder(FILE);
    });
    expect(message).toBe("models/tea.owm is no file");
  });

  test("is one above the size limit, which is not read", async () => {
    const { message, memory } = await refused((disk) =>
      disk.disk.write(FILE, new Uint8Array(TEXT_LIMIT_BYTES + 1)),
    );
    expect(message).toBe("models/tea.owm is larger than 2 MiB, too large for a board");
    expect(memory.calls.openTextDocument).toEqual([]);
    expect(memory.calls.readFile).toEqual([]);
  });

  test("but one of exactly the limit is opened", async () => {
    const { message } = await refused((memory) =>
      memory.disk.write(FILE, new Uint8Array(TEXT_LIMIT_BYTES).fill(0x61)),
    );
    expect(message).toBe("opened");
  });

  test("is one VS Code cannot open, said without VS Code's own words", async () => {
    const memory = createMemoryVsCode({ [FILE]: TEA });
    memory.vscode.workspace.openTextDocument = () =>
      Promise.reject(new Error("cannot open file:///repo/models/tea.owm. Detail: binary"));
    await expect(openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE))).rejects.toThrow(
      /^models\/tea\.owm cannot be read as a text$/,
    );
  });

  test("is read-only where the file's permissions say so", async () => {
    const memory = createMemoryVsCode({ [FILE]: TEA });
    memory.disk.readOnly(FILE);
    const text = await openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE));
    expect(text.readOnly).toBe(true);
  });

  test("is a file behind a linked folder, at any depth: every folder on the way is asked, and nothing about the file", async () => {
    // stat names a file itself and never the way to it: behind the link this one is a plain file
    const memory = createMemoryVsCode({
      "/outside/secret.owm": "secret\n",
      "/outside/deep/er/secret.owm": "secret\n",
    });
    memory.disk.link("/repo/linked", "/outside");
    for (const path of ["linked/secret.owm", "linked/deep/er/secret.owm"]) {
      await expect(
        openDocumentText(memory.vscode, path, MemoryUri.file(`/repo/${path}`)),
      ).rejects.toThrow(`${path} is behind a link, and a board opens no link`);
    }
    expect(memory.calls.stat).toEqual(["/repo/linked", "/repo/linked"]);
    expect(memory.calls.openTextDocument).toEqual([]);
    expect(memory.calls.readFile).toEqual([]);
  });

  test("is a file below a link that is deeper on the way, behind folders that are none", async () => {
    const memory = createMemoryVsCode({
      "/outside/secret.owm": "secret\n",
      "/repo/a/b/c.owm": TEA,
    });
    memory.disk.link("/repo/a/b/linked", "/outside");
    await expect(
      openDocumentText(
        memory.vscode,
        "a/b/linked/secret.owm",
        MemoryUri.file("/repo/a/b/linked/secret.owm"),
      ),
    ).rejects.toThrow("a/b/linked/secret.owm is behind a link, and a board opens no link");
    expect(memory.calls.stat).toEqual(["/repo/a", "/repo/a/b", "/repo/a/b/linked"]);
    // its neighbour behind the same plain folders opens
    const text = await openDocumentText(
      memory.vscode,
      "a/b/c.owm",
      MemoryUri.file("/repo/a/b/c.owm"),
    );
    expect(text.text()).toBe(TEA);
  });

  test("is not one whose folder is not there: that file does not exist, and no link is made up", async () => {
    const memory = createMemoryVsCode({});
    await expect(
      openDocumentText(memory.vscode, "none/tea.owm", MemoryUri.file("/repo/none/tea.owm")),
    ).rejects.toThrow("none/tea.owm does not exist");
  });
});

describe("a folder that turns into a link under an open text", () => {
  test("ends the text's writes once VS Code let go of the document: it is not opened again through the link", async () => {
    // the file behind the link has the very text the write was made on: only the way tells them apart
    const memory = createMemoryVsCode({ [FILE]: TEA, "/outside/tea.owm": TEA });
    const text = await openDocumentText(memory.vscode, PATH, MemoryUri.file(FILE));
    memory.closeDocument(FILE);
    memory.disk.remove("/repo/models");
    memory.disk.link("/repo/models", "/outside");
    const opens = memory.calls.openTextDocument.length;
    expect(await text.write(MINE, TEA)).toBe(false);
    expect(memory.calls.openTextDocument).toHaveLength(opens);
    expect(memory.applied).toEqual([]);
  });
});

describe("a write that would make a model larger than a board opens", () => {
  const filled = (bytes: number): string => `title Tea\n${"a".repeat(bytes - 10)}`;

  test("is refused before VS Code is handed an edit: the document keeps its text and stays clean", async () => {
    const { memory, text, changes } = await opened();
    expect(await text.write(filled(TEXT_LIMIT_BYTES + 1), TEA)).toBe(false);
    expect(memory.applied).toEqual([]);
    expect(memory.document(FILE)).toMatchObject({ isDirty: false, version: 1 });
    expect(text.text()).toBe(TEA);
    await settled();
    expect(changes).toEqual([]);
    // and the next write of a size a board opens lands
    expect(await text.write(MINE, TEA)).toBe(true);
  });

  test("is taken at exactly the limit, which is the size a board still opens", async () => {
    const { memory, text } = await opened();
    const most = filled(TEXT_LIMIT_BYTES);
    expect(await text.write(most, TEA)).toBe(true);
    expect(memory.document(FILE)?.getText()).toBe(most);
  });

  test("is counted in bytes as the file has them, not in letters", async () => {
    const { memory, text } = await opened();
    // three bytes each: a third of the limit in letters is the limit in bytes
    const letters = Math.floor(TEXT_LIMIT_BYTES / 3);
    expect(await text.write("\u20ac".repeat(letters + 1), TEA)).toBe(false);
    expect(memory.applied).toEqual([]);
    expect(await text.write("\u20ac".repeat(letters), TEA)).toBe(true);
  });

  test.each([
    ["", 0],
    ["abc", 3],
    ["\u00e9", 2],
    ["\u20ac", 3],
    ["\ud83d\ude00", 4],
    ["a\u00e9\u20ac\ud83d\ude00", 10],
  ])("counts %j as %i bytes", (value, bytes) => {
    expect(exceedsBytes(value, bytes)).toBe(false);
    if (bytes > 0) expect(exceedsBytes(value, bytes - 1)).toBe(true);
  });
});
