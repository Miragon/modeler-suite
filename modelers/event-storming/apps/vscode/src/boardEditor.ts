import * as vscode from "vscode";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
  type ExportKind,
  type ModelerEditorRegistration,
} from "@miragon/modeler-shell/vscode/extension";
import { BOARD_EDITOR_OPTIONS } from "./boardEditorOptions.js";
import type { BoardDiagnostics } from "./diagnostics.js";
import type { ExportFormat, WebviewToHost } from "./protocol.js";

/** The open board editors: the focused one, the one focused last, and their Command Palette commands. */
export type BoardEditors = ModelerEditorRegistration<vscode.TextDocument>;

/** The same exports and file names as the web app's (guide §5.2: one Export group for both hosts). */
const EXPORT_KINDS: Readonly<Record<ExportFormat, ExportKind>> = {
  ...IMAGE_EXPORT_KINDS,
  json: {
    title: "Export as JSON",
    filters: { "JSON board": ["json"] },
    suffix: ".json",
    encoding: "text",
  },
};

/**
 * The custom editor for `.storm`, on the shell's document plumbing: the Event Storming DSL text
 * stays the document, so VS Code keeps dirty state, saving, Git, diff and undo, and every change on
 * the canvas comes back as one minimal line edit. The parser's findings are in the Problems view
 * and on the pill while the board is open.
 */
export function registerBoardEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  diagnostics: BoardDiagnostics,
): BoardEditors {
  return registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...BOARD_EDITOR_OPTIONS,
    diagnostics,
    onMessage: (message, editor) =>
      message.type === "export"
        ? exportToFile(vscode, {
            kind: EXPORT_KINDS[message.format],
            data: message.data,
            sourceUri: editor.document.uri,
            defaultName: "event-storming-board",
            fontFallback: message.fontFallback === true,
            platform: process.platform,
          })
        : undefined,
  });
}
