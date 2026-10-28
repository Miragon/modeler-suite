import { describe, expect, it, vi } from "vitest";

import { createVsCodeHostStub } from "./vscode-host-stub.js";

describe("createVsCodeHostStub: text documents", () => {
  it("keeps the line break the text uses first, and reports lines as VS Code does", () => {
    const host = createVsCodeHostStub();
    const crlf = host.openTextDocument("/a.wmap", "title A\r\nnote\n");
    expect(crlf.eol).toBe("\r\n");
    expect(crlf.getText()).toBe("title A\r\nnote\r\n");
    expect(crlf.lineCount).toBe(3);
    expect(crlf.lineAt(1).text).toBe("note");
    expect(() => crlf.lineAt(3)).toThrow(/Illegal value/);
    expect(host.openTextDocument("/b.wmap", "", { eol: "\r\n" }).eol).toBe("\r\n");
  });

  it("applies a workspace edit in the document's line break and fires one change", () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/a.wmap", "a\r\nb\r\nc\r\n");
    const changes = vi.fn();
    host.vscode.workspace.onDidChangeTextDocument(changes);
    const edit = new host.vscode.WorkspaceEdit();
    edit.replace(document.uri, new host.vscode.Range(1, 0, 2, 0), "B\nB2\n");

    return host.vscode.workspace.applyEdit(edit).then((applied) => {
      expect(applied).toBe(true);
      expect(document.getText()).toBe("a\r\nB\r\nB2\r\nc\r\n");
      expect(changes).toHaveBeenCalledTimes(1);
      expect(changes.mock.calls[0]?.[0]).toMatchObject({ document });
      expect(host.appliedEdits).toHaveLength(1);
    });
  });

  it("refuses an edit to a read-only document and one built without its WorkspaceEdit", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/a.wmap", "a\n");
    document.readOnly = true;
    const edit = new host.vscode.WorkspaceEdit();
    edit.replace(document.uri, new host.vscode.Range(0, 0, 0, 1), "b");
    expect(await host.vscode.workspace.applyEdit(edit)).toBe(false);
    await expect(host.vscode.workspace.applyEdit({ replace: () => undefined })).rejects.toThrow(
      /WorkspaceEdit/,
    );
    expect(document.getText()).toBe("a\n");
  });

  it("undoes and redoes edits and outside changes one by one, and saves without a content change", () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/a.wmap", "a\n");
    const changes: unknown[][] = [];
    host.vscode.workspace.onDidChangeTextDocument((event) =>
      changes.push([...event.contentChanges]),
    );
    host.replaceText(document, "b\n");
    host.replaceText(document, "c\n");

    expect(host.undo(document)).toBe(true);
    expect(document.getText()).toBe("b\n");
    expect(host.redo(document)).toBe(true);
    expect(document.getText()).toBe("c\n");
    expect(host.undo(document)).toBe(true);
    expect(host.undo(document)).toBe(true);
    expect(host.undo(document)).toBe(false);
    expect(document.getText()).toBe("a\n");

    host.save(document);
    expect(changes.at(-1)).toEqual([]);
    expect(changes.slice(0, -1).every((contentChanges) => contentChanges.length === 1)).toBe(true);
  });

  it("holds edits until released, as VS Code applies them later", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/a.wmap", "a\n");
    const release = host.holdEdits();
    const edit = new host.vscode.WorkspaceEdit();
    edit.replace(document.uri, new host.vscode.Range(0, 0, 0, 1), "b");
    const applied = host.vscode.workspace.applyEdit(edit);
    expect(document.getText()).toBe("a\n");
    release();
    expect(await applied).toBe(true);
    expect(document.getText()).toBe("b\n");
  });
});

describe("createVsCodeHostStub: custom editors", () => {
  it("opens a document in the editor registered for the view type, until it is disposed", async () => {
    const host = createVsCodeHostStub();
    const document = host.openTextDocument("/a.wmap", "a\n");
    const resolveCustomTextEditor = vi.fn();
    const registration = host.vscode.window.registerCustomEditorProvider("modeler.editor", {
      resolveCustomTextEditor,
    });

    const panel = await host.openCustomEditor("modeler.editor", document, { active: false });
    expect(resolveCustomTextEditor).toHaveBeenCalledWith(document, panel, {});
    expect(panel.active).toBe(false);

    registration.dispose();
    await expect(host.openCustomEditor("modeler.editor", document)).rejects.toThrow(
      /No custom editor/,
    );
  });

  it("delivers the panel's messages both ways, and none after it closed", async () => {
    const host = createVsCodeHostStub();
    const delivered: unknown[] = [];
    const received: unknown[] = [];
    host.vscode.window.registerCustomEditorProvider("modeler.editor", {
      resolveCustomTextEditor: (_document, panel) => {
        panel.webview.onDidReceiveMessage((message) => received.push(message));
      },
    });
    const panel = await host.openCustomEditor(
      "modeler.editor",
      host.openTextDocument("/a.wmap", "a\n"),
      { deliver: (message) => delivered.push(message) },
    );

    await panel.receive({ type: "ready" });
    expect(await panel.webview.postMessage({ type: "init" })).toBe(true);
    panel.dispose();
    expect(await panel.webview.postMessage({ type: "update" })).toBe(false);

    expect(received).toEqual([{ type: "ready" }]);
    expect(delivered).toEqual([{ type: "init" }]);
    expect(panel.posted).toEqual([{ type: "init" }]);
  });

  it("records commands and notifications and switches the color theme", async () => {
    const host = createVsCodeHostStub();
    const themes = vi.fn();
    host.vscode.window.onDidChangeActiveColorTheme(themes);
    await host.vscode.commands.executeCommand("revealFileInOS", "/a.png");
    await host.vscode.window.showInformationMessage("Exported a.png.");
    await host.vscode.window.showErrorMessage("Couldn't export a.png.");
    host.setColorThemeKind(2);

    expect(host.executedCommands).toEqual([{ command: "revealFileInOS", args: ["/a.png"] }]);
    expect(host.notifications).toEqual([
      { severity: "info", message: "Exported a.png." },
      { severity: "error", message: "Couldn't export a.png." },
    ]);
    expect(host.vscode.window.activeColorTheme.kind).toBe(2);
    expect(themes).toHaveBeenCalledWith({ kind: 2 });
  });
});
