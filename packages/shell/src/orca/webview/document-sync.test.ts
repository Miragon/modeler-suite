import { afterEach, describe, expect, it } from "vitest";

import { installOrcaEditorStub, type OrcaStubWindow } from "../../testing/orca-stub.js";
import { connectOrcaDocumentSync, type OrcaDocumentSyncOptions } from "./document-sync.js";

const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function canvas(options: Partial<OrcaDocumentSyncOptions> = {}) {
  const imported: string[] = [];
  let shown = "";
  return {
    imported,
    edit(text: string) {
      shown = text;
    },
    options: {
      importText: async (text: string) => {
        imported.push(text);
        shown = text;
        return !text.includes("broken");
      },
      exportText: () => shown,
      debounceMs: 0,
      ...options,
    } satisfies OrcaDocumentSyncOptions,
  };
}

afterEach(() => {
  Reflect.deleteProperty(window as OrcaStubWindow, "orca");
  Reflect.deleteProperty(window as OrcaStubWindow, "__modelerShellOrcaStub");
});

describe("connectOrcaDocumentSync", () => {
  it("imports the first document, then an outside write to the clean tab", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    orca.replace("a\nb\n");
    await later();
    await sync.imported();
    expect(board.imported).toEqual(["a\n", "a\nb\n"]);
  });

  it("sends a canvas edit, and a save writes it", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    board.edit("a\nmine\n");
    sync.pushEdit();
    await orca.save();
    expect(orca.disk).toBe("a\nmine\n");
    expect(orca.merges).toBe(false);
  });

  it("sends nothing before the first import, while read-only or while the canvas refuses writes", async () => {
    const orca = installOrcaEditorStub({ text: "a\n", readOnly: true });
    let writable = true;
    const board = canvas({ canWrite: () => writable });
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    expect(sync.readOnly).toBe(true);
    board.edit("a\nmine\n");
    sync.pushEdit();
    writable = false;
    sync.pushEdit();
    await orca.idle();
    expect(orca.edits).toEqual([]);
  });

  it("leaves an agent's write under unsaved edits to Orca's banner, and shows it on reload", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    board.edit("a\nmine\n");
    sync.pushEdit();
    await orca.idle();
    expect(orca.dirty).toBe(true);

    orca.diskWriteWhileDirty("a\nagent\n");
    await later();
    await sync.imported();
    expect(orca.banner).toBe(true);
    expect(board.imported).toEqual(["a\n"]);
    expect(orca.text).toBe("a\nmine\n");

    orca.reload();
    await later();
    await sync.imported();
    expect(board.imported.at(-1)).toBe("a\nagent\n");
  });

  it("shows the outside write when it meets an edit still in flight", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    board.edit("a\nmine\n");
    orca.replace("a\nagent\n");
    sync.pushEdit();
    await later();
    await sync.imported();
    await orca.idle();
    expect(orca.edits.map((edit) => edit.refused)).toEqual(["conflict"]);
    expect(orca.text).toBe("a\nagent\n");
    expect(board.imported.at(-1)).toBe("a\nagent\n");
  });

  it("writes and shows an inserted example", async () => {
    const orca = installOrcaEditorStub({ text: "" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    sync.replaceDocument("example\n");
    await sync.imported();
    await orca.save();
    expect(board.imported).toEqual(["", "example\n"]);
    expect(orca.disk).toBe("example\n");
  });

  it("keeps the last valid text after a refused import and imports the next one", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    orca.replace("broken\n");
    await later();
    await sync.imported();
    board.edit("a\nmine\n");
    sync.pushEdit();
    await orca.idle();
    expect(orca.edits.at(-1)?.text).toBe("a\nmine\n");
  });

  it("stops importing once disconnected", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    sync.disconnect();
    orca.replace("b\n");
    await later();
    await sync.imported();
    expect(board.imported).toEqual(["a\n"]);
  });

  it("throws outside an Orca editor frame", async () => {
    await expect(connectOrcaDocumentSync(canvas().options)).rejects.toThrow(/Orca custom editor/);
  });
});
