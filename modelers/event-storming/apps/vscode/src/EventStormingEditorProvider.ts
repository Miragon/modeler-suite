import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { BoardSession } from "./BoardSession.js";
import {
  BOARD_VIEW_TYPE,
  registerSideBySideCommands,
  registerWebviewCommands,
  revealRestoredTab,
} from "./commands.js";
import { DIAGNOSTIC_COLLECTION_NAME } from "./diagnostics.js";
import type { HostToWebview, WebviewCommand } from "./protocol.js";
import { WEBVIEW_THEMES } from "./themes.js";

interface OpenBoard {
  readonly uri: vscode.Uri;
  readonly panel: vscode.WebviewPanel;
}

/**
 * CustomTextEditor for `.storm`. The document (Event Storming DSL text) remains the source of
 * truth — VS Code handles dirty state, saving, Git, diff, and file undo "for free". The webview
 * renders the board (diagram-js modeler inside the shared modeler shell) and mirrors graphical
 * changes back into the document via WorkspaceEdit.
 */
export class EventStormingEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = BOARD_VIEW_TYPE;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new EventStormingEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
      EventStormingEditorProvider.viewType,
      provider,
      {
        // A hidden tab keeps document, view and selection (and reports 0 × 0 meanwhile).
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
    return vscode.Disposable.from(
      registration,
      provider.diagnostics,
      ...registerWebviewCommands((name) => provider.runCommand(name)),
      ...registerSideBySideCommands(() => provider.revealSourceBoard()),
    );
  }

  private readonly diagnostics = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME,
  );
  private activePanel: vscode.WebviewPanel | undefined;
  /** The open boards, the one focused last first. */
  private readonly openBoards: OpenBoard[] = [];

  private constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Shows the board Open Source to the Side means without a resource and returns its document: the
   * focused board, else the open board focused last (a link in the walkthrough takes the focus from
   * the board it means), else a board tab VS Code restored after a reload. Showing it focuses its
   * group, so the source opens beside the board, not beside the walkthrough.
   */
  public async revealSourceBoard(): Promise<vscode.Uri | undefined> {
    const last = this.openBoards[0];
    if (!last) return revealRestoredTab(BOARD_VIEW_TYPE);
    if (!last.panel.active) last.panel.reveal(undefined, false);
    return last.uri;
  }

  private forget(board: OpenBoard): void {
    const index = this.openBoards.indexOf(board);
    if (index !== -1) this.openBoards.splice(index, 1);
  }

  private bringToFront(board: OpenBoard): void {
    this.forget(board);
    this.openBoards.unshift(board);
  }

  /**
   * Forwards a Command Palette command to the focused board, never to one focused earlier; false
   * when none is focused.
   */
  public runCommand(name: WebviewCommand): boolean {
    if (!this.activePanel) return false;
    void this.activePanel.webview.postMessage({ type: "command", name } satisfies HostToWebview);
    return true;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset("webview.js"),
      styleUris: [asset("webview.css")],
      title: "Event Storming Board",
      lang: "en",
      appearance: currentAppearance(vscode, { themes: WEBVIEW_THEMES }),
      body: '<div id="app"></div>',
    });

    const session = new BoardSession(document, webviewPanel, this.diagnostics);
    const themeBridge = connectThemeBridge(vscode, webviewPanel, { themes: WEBVIEW_THEMES });
    const board: OpenBoard = { uri: document.uri, panel: webviewPanel };
    if (webviewPanel.active) {
      this.activePanel = webviewPanel;
      this.openBoards.unshift(board);
    } else {
      this.openBoards.push(board);
    }
    const viewState = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.activePanel = webviewPanel;
        this.bringToFront(board);
      } else if (this.activePanel === webviewPanel) {
        this.activePanel = undefined;
      }
    });

    webviewPanel.onDidDispose(() => {
      viewState.dispose();
      themeBridge.dispose();
      session.dispose();
      if (this.activePanel === webviewPanel) this.activePanel = undefined;
      this.forget(board);
    });
  }
}
