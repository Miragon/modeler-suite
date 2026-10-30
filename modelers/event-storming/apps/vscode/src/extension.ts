import * as vscode from "vscode";
import { registerNewDocumentCommand } from "@miragon/modeler-shell/vscode/extension";
import { registerBoardEditor } from "./boardEditor.js";
import { BOARD_VIEW_TYPE } from "./boardEditorOptions.js";
import { registerBoardCommands } from "./commands.js";
import { BoardDiagnostics } from "./diagnostics.js";
import { EMPTY_BOARD, EXAMPLE_BOARD } from "./examples.js";

const NEW_BOARD = {
  viewType: BOARD_VIEW_TYPE,
  title: "New Event Storming Board",
  saveLabel: "Create board",
  filters: { "Event Storming Board": ["storm"] },
  defaultFileName: "untitled.storm",
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new BoardDiagnostics();
  const editors = registerBoardEditor(context, diagnostics);
  context.subscriptions.push(
    diagnostics,
    editors,
    ...registerBoardCommands(editors),
    registerNewDocumentCommand(vscode, "eventStorming.newBoard", {
      ...NEW_BOARD,
      text: EMPTY_BOARD,
    }),
    registerNewDocumentCommand(vscode, "eventStorming.newBoardFromExample", {
      ...NEW_BOARD,
      text: EXAMPLE_BOARD,
    }),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}
