/**
 * A webview panel for the tests that run the extension against the `vscode` mock, after the
 * fakes of Business Model Canvas's extension tests.
 */
import type * as vscode from "vscode";

import { Disposable, EventEmitter, Uri, vscodeMock } from "../__mocks__/vscode.js";
import { registerBoardEditor } from "../../src/boardEditor.js";

export interface FakePanel {
  readonly panel: vscode.WebviewPanel;
  readonly webview: { html: string; options: unknown };
  /** everything the extension posted to the webview, the theme bridge's messages included */
  readonly posted: unknown[];
  /** what the extension posted of the files protocol, emptied by the call */
  taken(): Array<{ type: string } & Record<string, unknown>>;
  /** a message of the webview, delivered as VS Code does it */
  receive(message: unknown): Promise<unknown>;
  /** the person closes the editor */
  dispose(): void;
}

export function fakeWebviewPanel(): FakePanel {
  const posted: unknown[] = [];
  let onMessage: ((message: unknown) => unknown) | undefined;
  const viewState = new EventEmitter<{ webviewPanel: unknown }>();
  const disposed = new EventEmitter<void>();
  let gone = false;
  const webview = {
    options: {} as unknown,
    html: "",
    cspSource: "vscode-webview://unit",
    asWebviewUri: (uri: Uri) => uri,
    postMessage(message: unknown) {
      if (gone) return Promise.resolve(false);
      posted.push(message);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(listener: (message: unknown) => unknown) {
      onMessage = listener;
      return new Disposable(() => {
        if (onMessage === listener) onMessage = undefined;
      });
    },
  };
  const panel = {
    webview,
    active: true,
    visible: true,
    reveal: () => {},
    onDidChangeViewState: viewState.event,
    onDidDispose: disposed.event,
  };
  const isBoard = (message: unknown): message is { type: string } & Record<string, unknown> =>
    typeof message === "object" &&
    message !== null &&
    String((message as { type?: unknown }).type).startsWith("board.");
  return {
    panel: panel as unknown as vscode.WebviewPanel,
    webview,
    posted,
    taken() {
      const board = posted.filter(isBoard);
      posted.length = 0;
      return board;
    },
    receive: async (message) => onMessage?.(message),
    dispose() {
      gone = true;
      disposed.fire();
    },
  };
}

export const context = {
  extensionUri: Uri.file("/ext"),
} as unknown as vscode.ExtensionContext;

/** registers the board editor as `activate` does, and hands back what it registered */
export function registerEditor(): {
  provider: vscode.CustomTextEditorProvider;
  registration: vscode.Disposable;
} {
  const registration = registerBoardEditor(context);
  return {
    provider: vscodeMock.lastRegisteredProvider<vscode.CustomTextEditorProvider>(),
    registration,
  };
}

/** VS Code opening the board file at `path` in the custom editor */
export async function openBoard(
  path: string,
  provider: vscode.CustomTextEditorProvider = registerEditor().provider,
): Promise<FakePanel> {
  const document = await vscodeMock.memory.vscode.workspace.openTextDocument(Uri.file(path));
  const opened = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(
    document as unknown as vscode.TextDocument,
    opened.panel,
    {} as vscode.CancellationToken,
  );
  return opened;
}
