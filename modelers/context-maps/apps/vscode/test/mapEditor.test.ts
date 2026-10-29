import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_NESTING_DEPTH,
  SAMPLE_DOCUMENT,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import { ActivePanels } from "../src/commands.js";
import { EMPTY_MAP, withExampleInserted } from "../src/examples.js";
import { registerMapEditor } from "../src/mapEditor.js";
import { MAP_VIEW_TYPE } from "../src/mapEditorOptions.js";
import type { HostToWebview, WebviewToHost } from "../src/protocol.js";
import {
  DiagnosticSeverity,
  Disposable,
  MockDiagnosticCollection,
  Range,
  Uri,
  vscodeMock,
  workspace,
  WorkspaceEdit,
  type MockTextDocument,
} from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());

const SAMPLE_MAP = serializeDocumentText(SAMPLE_DOCUMENT);

interface FakePanel {
  panel: unknown;
  posted: HostToWebview[];
  /** Delivers a message of the webview and resolves once the editor has answered it. */
  receive(message: WebviewToHost): Promise<void>;
  /** VS Code closes the editor. */
  close(): void;
}

function fakePanel(): FakePanel {
  const posted: HostToWebview[] = [];
  const messageListeners = new Set<(message: unknown) => unknown>();
  const disposeListeners = new Set<() => unknown>();
  const panel = {
    active: true,
    visible: true,
    reveal: () => undefined,
    webview: {
      options: {},
      html: "",
      cspSource: "vscode-webview://unit",
      asWebviewUri: (uri: Uri) => uri,
      postMessage(message: HostToWebview): Promise<boolean> {
        posted.push(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable {
        messageListeners.add(listener);
        return new Disposable(() => messageListeners.delete(listener));
      },
    },
    onDidChangeViewState: () => new Disposable(() => undefined),
    onDidDispose(listener: () => unknown): Disposable {
      disposeListeners.add(listener);
      return new Disposable(() => disposeListeners.delete(listener));
    },
  };
  return {
    panel,
    posted,
    async receive(message) {
      await Promise.all([...messageListeners].map((listener) => listener(message)));
    },
    close() {
      for (const listener of [...disposeListeners]) listener();
    },
  };
}

interface OpenMap {
  document: MockTextDocument;
  diagnostics: MockDiagnosticCollection;
  editor: FakePanel;
}

/** Registers the `.cm` editor as `activate` does and opens `text` in it. */
async function openMap(text: string, path = "/shop.cm"): Promise<OpenMap> {
  const diagnostics = new MockDiagnosticCollection("context-maps");
  registerMapEditor(
    { extensionUri: Uri.file("/extension") } as never,
    new ActivePanels(),
    diagnostics as never,
  );
  const provider = vscodeMock.customEditorProvider(MAP_VIEW_TYPE) as {
    resolveCustomTextEditor(document: unknown, panel: unknown, token: unknown): unknown;
  };
  const document = vscodeMock.openDocument(path, text);
  const editor = fakePanel();
  await provider.resolveCustomTextEditor(document, editor.panel, {});
  return { document, diagnostics, editor };
}

function updates(editor: FakePanel): string[] {
  return editor.posted.flatMap((message) => (message.type === "update" ? [message.text] : []));
}

describe("the .cm editor on the shell's document plumbing", () => {
  it("writes the shell's webview document around the bundle", async () => {
    const { editor } = await openMap(SAMPLE_MAP);
    const { html, options } = (editor.panel as { webview: { html: string; options: unknown } })
      .webview;
    expect(options).toEqual({
      enableScripts: true,
      localResourceRoots: [Uri.file("/extension/dist")],
    });
    expect(html).toContain("<title>Context Maps Diagram</title>");
    expect(html).toContain('src="file:/extension/dist/webview.js"');
    expect(html).toContain('<div id="app"></div>');
  });

  it("shows the nesting issue of a text too deep for the tree parser in the Problems view and on the pill", async () => {
    const levels = 50_000;
    const text = SAMPLE_MAP.replace(
      '"version": 1',
      `"x-deep": ${"[".repeat(levels)}${"]".repeat(levels)},\n  "version": 1`,
    );
    const { document, diagnostics, editor } = await openMap(text, "/deep.cm");

    const [diagnostic, ...rest] = diagnostics.get(document.uri) ?? [];
    expect(rest).toEqual([]);
    expect(diagnostic!.severity).toBe(DiagnosticSeverity.Error);
    expect(diagnostic!.message.endsWith(`may nest at most ${MAX_NESTING_DEPTH} levels deep`)).toBe(
      true,
    );
    expect(diagnostic!.range.start).toEqual({
      line: 1,
      character: '  "x-deep": '.length + MAX_NESTING_DEPTH - 1,
    });

    await editor.receive({ type: "ready" });
    expect(editor.posted).toEqual([
      { type: "init", text },
      { type: "problems", count: 1, errors: 1 },
    ]);

    editor.close();
    expect(diagnostics.get(document.uri)).toBeUndefined();
  });

  it("keeps the Problems view current when an edit cuts a string short in front of a deep value", async () => {
    const levels = 50_000;
    const title = `"title": ${JSON.stringify(SAMPLE_DOCUMENT.title)}`;
    const text = SAMPLE_MAP.replace(
      title,
      `${title},\n  "x-deep": ${"[".repeat(levels)}${"]".repeat(levels)}`,
    );
    const { document, diagnostics, editor } = await openMap(text, "/deep.cm");
    await editor.receive({ type: "ready" });

    const titleLine = 2;
    const closingQuote = `  ${title}`.length - 1;
    const edit = new WorkspaceEdit();
    edit.replace(document.uri, new Range(titleLine, closingQuote, titleLine, closingQuote + 1), "");
    await workspace.applyEdit(edit);

    const [diagnostic, ...rest] = diagnostics.get(document.uri) ?? [];
    expect(rest).toEqual([]);
    expect(diagnostic!.message).toMatch(/^not valid JSON: Bad control character in string literal/);
    expect(diagnostic!.range.start).toEqual({ line: titleLine, character: closingQuote + 1 });
    expect(updates(editor)).toEqual([document.getText()]);
  });

  it("writes a canvas edit as one minimal line edit, posts no echo, and counts the finding it adds", async () => {
    const { document, diagnostics, editor } = await openMap(SAMPLE_MAP);
    await editor.receive({ type: "ready" });
    expect(editor.posted.at(-1)).toEqual({ type: "problems", count: 0, errors: 0 });
    // The shared kernel of CfP Management and Submission Handling now spans two teams.
    const edited = serializeDocumentText({
      ...SAMPLE_DOCUMENT,
      contexts: SAMPLE_DOCUMENT.contexts.map((context) =>
        context.id === "ctx_submission" ? { ...context, team: "Review Team" } : context,
      ),
    });

    await editor.receive({ type: "edit", text: edited });

    expect(document.getText()).toBe(edited);
    const [written, ...more] = vscodeMock.appliedEdits();
    expect(more).toEqual([]);
    expect(written!.edits).toHaveLength(1);
    expect(written!.edits[0]!.text).toBe('      "team": "Review Team",\n');
    expect(updates(editor)).toEqual([]);
    expect(editor.posted.at(-1)).toEqual({ type: "problems", count: 1, errors: 0 });
    expect(diagnostics.get(document.uri)?.map((diagnostic) => diagnostic.code)).toEqual([
      "shared-kernel-team-coupling",
    ]);
  });

  it("shows the document again when VS Code refuses a canvas edit", async () => {
    const { editor } = await openMap(SAMPLE_MAP);
    await editor.receive({ type: "ready" });
    vscodeMock.refuseEdits(true);

    await editor.receive({
      type: "edit",
      text: serializeDocumentText({ ...SAMPLE_DOCUMENT, title: "Refused" }),
    });

    expect(updates(editor)).toEqual([SAMPLE_MAP]);
  });

  it("posts a change of the text editor, but nothing for a save", async () => {
    const { document, editor } = await openMap(SAMPLE_MAP);
    await editor.receive({ type: "ready" });
    const typed = serializeDocumentText({ ...SAMPLE_DOCUMENT, title: "Typed" });

    vscodeMock.replaceText(document, typed);
    vscodeMock.save(document);

    expect(updates(editor)).toEqual([typed]);
  });

  it("writes Insert example as one edit, which the canvas imports as an update", async () => {
    const { document, editor } = await openMap(EMPTY_MAP);
    await editor.receive({ type: "ready" });

    await editor.receive({ type: "insertExample" });

    const example = withExampleInserted(EMPTY_MAP)!;
    expect(document.getText()).toBe(example);
    expect(vscodeMock.appliedEdits()).toHaveLength(1);
    expect(updates(editor)).toEqual([example]);
  });

  it("leaves a map that has contexts alone on Insert example", async () => {
    const { document, editor } = await openMap(SAMPLE_MAP);

    await editor.receive({ type: "insertExample" });

    expect(document.getText()).toBe(SAMPLE_MAP);
    expect(vscodeMock.appliedEdits()).toEqual([]);
  });

  it("opens the Problems view from the pill and shows the webview's error", async () => {
    const { editor } = await openMap(SAMPLE_MAP);

    await editor.receive({ type: "showProblems" });
    await editor.receive({ type: "error", message: "Couldn't export the map as CML. Try again." });

    expect(vscodeMock.executedCommands()).toEqual([["workbench.actions.view.problems"]]);
    expect(vscodeMock.notifications()).toEqual([
      { level: "error", message: "Couldn't export the map as CML. Try again.", items: [] },
    ]);
  });

  it("tells the user when an exported PNG's labels fell back to the system font", async () => {
    const { editor } = await openMap(SAMPLE_MAP);
    vscodeMock.answerSaveDialog(Uri.file("/shop.png"));

    await editor.receive({
      type: "export",
      format: "png",
      data: "iVBORw0KGgo=",
      fontFallback: true,
    });
    await vi.waitFor(() => expect(vscodeMock.notifications()).toHaveLength(1));

    expect(workspace.fs.written.map((file) => file.uri.path)).toEqual(["/shop.png"]);
    expect(vscodeMock.notifications()[0]).toMatchObject({
      level: "warning",
      message: "Exported shop.png in a system font. Geist couldn't be embedded.",
    });
  });

  it("confirms an exported PNG as before when Geist was embedded", async () => {
    const { editor } = await openMap(SAMPLE_MAP);
    vscodeMock.answerSaveDialog(Uri.file("/shop.png"));

    await editor.receive({
      type: "export",
      format: "png",
      data: "iVBORw0KGgo=",
      fontFallback: false,
    });
    await vi.waitFor(() => expect(vscodeMock.notifications()).toHaveLength(1));

    expect(vscodeMock.notifications()[0]).toMatchObject({
      level: "info",
      message: "Exported shop.png.",
    });
  });
});
