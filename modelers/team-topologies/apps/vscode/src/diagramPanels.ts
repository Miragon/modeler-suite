import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { revealRestoredTab } from "./commands.js";
import type { DiagramEditors } from "./diagramEditor.js";
import { DIAGRAM_EDITOR_OPTIONS, DIAGRAM_VIEW_TYPE } from "./diagramEditorOptions.js";
import type { HostToWebview, WebviewCommand } from "./protocol.js";

/**
 * The diagram webviews of both editors, for the commands that name none. The text diagrams are the
 * shell's document plumbing's (`textDiagrams`); the PNG diagrams are rendered here, with the HTML,
 * CSP and theme bridge of the modeler shell, and followed until they close, so a Command Palette
 * command reaches the focused one and Open Source to the Side passes over it.
 */
export class DiagramPanels {
  private activePng: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly textDiagrams: DiagramEditors,
  ) {}

  /** Renders the webview into a PNG editor's `panel` and follows it until it closes. */
  show(panel: vscode.WebviewPanel): void {
    const webview = panel.webview;
    const dist = vscode.Uri.joinPath(this.extensionUri, "dist");
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset("webview.js"),
      styleUris: [asset("webview.css")],
      title: DIAGRAM_EDITOR_OPTIONS.title,
      lang: "en",
      appearance: currentAppearance(vscode, { themes: DIAGRAM_EDITOR_OPTIONS.themes }),
    });
    // Disposes itself with the panel; never kept in context.subscriptions.
    connectThemeBridge(vscode, panel, { themes: DIAGRAM_EDITOR_OPTIONS.themes });

    if (panel.active) this.activePng = panel;
    const viewState = panel.onDidChangeViewState(() => {
      if (panel.active) this.activePng = panel;
      else if (this.activePng === panel) this.activePng = undefined;
    });
    panel.onDidDispose(() => {
      viewState.dispose();
      if (this.activePng === panel) this.activePng = undefined;
    });
  }

  /**
   * Forwards a Command Palette command to the focused diagram, never to one focused earlier; false
   * when none is focused.
   */
  runCommand(name: WebviewCommand): boolean {
    if (this.textDiagrams.runCommand(name)) return true;
    if (!this.activePng) return false;
    void this.activePng.webview.postMessage({ type: "command", name } satisfies HostToWebview);
    return true;
  }

  /**
   * Shows the text diagram Open Source to the Side means without a resource and returns its
   * document: the focused diagram, else the text diagram focused last (a link in the walkthrough
   * takes the focus from the diagram it means), else a text diagram tab VS Code restored after a
   * reload. Showing it focuses its group, so the source opens beside the diagram, not beside the
   * walkthrough. A focused PNG diagram has no text.
   */
  async revealTextDiagram(): Promise<vscode.Uri | undefined> {
    if (this.activePng) return undefined;
    return this.textDiagrams.revealActiveDocument() ?? revealRestoredTab(DIAGRAM_VIEW_TYPE);
  }
}
