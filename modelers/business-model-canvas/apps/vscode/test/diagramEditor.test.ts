import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type WorkspaceEdit, workspace, vscodeMock } from "./__mocks__/vscode";
import { fakeDocument, installEchoingApplyEdit, openDiagram, resetApplyEdit } from "./fakes";
import { EMPTY_DOCUMENT } from "business-model-canvas-ide-editor/examples";

/**
 * The diagram editor on the shell's document plumbing, from the extension host's side: graphical
 * edits the webview produces come back as `onDidChangeTextDocument` and must be swallowed (not
 * re-imported), while genuinely external edits must reach the webview exactly once; the Problems
 * view and the pill follow the document. Verified black-box via posted messages.
 */

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

const named = (name: string): string => EMPTY_DOCUMENT.replace("New business model", name);

/** Two stickies with one explicit id: no canvas. */
const twiceAnd = (more: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    channels: {
      items: [
        { id: "twice", text: "Shop" },
        { id: "twice", text: "Fair" },
      ],
    },
    ...more,
  });
const INVALID = twiceAnd();

describe("the diagram editor: document sync", () => {
  it("posts init with the document text on `ready`, then the problem count", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const h = await openDiagram(doc);

    await h.receive({ type: "ready" });

    expect(h.posted).toEqual([
      { type: "init", text: named("A") },
      { type: "problems", count: 0, errors: 0 },
    ]);
  });

  it("swallows the echo of the webview’s own edit (no `update` posted back)", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    installEchoingApplyEdit(doc);
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("B") });

    expect(doc.getText()).toBe(named("B"));
    expect(h.updates()).toEqual([]);
  });

  it("writes one minimal edit: only the changed line, so a text editor beside keeps its cursor", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const applied = installEchoingApplyEdit(doc);
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("B") });

    expect(applied).toHaveLength(1);
    expect(applied[0]!.edits).toHaveLength(1);
    expect(applied[0]!.edits[0]!.text).toBe("  title: B\n");
  });

  it("suppresses the echoes of two edits sent without waiting for each other", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    installEchoingApplyEdit(doc);
    const h = await openDiagram(doc);

    await Promise.all([
      h.receive({ type: "edit", text: named("B") }),
      h.receive({ type: "edit", text: named("C") }),
    ]);

    expect(doc.getText()).toBe(named("C"));
    expect(h.updates()).toEqual([]);
  });

  it("recognizes the echo when the document uses CRLF line breaks", async () => {
    const doc = fakeDocument("/a.bmc", named("A").replace(/\n/g, "\r\n"));
    installEchoingApplyEdit(doc);
    workspace.applyEdit = ((original) => (edit: WorkspaceEdit) => {
      for (const change of edit.edits) change.text = change.text.replace(/\n/g, "\r\n");
      return original(edit);
    })(workspace.applyEdit);
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("B") });

    expect(doc.getText()).toBe(named("B").replace(/\n/g, "\r\n"));
    expect(h.updates()).toEqual([]);
  });

  it("forwards a genuinely external change as exactly one `update`", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const h = await openDiagram(doc);

    doc.set(named("External"));
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual([named("External")]);
  });

  it("does not applyEdit for a no-op edit (text equals current document)", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const applyEdit = vi.fn((_edit: WorkspaceEdit) => Promise.resolve(true));
    workspace.applyEdit = applyEdit;
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("A") });

    expect(applyEdit).not.toHaveBeenCalled();
  });

  it("shows the document again when VS Code refused the edit, since the canvas shows it already", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(false);
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("B") });

    expect(doc.getText()).toBe(named("A"));
    expect(h.updates()).toEqual([named("A")]);
  });

  it("forwards a later change to the refused text (it is no echo then)", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(false);
    const h = await openDiagram(doc);

    await h.receive({ type: "edit", text: named("B") });
    doc.set(named("B"));
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual([named("A"), named("B")]);
  });

  it("posts nothing for a change event without content changes (save, dirty state)", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const h = await openDiagram(doc);

    vscodeMock.fireDidChangeTextDocument(doc, []);

    expect(h.updates()).toEqual([]);
  });
});

describe("the diagram editor: problems", () => {
  it("fills the Problems view and the pill while the file is invalid, and clears both after", async () => {
    const doc = fakeDocument("/a.bmc", named("A"));
    const h = await openDiagram(doc);
    await h.receive({ type: "ready" });
    const collection = vscodeMock.diagnosticCollections()[0]!;

    doc.set(twiceAnd({ risks: {} }));
    vscodeMock.fireDidChangeTextDocument(doc);
    const found = collection.get(doc.uri)?.length ?? 0;
    expect(found).toBe(2);
    // The duplicate id keeps the file from opening; the unknown key is a warning.
    expect(h.messagesOfType("problems").at(-1)).toEqual({
      type: "problems",
      count: 2,
      errors: 1,
    });

    doc.set(named("A"));
    vscodeMock.fireDidChangeTextDocument(doc);
    expect(collection.get(doc.uri)).toEqual([]);
    expect(h.messagesOfType("problems").at(-1)).toEqual({ type: "problems", count: 0, errors: 0 });
  });

  it("checks the document when the editor opens, before the webview is ready", async () => {
    const doc = fakeDocument("/a.bmc", INVALID);
    const h = await openDiagram(doc);

    expect(vscodeMock.diagnosticCollections()[0]!.get(doc.uri)?.length).toBeGreaterThan(0);
    expect(h.messagesOfType("problems")).toEqual([]);
  });

  it("drops the diagram's problems when its editor closes", async () => {
    const doc = fakeDocument("/a.bmc", INVALID);
    const h = await openDiagram(doc);
    const collection = vscodeMock.diagnosticCollections()[0]!;
    expect(collection.has(doc.uri)).toBe(true);

    h.dispose();

    expect(collection.has(doc.uri)).toBe(false);
  });

  it("posts the count again to a webview that reloaded, which forgot it", async () => {
    const doc = fakeDocument("/a.bmc", INVALID);
    const h = await openDiagram(doc);
    await h.receive({ type: "ready" });
    const [first] = h.messagesOfType("problems");
    expect(first!.count).toBeGreaterThan(0);

    await h.receive({ type: "ready" });

    expect(h.messagesOfType("problems")).toEqual([first, first]);
  });

  it("posts no notification for an invalid file", async () => {
    const doc = fakeDocument("/a.bmc", INVALID);
    const showErrorMessage = vi.spyOn(
      (await import("./__mocks__/vscode")).window,
      "showErrorMessage",
    );
    const h = await openDiagram(doc);
    await h.receive({ type: "ready" });

    expect(showErrorMessage).not.toHaveBeenCalled();
  });

  it("opens the Problems view from the pill", async () => {
    const h = await openDiagram(fakeDocument("/a.bmc", named("A")));

    await h.receive({ type: "showProblems" });

    expect(vscodeMock.executedCommands()).toContainEqual(["workbench.actions.view.problems"]);
  });
});
