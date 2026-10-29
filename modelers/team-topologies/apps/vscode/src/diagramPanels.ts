import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { DIAGRAM_VIEW_TYPE, revealRestoredTab } from "./commands.js";
import type { HostToWebview, WebviewCommand } from "./protocol.js";
import { TEAM_TOPOLOGIES_THEMES } from "../../../packages/renderer/src/theme/themes.js";

interface TrackedPanel {
  readonly panel: vscode.WebviewPanel;
  readonly uri: vscode.Uri;
  /** A text document: it has a source to open beside the diagram. */
  readonly text: boolean;
}

/**
 * The diagram webviews of both editors (text and PNG): the HTML, CSP and theme bridge of the
 * modeler shell for each, the focused one, so Command Palette commands reach it, and the order they
 * were focused in, so Open Source to the Side finds a diagram after a walkthrough link took the
 * focus.
 */
export class DiagramPanels {
  private active: TrackedPanel | undefined;
  /** The open diagrams of both editors, the one focused last first. */
  private readonly byFocus: TrackedPanel[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Renders the webview into `panel` and follows it until it closes. */
  show(panel: vscode.WebviewPanel, uri: vscode.Uri, { text }: { text: boolean }): void {
    const webview = panel.webview;
    const dist = vscode.Uri.joinPath(this.extensionUri, "dist");
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset("webview.js"),
      styleUris: [asset("webview.css")],
      title: "Team Topologies Diagram",
      lang: "en",
      appearance: currentAppearance(vscode, { themes: TEAM_TOPOLOGIES_THEMES }),
      body: '<div id="app"></div>',
    });
    // Disposes itself with the panel; never kept in context.subscriptions.
    connectThemeBridge(vscode, panel, { themes: TEAM_TOPOLOGIES_THEMES });

    const tracked: TrackedPanel = { panel, uri, text };
    if (panel.active) {
      this.active = tracked;
      this.byFocus.unshift(tracked);
    } else {
      this.byFocus.push(tracked);
    }
    const viewState = panel.onDidChangeViewState(() => {
      if (panel.active) {
        this.active = tracked;
        this.bringToFront(tracked);
      } else if (this.active === tracked) {
        this.active = undefined;
      }
    });
    panel.onDidDispose(() => {
      viewState.dispose();
      if (this.active === tracked) this.active = undefined;
      this.forget(tracked);
    });
  }

  private forget(tracked: TrackedPanel): void {
    const index = this.byFocus.indexOf(tracked);
    if (index !== -1) this.byFocus.splice(index, 1);
  }

  private bringToFront(tracked: TrackedPanel): void {
    this.forget(tracked);
    this.byFocus.unshift(tracked);
  }

  /**
   * Forwards a Command Palette command to the focused diagram, never to one focused earlier; false
   * when none is focused.
   */
  runCommand(name: WebviewCommand): boolean {
    if (!this.active) return false;
    void this.active.panel.webview.postMessage({ type: "command", name } satisfies HostToWebview);
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
    if (this.active) return this.active.text ? this.active.uri : undefined;
    const last = this.byFocus.find((tracked) => tracked.text);
    if (!last) return revealRestoredTab(DIAGRAM_VIEW_TYPE);
    last.panel.reveal(undefined, false);
    return last.uri;
  }
}
