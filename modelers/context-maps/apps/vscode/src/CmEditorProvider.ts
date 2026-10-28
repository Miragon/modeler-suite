import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { MAP_VIEW_TYPE, type ActivePanels } from "./commands.js";
import { MapSession } from "./MapSession.js";
import { WEBVIEW_THEMES } from "./themes.js";

export const WEBVIEW_TITLE = "Context Maps Diagram";

/** The webview of both editors: the shell's HTML, CSP and appearance around dist/webview.js. */
export function setWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): void {
  const dist = vscode.Uri.joinPath(extensionUri, "dist");
  // dist holds the script, the stylesheet and the font files (fonts/), which the CSP allows from
  // the webview's resource origin.
  webview.options = { enableScripts: true, localResourceRoots: [dist] };
  const asset = (file: string): string =>
    webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
  webview.html = renderWebviewHtml({
    cspSource: webview.cspSource,
    scriptUri: asset("webview.js"),
    styleUris: [asset("webview.css")],
    title: WEBVIEW_TITLE,
    lang: "en",
    appearance: currentAppearance(vscode, { themes: WEBVIEW_THEMES }),
    body: '<div id="app"></div>',
  });
}

/**
 * CustomTextEditor for `.cm` / `.cm.json`. The document (native JSON) remains the source of truth
 * — VS Code handles dirty state, saving, Git, diff, and file undo "for free". The webview renders
 * the diagram inside the Miragon modeler shell and mirrors graphical changes back into the
 * document as minimal WorkspaceEdits.
 */
export class CmEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = MAP_VIEW_TYPE;

  public static register(
    context: vscode.ExtensionContext,
    panels: ActivePanels,
    diagnostics: vscode.DiagnosticCollection,
  ): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      CmEditorProvider.viewType,
      new CmEditorProvider(context, panels, diagnostics),
      {
        // A hidden tab keeps document, view and selection (and reports 0 × 0 meanwhile).
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panels: ActivePanels,
    private readonly diagnostics: vscode.DiagnosticCollection,
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    setWebviewHtml(webviewPanel.webview, this.context.extensionUri);
    const session = new MapSession(document, webviewPanel, this.diagnostics);
    const tracking = this.panels.track(webviewPanel, document.uri, { text: true });
    // Disposes itself with the panel; disposed here as well so nothing outlives the editor.
    const themeBridge = connectThemeBridge(vscode, webviewPanel, { themes: WEBVIEW_THEMES });
    webviewPanel.onDidDispose(() => {
      tracking.dispose();
      themeBridge.dispose();
      session.dispose();
    });
  }
}
