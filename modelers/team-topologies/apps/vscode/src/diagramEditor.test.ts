// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { StubWebviewPanel } from "@miragon/modeler-shell/testing/vscode-stub";
import {
  DiagnosticSeverity,
  TextDocumentSaveReason,
  openTextDocument,
  resetVsCodeHost,
  saveDocument,
  vscodeHost,
} from "./vscodeHost.test-support.js";

vi.mock("vscode", async () => (await import("./vscodeHost.test-support.js")).vscodeModule);
vi.mock("./exportImage.js", () => ({ exportImage: vi.fn(() => Promise.resolve(undefined)) }));

const { exportImage } = await import("./exportImage.js");
const { FLUSH_TIMEOUT_MS, INSERT_EXAMPLE_FAILED, registerDiagramEditor } =
  await import("./diagramEditor.js");
const { DIAGRAM_VIEW_TYPE } = await import("./diagramEditorOptions.js");
const { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } = await import("./examples.js");
const { documentProblems } = await import("./problems.js");

const RENAMED = EXAMPLE_MAP.replace('"label": "Checkout & Payments"', '"label": "Payments"');
const DANGLING = EXAMPLE_MAP.replace(
  '"attachedTo": "int_checkout_fraud"',
  '"attachedTo": "nowhere"',
);
const BROKEN = EXAMPLE_MAP.replace('"type": "platform",', '"type": "platform"');

/** The extension's DiagnosticCollection, as far as the editor writes it. */
function diagnosticCollection(): {
  collection: vscode.DiagnosticCollection;
  entries: Map<string, readonly vscode.Diagnostic[]>;
} {
  const entries = new Map<string, readonly vscode.Diagnostic[]>();
  const collection = {
    set: (uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]) =>
      entries.set(uri.toString(), diagnostics),
    delete: (uri: vscode.Uri) => entries.delete(uri.toString()),
  };
  return { collection: collection as unknown as vscode.DiagnosticCollection, entries };
}

function registerForTest() {
  const host = vscodeHost();
  const problems = diagnosticCollection();
  registerDiagramEditor(
    { extensionUri: host.extensionUri as unknown as vscode.Uri },
    problems.collection,
  );
  async function open(text: string, path = "/checkout.tt") {
    const document = openTextDocument(path, text);
    const panel = await host.openCustomEditor(DIAGRAM_VIEW_TYPE, document);
    await panel.receive({ type: "ready" });
    return { document, panel };
  }
  return { host, problems, open };
}

function posted(panel: StubWebviewPanel, type: string): unknown[] {
  return panel.posted.filter((message) => (message as { type?: unknown }).type === type);
}

function countsOf(text: string): { type: "problems"; count: number; errors: number } {
  const problems = documentProblems(text);
  return {
    type: "problems",
    count: problems.length,
    errors: problems.filter((problem) => problem.severity === "error").length,
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetVsCodeHost();
  vi.mocked(exportImage).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the diagram editor on the shell's document plumbing", () => {
  it("answers ready with the document and counts its errors and warnings on the pill", async () => {
    const { problems, open } = registerForTest();
    const { document, panel } = await open(DANGLING);

    expect(posted(panel, "init")).toEqual([{ type: "init", text: DANGLING }]);
    expect(posted(panel, "problems")).toEqual([countsOf(DANGLING)]);
    expect(countsOf(DANGLING)).toMatchObject({ count: 1, errors: 0 });
    expect(
      problems.entries.get(document.uri.toString())?.map((diagnostic) => diagnostic.severity),
    ).toEqual([DiagnosticSeverity.Warning]);
  });

  it("imports a change of the text editor and counts its problems again", async () => {
    const { host, open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);

    host.replaceText(document, BROKEN);

    expect(posted(panel, "update")).toEqual([{ type: "update", text: BROKEN }]);
    expect(posted(panel, "problems").at(-1)).toEqual(countsOf(BROKEN));
    expect(countsOf(BROKEN).errors).toBeGreaterThan(0);
  });

  it("writes a canvas edit as one minimal line edit, whose echo it does not post back", async () => {
    const { host, open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);

    await panel.receive({ type: "edit", text: RENAMED });

    expect(document.getText()).toBe(RENAMED);
    expect(host.appliedEdits).toHaveLength(1);
    const [edit] = host.appliedEdits;
    expect(edit!.range.end.line - edit!.range.start.line).toBe(1);
    expect(edit!.text).toBe('      "label": "Payments",\n');
    expect(posted(panel, "update")).toEqual([]);
  });

  it("inserts the example as one edit, which the webview imports", async () => {
    const { host, open } = registerForTest();
    const { document, panel } = await open(EMPTY_MAP);

    await panel.receive({ type: "insertExample" });

    expect(document.getText()).toBe(withExampleInserted(EMPTY_MAP));
    expect(host.appliedEdits).toHaveLength(1);
    expect(posted(panel, "update")).toEqual([{ type: "update", text: document.getText() }]);
  });

  it("says why the example can't go into a file with problems, and leaves the file alone", async () => {
    const { host, open } = registerForTest();
    const { panel } = await open(BROKEN);

    await panel.receive({ type: "insertExample" });

    expect(host.appliedEdits).toEqual([]);
    expect(host.notifications).toEqual([{ severity: "error", message: INSERT_EXAMPLE_FAILED }]);
  });

  it("saves an export next to the diagram", async () => {
    const { open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);

    await panel.receive({ type: "export", format: "png", data: "iVBO", fontFallback: true });
    await panel.receive({ type: "export", format: "svg", data: "<svg/>" });

    expect(vi.mocked(exportImage).mock.calls).toEqual([
      [document.uri, { type: "export", format: "png", data: "iVBO", fontFallback: true }],
      [document.uri, { type: "export", format: "svg", data: "<svg/>" }],
    ]);
  });

  it("drops the diagram's problems when its editor closes", async () => {
    const { problems, open } = registerForTest();
    const { document, panel } = await open(DANGLING);

    panel.dispose();

    expect(problems.entries.has(document.uri.toString())).toBe(false);
  });
});

describe("a save of the text document", () => {
  it("commits the webview's draft first and waits until the edit it caused has landed", async () => {
    const { host, open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);
    const release = host.holdEdits();
    let saved = false;

    const saving = saveDocument(document).then(() => (saved = true));
    expect(posted(panel, "flush")).toEqual([{ type: "flush", id: 1 }]);
    const editing = panel.receive({ type: "edit", text: RENAMED });
    await panel.receive({ type: "flushed", id: 1 });
    await settle();
    expect(saved).toBe(false);

    release();
    await Promise.all([saving, editing]);
    expect(document.getText()).toBe(RENAMED);
  });

  it("asks only the webview of the document being saved", async () => {
    const { open } = registerForTest();
    const first = await open(EXAMPLE_MAP, "/first.tt");
    const second = await open(EXAMPLE_MAP, "/second.tt");

    const saving = saveDocument(second.document);
    await second.panel.receive({ type: "flushed", id: 1 });
    await saving;

    expect(posted(first.panel, "flush")).toEqual([]);
    expect(posted(second.panel, "flush")).toEqual([{ type: "flush", id: 1 }]);
  });

  it("leaves a field being typed in alone on an autosave after a delay", async () => {
    const { open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);

    await saveDocument(document, TextDocumentSaveReason.AfterDelay);

    expect(posted(panel, "flush")).toEqual([]);
  });

  it("saves without the draft when the webview does not answer in time", async () => {
    const { open } = registerForTest();
    const { document } = await open(EXAMPLE_MAP);
    vi.useFakeTimers();
    let saved = false;

    const saving = saveDocument(document).then(() => (saved = true));
    await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS - 1);
    expect(saved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await saving;

    expect(saved).toBe(true);
  });

  it("lets a waiting save go once the editor closed", async () => {
    const { open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);
    vi.useFakeTimers();

    const saving = saveDocument(document);
    panel.dispose();

    await expect(saving).resolves.toBeUndefined();
  });

  it("does not wait for a webview that is gone", async () => {
    const { open } = registerForTest();
    const { document, panel } = await open(EXAMPLE_MAP);
    vi.spyOn(panel.webview, "postMessage").mockResolvedValue(false);
    vi.useFakeTimers();

    await expect(saveDocument(document)).resolves.toBeUndefined();
  });
});
