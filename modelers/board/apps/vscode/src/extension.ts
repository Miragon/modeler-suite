import type * as vscode from "vscode";

import { registerBoardEditor } from "./boardEditor.js";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(registerBoardEditor(context));
}

export function deactivate(): void {
  // every resource is tied to context.subscriptions
}
