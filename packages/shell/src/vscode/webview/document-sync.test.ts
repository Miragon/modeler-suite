import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPEARANCE_MESSAGE_TYPE,
  connectDocumentSync,
  type DocumentImportContext,
  type DocumentSync,
  type DocumentSyncOptions,
} from "./index.js";

function fromExtension(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

/** A promise with its resolve function, for an import that ends when the test says so. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

const connected: DocumentSync[] = [];

afterEach(() => {
  for (const sync of connected.splice(0)) sync.disconnect();
  vi.restoreAllMocks();
});

function connect(options: Partial<DocumentSyncOptions> = {}) {
  const posted: unknown[] = [];
  const imports: Array<{ text: string; context: DocumentImportContext }> = [];
  let canvasText = "";
  const sync = connectDocumentSync({
    api: { postMessage: (message) => posted.push(message) },
    importText: (text, context) => {
      imports.push({ text, context });
      canvasText = text;
      return Promise.resolve(true);
    },
    exportText: () => canvasText,
    ...options,
  });
  connected.push(sync);
  return {
    sync,
    posted,
    imports,
    edit(text: string) {
      canvasText = text;
      sync.pushEdit();
    },
  };
}

describe("connectDocumentSync", () => {
  it("posts ready once, on connect", () => {
    const { posted } = connect();
    expect(posted).toEqual([{ type: "ready" }]);
  });

  it("imports the init text first, then every update with the text the canvas showed last", async () => {
    const { sync, imports } = connect();
    fromExtension({ type: "init", text: "title A\n" });
    await sync.ready;
    fromExtension({ type: "update", text: "title B\n" });
    await sync.imported();

    expect(imports).toEqual([
      { text: "title A\n", context: { first: true, reconciledText: "" } },
      { text: "title B\n", context: { first: false, reconciledText: "title A\n" } },
    ]);
  });

  it("imports one text at a time, in the order the texts arrived", async () => {
    const first = deferred<boolean>();
    const started: string[] = [];
    const { sync } = connect({
      importText: (text) => {
        started.push(text);
        return text === "title A\n" ? first.promise : Promise.resolve(true);
      },
    });
    fromExtension({ type: "init", text: "title A\n" });
    fromExtension({ type: "update", text: "title B\n" });
    fromExtension({ type: "update", text: "title C\n" });
    await Promise.resolve();
    expect(started).toEqual(["title A\n"]);

    first.resolve(true);
    await sync.imported();
    expect(started).toEqual(["title A\n", "title B\n", "title C\n"]);
  });

  it("keeps the text the canvas showed when it refuses one, and is ready all the same", async () => {
    const contexts: DocumentImportContext[] = [];
    const { sync } = connect({
      importText: (text, context) => {
        contexts.push(context);
        return Promise.resolve(!text.includes("typo"));
      },
    });
    fromExtension({ type: "init", text: "title A\n" });
    fromExtension({ type: "update", text: "title A typo\n" });
    fromExtension({ type: "update", text: "title A\n" });
    await sync.ready;
    await sync.imported();
    expect(contexts.map((context) => context.reconciledText)).toEqual([
      "",
      "title A\n",
      "title A\n",
    ]);
  });

  it("logs an import that throws, and goes on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sync, imports } = connect({
      importText: (text, context) => {
        imports.push({ text, context });
        return text === "boom" ? Promise.reject(new Error("boom")) : Promise.resolve(true);
      },
    });
    fromExtension({ type: "init", text: "boom" });
    await sync.ready;
    fromExtension({ type: "update", text: "title B\n" });
    await sync.imported();

    expect(error).toHaveBeenCalledWith("@miragon/modeler-shell: import failed", expect.any(Error));
    expect(imports.at(-1)?.context).toEqual({ first: false, reconciledText: "" });
  });

  it("ignores init and update without a text", async () => {
    const { sync, imports } = connect();
    fromExtension({ type: "init" });
    fromExtension({ type: "update", text: 42 });
    await sync.imported();
    expect(imports).toEqual([]);
  });
});

describe("connectDocumentSync: edits", () => {
  it("posts nothing before the first import, which the canvas does not show yet", () => {
    const { posted, edit } = connect();
    edit("title X\n");
    expect(posted).toEqual([{ type: "ready" }]);
  });

  it("posts a changed document once, and the same document never again", async () => {
    const { sync, posted, edit } = connect();
    fromExtension({ type: "init", text: "title A\n" });
    await sync.ready;

    edit("title A\n");
    edit("title B\n");
    edit("title B\n");
    expect(posted).toEqual([{ type: "ready" }, { type: "edit", text: "title B\n" }]);
  });

  it("writes from the text the canvas showed last", async () => {
    const exportText = vi.fn((reconciledText: string) => `${reconciledText}// kept\n`);
    const { sync, posted } = connect({ exportText });
    fromExtension({ type: "init", text: "title A\n" });
    await sync.ready;

    sync.pushEdit();
    sync.pushEdit();
    expect(exportText.mock.calls.map(([text]) => text)).toEqual([
      "title A\n",
      "title A\n// kept\n",
    ]);
    expect(posted.at(-1)).toEqual({ type: "edit", text: "title A\n// kept\n// kept\n" });
  });

  it("posts nothing while the canvas may not write", async () => {
    let writable = false;
    const exportText = vi.fn(() => "title B\n");
    const { sync, posted } = connect({ canWrite: () => writable, exportText });
    fromExtension({ type: "init", text: "title A\n" });
    await sync.ready;

    sync.pushEdit();
    expect(exportText).not.toHaveBeenCalled();
    writable = true;
    sync.pushEdit();
    expect(posted.at(-1)).toEqual({ type: "edit", text: "title B\n" });
  });

  it("compares an update with the text of the last edit", async () => {
    const { sync, imports, edit } = connect();
    fromExtension({ type: "init", text: "title A\n" });
    await sync.ready;
    edit("title B\n");
    fromExtension({ type: "update", text: "title B\r\n" });
    await sync.imported();
    expect(imports.at(-1)?.context.reconciledText).toBe("title B\n");
  });
});

describe("connectDocumentSync: the extension's other messages", () => {
  it("hands the problems to the pill", () => {
    const onProblems = vi.fn();
    connect({ onProblems });
    fromExtension({ type: "problems", count: 3, errors: 1 });
    fromExtension({ type: "problems", count: -1, errors: 0 });
    fromExtension({ type: "problems", count: 2 });
    expect(onProblems.mock.calls).toEqual([[{ count: 3, errors: 1 }]]);
  });

  it("runs a command it owns, nothing inherited", () => {
    const fitView = vi.fn();
    connect({ commands: { fitView } });
    fromExtension({ type: "command", name: "fitView" });
    fromExtension({ type: "command", name: "constructor" });
    fromExtension({ type: "command", name: "toString" });
    fromExtension({ type: "command", name: "exportPng" });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("hands the modeler's own messages over, never the shell's appearance or a non-message", () => {
    const onMessage = vi.fn();
    connect({ onMessage });
    fromExtension({ type: APPEARANCE_MESSAGE_TYPE, appearance: { theme: "light" } });
    fromExtension({ type: "flush", id: 1 });
    fromExtension("flush");
    fromExtension({ kind: "flush" });
    expect(onMessage.mock.calls).toEqual([[{ type: "flush", id: 1 }]]);
  });

  it("posts the pill's and the empty-file hint's actions and the modeler's own messages", () => {
    const { sync, posted } = connect();
    sync.showProblems();
    sync.insertExample();
    sync.post({ type: "export", format: "svg", data: "<svg/>" });
    expect(posted).toEqual([
      { type: "ready" },
      { type: "showProblems" },
      { type: "insertExample" },
      { type: "export", format: "svg", data: "<svg/>" },
    ]);
  });

  it("stops listening when disconnected", async () => {
    const { sync, imports } = connect();
    sync.disconnect();
    fromExtension({ type: "init", text: "title A\n" });
    await sync.imported();
    expect(imports).toEqual([]);
  });
});
