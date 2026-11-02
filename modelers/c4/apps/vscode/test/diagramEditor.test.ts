import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { StubWebviewPanel } from "@miragon/modeler-shell/testing/vscode-stub";
import { EXAMPLE_NEEDS_EMPTY_FILE, EXAMPLE_NEEDS_VALID_FILE } from "../src/diagramEditor.js";
import { DIAGRAM_VIEW_TYPE, DSL_DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { EXAMPLE_DIAGRAM } from "../src/examples.js";
import { activate } from "../src/extension.js";
import { FLUSH_TIMEOUT_MS } from "../src/saveFlush.js";
import { FakeUri, TextDocumentSaveReason, fakeVsCode } from "./fakeVsCode.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

const SHOP = `workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Buys from"
    }
}
`;
const RENAMED = SHOP.replace('"Customer"', '"Shopper"');
const BESIDE = -2;
const IN_CENTER_IF_OUTSIDE_VIEWPORT = 2;

const subscriptions: Array<{ dispose(): unknown }> = [];

beforeEach(() => {
  fakeVsCode.reset();
  activate({
    extensionUri: FakeUri.file("/extension"),
    subscriptions,
  } as unknown as vscode.ExtensionContext);
});
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function open(path = "/shop/workspace.c4", text = SHOP, viewType = DIAGRAM_VIEW_TYPE) {
  const opened = await fakeVsCode.openCustomEditor(viewType, FakeUri.file(path), text);
  await opened.panel.receive({ type: "ready" });
  return opened;
}

function posted(panel: StubWebviewPanel, type: string): unknown[] {
  return panel.posted.filter((message) => (message as { type?: unknown }).type === type);
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("a save of the text document (SPEC 8.2)", () => {
  it("commits the webview's draft first and waits until the edit it caused has landed", async () => {
    const { document, panel } = await open();
    const release = fakeVsCode.holdEdits();
    let saved = false;

    const saving = fakeVsCode.saveDocument(document).then(() => (saved = true));
    expect(posted(panel, "c4.flush")).toEqual([{ type: "c4.flush", id: 1 }]);
    const editing = panel.receive({ type: "edit", text: RENAMED });
    await panel.receive({ type: "c4.flushed", id: 1 });
    await settle();
    expect(saved).toBe(false);

    release();
    await Promise.all([saving, editing]);
    expect(saved).toBe(true);
    expect(document.getText()).toBe(RENAMED);
    expect(fakeVsCode.appliedEdits).toHaveLength(1);
  });

  it("writes nothing when no field was being typed in: only the flush goes back and forth", async () => {
    const { document, panel } = await open();

    const saving = fakeVsCode.saveDocument(document);
    await panel.receive({ type: "c4.flushed", id: 1 });
    await saving;

    expect(fakeVsCode.appliedEdits).toEqual([]);
    expect(document.getText()).toBe(SHOP);
  });

  it("numbers the flushes of one editor, and an answer settles only its own", async () => {
    const { document, panel } = await open();
    let firstSaved = false;
    let secondSaved = false;

    const first = fakeVsCode.saveDocument(document).then(() => (firstSaved = true));
    const second = fakeVsCode.saveDocument(document).then(() => (secondSaved = true));
    expect(posted(panel, "c4.flush")).toEqual([
      { type: "c4.flush", id: 1 },
      { type: "c4.flush", id: 2 },
    ]);
    await panel.receive({ type: "c4.flushed", id: 2 });
    await settle();
    expect([firstSaved, secondSaved]).toEqual([false, true]);

    await panel.receive({ type: "c4.flushed", id: 1 });
    await Promise.all([first, second]);
    expect(firstSaved).toBe(true);
  });

  it("ignores an answer to a flush nobody asked for", async () => {
    const { document, panel } = await open();
    let saved = false;

    const saving = fakeVsCode.saveDocument(document).then(() => (saved = true));
    await panel.receive({ type: "c4.flushed", id: 7 });
    await panel.receive({ type: "c4.flushed", id: "1" });
    await settle();
    expect(saved).toBe(false);

    await panel.receive({ type: "c4.flushed", id: 1 });
    await saving;
    expect(saved).toBe(true);
  });

  it("asks only the webview of the document being saved", async () => {
    const first = await open("/first/workspace.c4");
    const second = await open("/second/workspace.dsl", SHOP, DSL_DIAGRAM_VIEW_TYPE);

    const saving = fakeVsCode.saveDocument(second.document);
    await second.panel.receive({ type: "c4.flushed", id: 1 });
    await saving;

    expect(posted(first.panel, "c4.flush")).toEqual([]);
    expect(posted(second.panel, "c4.flush")).toEqual([{ type: "c4.flush", id: 1 }]);
  });

  it("leaves a field being typed in alone on an autosave after a delay", async () => {
    const { document, panel } = await open();

    await fakeVsCode.saveDocument(document, TextDocumentSaveReason.AfterDelay);

    expect(posted(panel, "c4.flush")).toEqual([]);
  });

  it.each([
    ["a save on a focus change", TextDocumentSaveReason.FocusOut],
    ["a save the user asked for", TextDocumentSaveReason.Manual],
  ])("commits the draft on %s", async (_name, reason) => {
    const { document, panel } = await open();

    const saving = fakeVsCode.saveDocument(document, reason);
    await panel.receive({ type: "c4.flushed", id: 1 });
    await saving;

    expect(posted(panel, "c4.flush")).toEqual([{ type: "c4.flush", id: 1 }]);
  });

  it("saves without the draft when the webview does not answer in time", async () => {
    const { document } = await open();
    vi.useFakeTimers();
    let saved = false;

    const saving = fakeVsCode.saveDocument(document).then(() => (saved = true));
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS - 1);
    expect(saved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await saving;

    expect(saved).toBe(true);
  });

  it("lets a waiting save go once the editor closed", async () => {
    const { document, panel } = await open();
    vi.useFakeTimers();

    const saving = fakeVsCode.saveDocument(document);
    panel.dispose();

    await expect(saving).resolves.toBeUndefined();
  });

  it("asks a closed editor nothing", async () => {
    const { document, panel } = await open();
    panel.dispose();

    await fakeVsCode.saveDocument(document);

    expect(posted(panel, "c4.flush")).toEqual([]);
  });

  it("does not wait for a webview that is gone", async () => {
    const { document, panel } = await open();
    vi.spyOn(panel.webview, "postMessage").mockResolvedValue(false);
    vi.useFakeTimers();

    await expect(fakeVsCode.saveDocument(document)).resolves.toBeUndefined();
  });
});

// Reopen Editor With… › C4 Modeler on a .dsl file opens the editor of .dsl files.
describe("the editor of a .dsl file", () => {
  const openDsl = (text = SHOP) => open("/shop/workspace.dsl", text, DSL_DIAGRAM_VIEW_TYPE);

  it("commits the webview's draft before a save", async () => {
    const { document, panel } = await openDsl();

    const saving = fakeVsCode.saveDocument(document);
    expect(posted(panel, "c4.flush")).toEqual([{ type: "c4.flush", id: 1 }]);
    await panel.receive({ type: "c4.flushed", id: 1 });
    await saving;
  });

  it("writes the example into a blank file and shows a line of the source", async () => {
    const { document, panel } = await openDsl("");

    await panel.receive({ type: "insertExample" });
    await panel.receive({ type: "c4.revealSource", line: 2 });

    expect(document.getText()).toBe(EXAMPLE_DIAGRAM);
    expect(fakeVsCode.shownTextDocuments.map((shown) => shown.document)).toEqual([document]);
  });

  it("keeps its problems in the c4 collection", async () => {
    const { document } = await openDsl(
      'workspace {\n    model {\n        a = person "A"\n        a = person "B"\n    }\n}\n',
    );

    const collection = fakeVsCode.diagnosticCollections.find(
      (candidate) => candidate.name === "c4",
    );
    expect(collection?.get(document.uri as FakeUri)?.map((finding) => finding.code)).toEqual([
      "c4.duplicate-identifier",
    ]);
  });
});

describe("Insert example of the empty-file hint (guide §13.5)", () => {
  it("writes the example into a blank file as one edit", async () => {
    const { document, panel } = await open("/shop/workspace.c4", "");

    await panel.receive({ type: "insertExample" });

    expect(document.getText()).toBe(EXAMPLE_DIAGRAM);
    expect(fakeVsCode.appliedEdits).toHaveLength(1);
    expect(fakeVsCode.notifications).toEqual([]);
  });

  // The hint shows while the model has no element, which also holds for these files.
  it.each([
    [
      "views but no element",
      "workspace {\n    model {\n    }\n    views {\n        systemLandscape {\n            include *\n        }\n    }\n}\n",
      EXAMPLE_NEEDS_EMPTY_FILE,
    ],
    ["errors", "workspace {\n    model {\n", EXAMPLE_NEEDS_VALID_FILE],
  ])("says why it leaves a file with %s alone", async (_name, text, message) => {
    const { document, panel } = await open("/shop/workspace.c4", text);

    await panel.receive({ type: "insertExample" });

    expect(document.getText()).toBe(text);
    expect(fakeVsCode.appliedEdits).toEqual([]);
    expect(fakeVsCode.notifications).toEqual([{ severity: "error", message, items: [] }]);
  });
});

describe("Defined on line N in the inspector (SPEC 5.6)", () => {
  it("shows the line beside the diagram, centred", async () => {
    const { document, panel } = await open();

    await panel.receive({ type: "c4.revealSource", line: 3 });

    expect(fakeVsCode.shownTextDocuments).toHaveLength(1);
    const [shown] = fakeVsCode.shownTextDocuments;
    expect(shown?.document).toBe(document);
    expect(shown?.viewColumn).toBe(BESIDE);
    expect(shown?.selection).toMatchObject({
      start: { line: 2, character: 0 },
      end: { line: 2, character: 0 },
    });
    expect(shown?.revealed).toEqual([
      { range: shown?.selection, type: IN_CENTER_IF_OUTSIDE_VIEWPORT },
    ]);
  });

  it("uses the text editor that already shows the document", async () => {
    const { document, panel } = await open();
    fakeVsCode.showTextEditor(document, 1);

    await panel.receive({ type: "c4.revealSource", line: 1 });

    expect(fakeVsCode.shownTextDocuments.map((shown) => shown.viewColumn)).toEqual([1]);
  });

  it("stops at the last line of a document that got shorter", async () => {
    const { panel } = await open();

    await panel.receive({ type: "c4.revealSource", line: 99 });

    const lastLine = SHOP.split("\n").length - 1;
    expect(fakeVsCode.shownTextDocuments[0]?.selection?.start.line).toBe(lastLine);
  });

  it.each([0, -1, 2.5, "3", undefined])("ignores the line %s", async (line) => {
    const { panel } = await open();

    await panel.receive({ type: "c4.revealSource", line });

    expect(fakeVsCode.shownTextDocuments).toEqual([]);
  });
});
