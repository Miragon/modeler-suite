import type * as vscode from "vscode";
import { describe, expectTypeOf, it } from "vitest";

import {
  registerModelerEditor,
  type CustomTextEditorProviderLike,
  type DisposableLike,
  type EditorWebviewPanelLike,
  type ModelerEditorRegistration,
  type TextDocumentChangeEventLike,
  type TextDocumentLike,
  type VsCodeEditorLike,
  type VsCodeLike,
  type WebviewPanelLike,
  type WorkspaceEditLike,
} from "./index.js";

describe("structural vscode types", () => {
  it("accept the real vscode namespace", () => {
    expectTypeOf<typeof vscode>().toExtend<VsCodeLike>();
    expectTypeOf<typeof vscode>().toExtend<VsCodeEditorLike>();
  });

  it("accept a real WebviewPanel", () => {
    expectTypeOf<vscode.WebviewPanel>().toExtend<WebviewPanelLike>();
    expectTypeOf<vscode.WebviewPanel>().toExtend<EditorWebviewPanelLike>();
  });

  it("accept a real Disposable", () => {
    expectTypeOf<vscode.Disposable>().toExtend<DisposableLike>();
  });

  it("accept a real TextDocument, its change events and a WorkspaceEdit", () => {
    expectTypeOf<vscode.TextDocument>().toExtend<TextDocumentLike>();
    expectTypeOf<vscode.TextDocumentChangeEvent>().toExtend<TextDocumentChangeEventLike>();
    expectTypeOf<vscode.WorkspaceEdit>().toExtend<WorkspaceEditLike>();
  });

  it("hand the plumbing's provider to registerCustomEditorProvider as a CustomTextEditorProvider", () => {
    expectTypeOf<CustomTextEditorProviderLike>().toExtend<vscode.CustomTextEditorProvider>();
  });

  it("give the modeler VS Code's own documents and URIs back", () => {
    const registration = (vscodeNamespace: typeof vscode) =>
      registerModelerEditor(
        vscodeNamespace,
        { extensionUri: {} as vscode.Uri },
        {
          viewType: "modeler.editor",
          title: "Modeler",
          themes: ["light"],
          diagnostics: {
            refresh: (document: vscode.TextDocument) => ({
              count: document.lineCount,
              errors: 0,
            }),
          },
        },
      );
    expectTypeOf(registration).returns.toEqualTypeOf<
      ModelerEditorRegistration<vscode.TextDocument>
    >();
    expectTypeOf<
      ReturnType<ModelerEditorRegistration<vscode.TextDocument>["revealActiveDocument"]>
    >().toEqualTypeOf<vscode.Uri | undefined>();
  });
});
