import type * as vscode from "vscode";
import { describe, expectTypeOf, it } from "vitest";

import {
  IMAGE_EXPORT_KINDS,
  createNewDocument,
  exportToFile,
  registerModelerEditor,
  registerNewDocumentCommand,
  type CustomTextEditorProviderLike,
  type DisposableLike,
  type EditorWebviewPanelLike,
  type FileUriLike,
  type ModelerEditorRegistration,
  type TextDocumentChangeEventLike,
  type TextDocumentLike,
  type VsCodeEditorLike,
  type VsCodeFilesLike,
  type VsCodeLike,
  type WebviewPanelLike,
  type WorkspaceEditLike,
} from "./index.js";

describe("structural vscode types", () => {
  it("accept the real vscode namespace", () => {
    expectTypeOf<typeof vscode>().toExtend<VsCodeLike>();
    expectTypeOf<typeof vscode>().toExtend<VsCodeEditorLike>();
    expectTypeOf<typeof vscode>().toExtend<VsCodeFilesLike<vscode.Uri>>();
  });

  it("accept a real Uri", () => {
    expectTypeOf<vscode.Uri>().toExtend<FileUriLike>();
  });

  it("give the file commands VS Code's own URIs back and a disposable for the subscriptions", () => {
    const exported = (vscodeNamespace: typeof vscode, sourceUri: vscode.Uri) =>
      exportToFile(vscodeNamespace, {
        kind: IMAGE_EXPORT_KINDS.png,
        data: "",
        sourceUri,
        defaultName: "wardley-map",
        platform: "darwin",
      });
    expectTypeOf(exported).returns.toEqualTypeOf<Promise<vscode.Uri | undefined>>();

    const newDocument = {
      viewType: "modeler.editor",
      text: "",
      title: "New Wardley Map",
      saveLabel: "Create map",
      filters: { "Wardley Map": ["wmap", "owm"] },
      defaultFileName: "wardley-map.wmap",
    };
    const created = (vscodeNamespace: typeof vscode) =>
      createNewDocument(vscodeNamespace, newDocument);
    expectTypeOf(created).returns.toEqualTypeOf<Promise<vscode.Uri | undefined>>();
    const registered = (vscodeNamespace: typeof vscode, context: vscode.ExtensionContext) =>
      context.subscriptions.push(
        registerNewDocumentCommand(vscodeNamespace, "modeler.newDiagram", newDocument),
      );
    expectTypeOf(registered).returns.toEqualTypeOf<number>();
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
