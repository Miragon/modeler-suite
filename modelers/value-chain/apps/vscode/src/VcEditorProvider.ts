import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import {
  DIAGRAM_VIEW_TYPE,
  registerSideBySideCommands,
  registerWebviewCommands,
  revealRestoredTab,
} from "./commands.js";
import { DiagramSession } from "./DiagramSession.js";
import { DIAGNOSTIC_COLLECTION_NAME } from "./diagnostics.js";
import type { HostToWebview, WebviewCommand } from "./protocol.js";
import { WEBVIEW_THEMES } from "./themes.js";

interface OpenDiagram {
  readonly uri: vscode.Uri;
  readonly panel: vscode.WebviewPanel;
}

/**
 * CustomTextEditor for `*.vc` / `*.vc.json`. The document (canonical JSON) remains the source of
 * truth — VS Code handles dirty state, saving, Git, diff, and file undo "for free". The webview
 * renders the diagram (diagram-js modeler inside the shared Miragon modeler shell) and mirrors
 * graphical changes back into the document via WorkspaceEdit.
 */
export class VcEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = DIAGRAM_VIEW_TYPE;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new VcEditorProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
      VcEditorProvider.viewType,
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
      ...registerSideBySideCommands(() => provider.revealSourceDiagram()),
    );
  }

  private readonly diagnostics = vscode.languages.createDiagnosticCollection(
    DIAGNOSTIC_COLLECTION_NAME,
  );
  private activePanel: vscode.WebviewPanel | undefined;
  /** The open diagrams, the one focused last first. */
  private readonly openDiagrams: OpenDiagram[] = [];

  private constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Shows the diagram Open Source to the Side means without a resource and returns its document: the
   * focused diagram, else the open diagram focused last (a link in the walkthrough takes the focus from
   * the diagram it means), else a diagram tab VS Code restored after a reload. Showing it focuses its
   * group, so the source opens beside the diagram, not beside the walkthrough.
   */
  public async revealSourceDiagram(): Promise<vscode.Uri | undefined> {
    const last = this.openDiagrams[0];
    if (!last) return revealRestoredTab(DIAGRAM_VIEW_TYPE);
    if (!last.panel.active) last.panel.reveal(undefined, false);
    return last.uri;
  }

  private forget(diagram: OpenDiagram): void {
    const index = this.openDiagrams.indexOf(diagram);
    if (index !== -1) this.openDiagrams.splice(index, 1);
  }

  private bringToFront(diagram: OpenDiagram): void {
    this.forget(diagram);
    this.openDiagrams.unshift(diagram);
  }

  /**
   * Forwards a Command Palette command to the focused diagram, never to one focused earlier; false
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
    // Script, stylesheet and font files.
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset("webview.js"),
      styleUris: [asset("webview.css")],
      title: "Value Chain Diagram",
      lang: "en",
      appearance: currentAppearance(vscode, { themes: WEBVIEW_THEMES }),
      body: '<div id="app"></div>',
    });

    const session = new DiagramSession(document, webviewPanel, this.diagnostics);
    const themeBridge = connectThemeBridge(vscode, webviewPanel, { themes: WEBVIEW_THEMES });
    const diagram: OpenDiagram = { uri: document.uri, panel: webviewPanel };
    if (webviewPanel.active) {
      this.activePanel = webviewPanel;
      this.openDiagrams.unshift(diagram);
    } else {
      this.openDiagrams.push(diagram);
    }
    const viewState = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.activePanel = webviewPanel;
        this.bringToFront(diagram);
      } else if (this.activePanel === webviewPanel) {
        this.activePanel = undefined;
      }
    });

    webviewPanel.onDidDispose(() => {
      viewState.dispose();
      themeBridge.dispose();
      session.dispose();
      if (this.activePanel === webviewPanel) this.activePanel = undefined;
      this.forget(diagram);
    });
  }
}
