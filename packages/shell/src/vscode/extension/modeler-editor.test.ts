import { describe, expect, it, vi } from "vitest";

import {
  createVsCodeHostStub,
  type StubTextDocument,
  type StubWebviewPanel,
  type VsCodeHostStub,
} from "../../testing/vscode-host-stub.js";
import {
  APPEARANCE_MESSAGE_TYPE,
  registerModelerEditor,
  type ModelerEditorOptions,
  type ProblemCounts,
} from "./index.js";

const VIEW_TYPE = "modeler.editor";
const MAP = "title A\ncomponent X [0.5, 0.5]\n";

function messagesOf(panel: StubWebviewPanel, type: string): unknown[] {
  return panel.posted.filter((message) => (message as { type?: unknown }).type === type);
}

function updatesOf(panel: StubWebviewPanel): string[] {
  return messagesOf(panel, "update").map((message) => (message as { text: string }).text);
}

interface Setup {
  host: VsCodeHostStub;
  registration: ReturnType<typeof registerModelerEditor<StubTextDocument>>;
  open(
    path?: string,
    text?: string,
    options?: { active?: boolean },
  ): Promise<{ document: StubTextDocument; panel: StubWebviewPanel }>;
}

function setup(options: Partial<ModelerEditorOptions<StubTextDocument>> = {}): Setup {
  const host = createVsCodeHostStub();
  const registration = registerModelerEditor<StubTextDocument>(
    host.vscode,
    { extensionUri: host.extensionUri },
    { viewType: VIEW_TYPE, title: "Wardley Map", themes: ["light"], ...options },
  );
  return {
    host,
    registration,
    async open(path = "/a.wmap", text = MAP, { active = true } = {}) {
      const document = host.openTextDocument(path, text);
      const panel = await host.openCustomEditor(VIEW_TYPE, document, { active });
      return { document, panel };
    },
  };
}

/** Diagnostics that count the lines with "?" as warnings and those with "!" as errors. */
function markDiagnostics() {
  const findings = new Map<string, ProblemCounts>();
  const refresh = vi.fn((document: StubTextDocument): ProblemCounts => {
    const lines = document.getText().split(/\r?\n/);
    const errors = lines.filter((line) => line.includes("!")).length;
    const counts = { count: errors + lines.filter((line) => line.includes("?")).length, errors };
    findings.set(document.uri.toString(), counts);
    return counts;
  });
  const clear = vi.fn((document: StubTextDocument) => findings.delete(document.uri.toString()));
  return { findings, diagnostics: { refresh, clear } };
}

describe("registerModelerEditor: the custom editor", () => {
  it("registers the view type with a retained webview, one editor per document", () => {
    const host = createVsCodeHostStub();
    const register = vi.spyOn(host.vscode.window, "registerCustomEditorProvider");
    registerModelerEditor(
      host.vscode,
      { extensionUri: host.extensionUri },
      { viewType: VIEW_TYPE, title: "Wardley Map", themes: ["light"] },
    );
    expect(register).toHaveBeenCalledWith(VIEW_TYPE, expect.anything(), {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });
  });

  it("writes the shell's webview HTML around the bundle in dist, its only resource root", async () => {
    const { open } = setup();
    const { panel } = await open();
    const { html, options } = panel.webview;

    expect(options).toEqual({
      enableScripts: true,
      localResourceRoots: [expect.objectContaining({ path: "/extension/dist" })],
    });
    expect(html).toMatch(/<html lang="en" class="cd-shell-document" data-cd-theme="light"/);
    expect(html).toContain("<title>Wardley Map</title>");
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('src="vscode-webview:///extension/dist/webview.js"');
    expect(html).toContain('href="vscode-webview:///extension/dist/webview.css"');
    expect(html).toMatch(/style-src vscode-webview:\/\/stub 'unsafe-inline'/);
  });

  it("takes the bundle's folder, files, language and inline-style choice from the options", async () => {
    const { open } = setup({
      bundleDirectory: "out",
      script: "main.js",
      styles: ["tokens.css", "main.css"],
      lang: "de",
      inlineStyles: false,
    });
    const { panel } = await open();
    const { html } = panel.webview;
    expect(html).toContain('<html lang="de"');
    expect(html).toContain("/extension/out/main.js");
    expect(html.indexOf("/extension/out/tokens.css")).toBeLessThan(
      html.indexOf("/extension/out/main.css"),
    );
    expect(html).not.toContain("unsafe-inline");
  });

  it("keeps a light-only modeler light in a dark theme and passes high contrast on", async () => {
    const { host, open } = setup();
    host.setColorThemeKind(3);
    const { panel } = await open();
    expect(panel.webview.html).toContain('data-cd-theme="light" data-cd-kontrast="hoch"');

    host.setColorThemeKind(2);
    expect(panel.posted.at(-1)).toEqual({
      type: APPEARANCE_MESSAGE_TYPE,
      appearance: { theme: "light" },
    });
    panel.dispose();
    const posted = panel.posted.length;
    host.setColorThemeKind(4);
    expect(panel.posted).toHaveLength(posted);
  });

  it("unregisters the view type when disposed", async () => {
    const { registration, open } = setup();
    registration.dispose();
    await expect(open()).rejects.toThrow(/No custom editor/);
  });
});

describe("registerModelerEditor: two-way sync", () => {
  it("answers ready with the document's text, again for a reloaded webview", async () => {
    const { open } = setup();
    const { panel } = await open();
    await panel.receive({ type: "ready" });
    await panel.receive({ type: "ready" });
    expect(messagesOf(panel, "init")).toEqual([
      { type: "init", text: MAP },
      { type: "init", text: MAP },
    ]);
  });

  it("writes an edit as one minimal edit and posts no update for its echo", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    const moved = "title A\ncomponent X [0.6, 0.5]\n";

    await panel.receive({ type: "edit", text: moved });

    expect(document.getText()).toBe(moved);
    expect(host.appliedEdits.map((edit) => edit.text)).toEqual(["component X [0.6, 0.5]\n"]);
    expect(updatesOf(panel)).toEqual([]);
  });

  it("swallows every echo of edits in quick succession", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    const release = host.holdEdits();
    const edits = [
      panel.receive({ type: "edit", text: "title B\ncomponent X [0.5, 0.5]\n" }),
      panel.receive({ type: "edit", text: "title C\ncomponent X [0.5, 0.5]\n" }),
      panel.receive({ type: "edit", text: "title C\ncomponent X [0.7, 0.5]\n" }),
    ];
    await Promise.resolve();
    release();
    await Promise.all(edits);

    expect(document.getText()).toBe("title C\ncomponent X [0.7, 0.5]\n");
    expect(host.appliedEdits).toHaveLength(3);
    expect(updatesOf(panel)).toEqual([]);
  });

  it("swallows the echo in a CRLF document and keeps its line breaks", async () => {
    const { open } = setup();
    const { document, panel } = await open("/a.wmap", "title A\r\ncomponent X [0.5, 0.5]\r\n");
    await panel.receive({ type: "edit", text: "title A\ncomponent X [0.6, 0.5]\n" });
    expect(document.getText()).toBe("title A\r\ncomponent X [0.6, 0.5]\r\n");
    expect(updatesOf(panel)).toEqual([]);
  });

  it("posts a change the webview did not make as exactly one update", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    host.replaceText(document, "title Typed\n");
    expect(updatesOf(panel)).toEqual(["title Typed\n"]);
  });

  it("undoes and redoes through the document's history, one canvas change per step", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    const first = "title A\ncomponent X [0.6, 0.5]\n";
    const second = "title A\ncomponent X [0.7, 0.5]\n";
    await panel.receive({ type: "edit", text: first });
    await panel.receive({ type: "edit", text: second });

    expect(host.undo(document)).toBe(true);
    expect(host.redo(document)).toBe(true);
    expect(host.undo(document)).toBe(true);
    expect(host.undo(document)).toBe(true);

    expect(updatesOf(panel)).toEqual([first, second, first, MAP]);
    expect(document.getText()).toBe(MAP);
  });

  it("posts nothing for a save, which changes the dirty state only", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    const posted = panel.posted.length;
    host.save(document);
    expect(panel.posted).toHaveLength(posted);
  });

  it("ignores the changes of other documents", async () => {
    const { host, open } = setup();
    const { panel } = await open();
    host.replaceText(host.openTextDocument("/b.wmap", "title B\n"), "title C\n");
    expect(updatesOf(panel)).toEqual([]);
  });

  it("shows the document again when it refuses an edit, and keeps writing later ones", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    document.readOnly = true;
    await panel.receive({ type: "edit", text: "title B\n" });
    expect(updatesOf(panel)).toEqual([MAP]);

    document.readOnly = false;
    await panel.receive({ type: "edit", text: "title C\n" });
    expect(document.getText()).toBe("title C\n");
    expect(host.appliedEdits).toHaveLength(1);
    expect(updatesOf(panel)).toEqual([MAP]);
  });

  it("leaves a refused edit to the newer one queued behind it", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    document.readOnly = true;
    const release = host.holdEdits();
    const refused = panel.receive({ type: "edit", text: "title B\n" });
    const newer = panel.receive({ type: "edit", text: "title C\n" });
    await Promise.resolve();
    release();
    await refused;
    expect(updatesOf(panel)).toEqual([]);
    await newer;
    expect(updatesOf(panel)).toEqual([MAP]);
  });

  it("ignores an edit without text, and messages that are no message", async () => {
    const { host, open } = setup();
    const { panel } = await open();
    await panel.receive({ type: "edit" });
    await panel.receive("edit");
    await panel.receive(null);
    expect(host.appliedEdits).toEqual([]);
  });

  it("stops syncing when the editor closes", async () => {
    const { host, open } = setup();
    const { document, panel } = await open();
    panel.dispose();
    host.replaceText(document, "title Later\n");
    expect(updatesOf(panel)).toEqual([]);
  });
});

describe("registerModelerEditor: Insert example", () => {
  const insertExample = (text: string): string => `${text}component Tea [0.6, 0.8]\n`;

  it("writes the example as one edit and posts it as an update to import", async () => {
    const { host, open } = setup({ insertExample });
    const { document, panel } = await open("/a.wmap", "title New map\n");
    await panel.receive({ type: "insertExample" });

    const withExample = "title New map\ncomponent Tea [0.6, 0.8]\n";
    expect(document.getText()).toBe(withExample);
    expect(host.appliedEdits).toHaveLength(1);
    expect(updatesOf(panel)).toEqual([withExample]);
    expect(host.undo(document)).toBe(true);
    expect(document.getText()).toBe("title New map\n");
  });

  it("leaves the document alone when the modeler inserts nothing, or has no example", async () => {
    const refusing = setup({ insertExample: () => undefined });
    const { panel } = await refusing.open();
    await panel.receive({ type: "insertExample" });
    expect(refusing.host.appliedEdits).toEqual([]);

    const without = setup();
    const opened = await without.open();
    await opened.panel.receive({ type: "insertExample" });
    expect(without.host.appliedEdits).toEqual([]);
  });
});

describe("registerModelerEditor: the problems", () => {
  it("finds them on open and on ready, and posts the pill's counts after init", async () => {
    const { diagnostics } = markDiagnostics();
    const { open } = setup({ diagnostics });
    const { panel } = await open("/a.wmap", "title A?\ncomponent X!\n");
    expect(diagnostics.refresh).toHaveBeenCalledTimes(1);
    expect(messagesOf(panel, "problems")).toEqual([]);

    await panel.receive({ type: "ready" });
    expect(
      panel.posted.filter(
        (message) => (message as { type: string }).type !== APPEARANCE_MESSAGE_TYPE,
      ),
    ).toEqual([
      { type: "init", text: "title A?\ncomponent X!\n" },
      { type: "problems", count: 2, errors: 1 },
    ]);
  });

  it("follows every change, its own edits included, and posts only a different count", async () => {
    const { diagnostics } = markDiagnostics();
    const { host, open } = setup({ diagnostics });
    const { document, panel } = await open();
    await panel.receive({ type: "ready" });

    await panel.receive({ type: "edit", text: "title A?\ncomponent X [0.5, 0.5]\n" });
    host.replaceText(document, "title A!\ncomponent X [0.5, 0.5]\n");
    host.replaceText(document, "title B!\ncomponent X [0.5, 0.5]\n");

    expect(messagesOf(panel, "problems")).toEqual([
      { type: "problems", count: 0, errors: 0 },
      { type: "problems", count: 1, errors: 0 },
      { type: "problems", count: 1, errors: 1 },
    ]);
  });

  it("posts the counts again to a reloaded webview", async () => {
    const { diagnostics } = markDiagnostics();
    const { open } = setup({ diagnostics });
    const { panel } = await open("/a.wmap", "title A?\n");
    await panel.receive({ type: "ready" });
    await panel.receive({ type: "ready" });
    expect(messagesOf(panel, "problems")).toEqual([
      { type: "problems", count: 1, errors: 0 },
      { type: "problems", count: 1, errors: 0 },
    ]);
  });

  it("clears them when the editor closes", async () => {
    const { diagnostics, findings } = markDiagnostics();
    const { open } = setup({ diagnostics });
    const { document, panel } = await open();
    panel.dispose();
    expect(diagnostics.clear).toHaveBeenCalledWith(document);
    expect(findings.size).toBe(0);
  });

  it("opens the Problems view for the pill", async () => {
    const { host, open } = setup();
    const { panel } = await open();
    await panel.receive({ type: "showProblems" });
    expect(host.executedCommands).toEqual([
      { command: "workbench.actions.view.problems", args: [] },
    ]);
  });
});

describe("registerModelerEditor: notifications and the modeler's own messages", () => {
  it("shows info and error as VS Code notifications", async () => {
    const { host, open } = setup();
    const { panel } = await open();
    await panel.receive({ type: "info", message: "Renamed to “Tea 2”." });
    await panel.receive({ type: "error", message: "Couldn't export the map as SVG." });
    await panel.receive({ type: "error" });
    expect(host.notifications).toEqual([
      { severity: "info", message: "Renamed to “Tea 2”." },
      { severity: "error", message: "Couldn't export the map as SVG." },
    ]);
  });

  it("hands every other message to the modeler with its editor, after the writes it queued", async () => {
    const seen: Array<{ type: string; text: string }> = [];
    const { host, open } = setup({
      onMessage: async (message, editor) => {
        await editor.written();
        seen.push({ type: message.type, text: editor.document.getText() });
        await editor.post({ type: "exported" });
      },
    });
    const { panel } = await open();
    const release = host.holdEdits();
    const edit = panel.receive({ type: "edit", text: "title B\n" });
    const exported = panel.receive({ type: "export", format: "svg", data: "<svg/>" });
    await Promise.resolve();
    release();
    await Promise.all([edit, exported]);

    expect(seen).toEqual([{ type: "export", text: "title B\n" }]);
    expect(messagesOf(panel, "exported")).toHaveLength(1);
  });

  it("disposes what onDidOpen returned with the editor", async () => {
    const dispose = vi.fn();
    const onDidOpen = vi.fn(() => ({ dispose }));
    const { open } = setup({ onDidOpen });
    const { document, panel } = await open();
    expect(onDidOpen).toHaveBeenCalledWith(expect.objectContaining({ document, panel }));
    expect(dispose).not.toHaveBeenCalled();
    panel.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("registerModelerEditor: the focused editor", () => {
  it("runs a command in the focused editor only, or in the editor of a document", async () => {
    const { registration, open } = setup();
    const a = await open("/a.wmap");
    const b = await open("/b.wmap", MAP, { active: false });

    expect(registration.runCommand("fitView")).toBe(true);
    expect(messagesOf(a.panel, "command")).toEqual([{ type: "command", name: "fitView" }]);

    a.panel.setActive(false);
    expect(registration.runCommand("fitView")).toBe(false);
    expect(registration.runCommand("exportPng", b.document.uri)).toBe(true);
    expect(messagesOf(b.panel, "command")).toEqual([{ type: "command", name: "exportPng" }]);
    expect(registration.runCommand("exportPng", { scheme: "file", path: "/c.wmap" })).toBe(false);
  });

  it("names the document of the editor focused last, and forgets a closed one", async () => {
    const { registration, open } = setup();
    expect(registration.revealActiveDocument()).toBeUndefined();
    const a = await open("/a.wmap");
    a.panel.setActive(false);
    expect(registration.revealActiveDocument()).toBe(a.document.uri);
    a.panel.setActive(false);

    const b = await open("/b.wmap", MAP, { active: false });
    expect(registration.revealActiveDocument()).toBe(a.document.uri);
    b.panel.setActive(true);
    b.panel.setActive(false);
    expect(registration.revealActiveDocument()).toBe(b.document.uri);

    b.panel.dispose();
    expect(registration.revealActiveDocument()).toBe(a.document.uri);
    a.panel.dispose();
    expect(registration.revealActiveDocument()).toBeUndefined();
    expect(registration.runCommand("fitView", a.document.uri)).toBe(false);
  });

  it("shows the editor focused last and gives it the focus, so Beside means its group", async () => {
    const { registration, open } = setup();
    const a = await open("/a.wmap");
    const b = await open("/b.wmap", MAP, { active: false });
    a.panel.setActive(false);

    expect(registration.revealActiveDocument()).toBe(a.document.uri);

    expect(a.panel.revealed).toEqual([{ viewColumn: undefined, preserveFocus: false }]);
    expect(a.panel.active).toBe(true);
    expect(b.panel.revealed).toEqual([]);
    expect(registration.runCommand("fitView")).toBe(true);
    expect(messagesOf(a.panel, "command")).toEqual([{ type: "command", name: "fitView" }]);
  });

  it("leaves a focused editor where it is", async () => {
    const { registration, open } = setup();
    const a = await open("/a.wmap");

    expect(registration.revealActiveDocument()).toBe(a.document.uri);

    expect(a.panel.revealed).toEqual([]);
  });
});
