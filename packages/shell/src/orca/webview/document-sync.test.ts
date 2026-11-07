import { afterEach, describe, expect, it, vi } from "vitest";

import { installOrcaEditorStub, type OrcaStubWindow } from "../../testing/orca-stub.js";
import { connectOrcaDocumentSync, type OrcaDocumentSyncOptions } from "./document-sync.js";

const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

class Conflict extends Error {
  override readonly name = "MergeConflictError";
}

/** Lines merge: each side's new lines are kept; a line removed on one side is gone. */
function mergeLines(base: string, external: string, draft: string): string {
  const lines = (text: string) => text.split("\n").filter((line) => line !== "");
  const removed = new Set(lines(base).filter((line) => !lines(external).includes(line)));
  const added = lines(draft).filter((line) => !lines(base).includes(line));
  if (added.some((line) => line.startsWith("!"))) throw new Conflict("both changed");
  const merged = [...lines(external), ...added].filter((line) => !removed.has(line));
  return merged.map((line) => `${line}\n`).join("");
}

function canvas(options: Partial<OrcaDocumentSyncOptions> = {}) {
  const imported: string[] = [];
  let shown = "";
  const conflicts: unknown[] = [];
  return {
    imported,
    conflicts,
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
      merge: mergeLines,
      onMergeConflict: (error: unknown) => conflicts.push(error),
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
    expect(orca.merges).toBe(true);
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

  it("merges an agent's write under unsaved edits into the canvas, without the banner", async () => {
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
    await orca.idle();
    expect(board.imported.at(-1)).toBe("a\nagent\nmine\n");
    expect(orca.text).toBe("a\nagent\nmine\n");
    expect(orca.dirty).toBe(true);
    expect(orca.banner).toBe(false);
  });

  it("leaves a conflicting write to Orca's banner and reports the conflict", async () => {
    const orca = installOrcaEditorStub({ text: "a\n" });
    const board = canvas();
    const sync = await connectOrcaDocumentSync(board.options);
    await sync.ready;
    board.edit("a\n!mine\n");
    sync.pushEdit();
    await orca.idle();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      orca.diskWriteWhileDirty("a\nagent\n");
      await later();
      await sync.imported();
    } finally {
      error.mockRestore();
    }
    expect(orca.banner).toBe(true);
    expect(board.conflicts).toHaveLength(1);
    expect(board.imported).toEqual(["a\n"]);
    expect(orca.text).toBe("a\n!mine\n");

    orca.reload();
    await later();
    await sync.imported();
    expect(board.imported.at(-1)).toBe("a\nagent\n");
  });

  it("merges an edit Orca refused because the file changed while it was in flight", async () => {
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
    expect(orca.edits.map((edit) => edit.refused)).toEqual(["conflict", undefined]);
    expect(orca.text).toBe("a\nagent\nmine\n");
    expect(board.imported.at(-1)).toBe("a\nagent\nmine\n");
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
