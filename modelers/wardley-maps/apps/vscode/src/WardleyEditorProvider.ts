import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { WARDLEY_THEMES } from "@miragon/wardley-renderer/themes";
import { exportImageToFile } from "./exportImage.js";
import { withExampleInserted } from "./examples.js";
import { minimalLineEdit } from "./minimalEdit.js";
import type { WardleyDiagnostics } from "./diagnostics.js";
import type { HostToWebview, WebviewCommand, WebviewToHost } from "./protocol.js";

interface OpenMap {
  readonly uri: vscode.Uri;
  readonly panel: vscode.WebviewPanel;
}

/** Echo keys ignore the line break style: VS Code writes inserted '\n' as the document's EOL. */
function echoKey(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Shows a map tab VS Code restored after a reload and returns its document. VS Code resolves a
 * restored tab only once it is shown, so until then the provider knows no panel of it. A tab in the
 * active group comes first (the walkthrough is restored in front of it), then the tab each group
 * shows, then any other.
 */
async function revealRestoredMapTab(): Promise<vscode.Uri | undefined> {
  const { activeTabGroup, all } = vscode.window.tabGroups;
  const tabs = [
    ...activeTabGroup.tabs,
    ...all.flatMap((group) => (group.activeTab ? [group.activeTab] : [])),
    ...all.flatMap((group) => group.tabs),
  ];
  for (const tab of tabs) {
    const input = tab.input;
    if (
      input instanceof vscode.TabInputCustom &&
      input.viewType === WardleyEditorProvider.viewType
    ) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        input.uri,
        WardleyEditorProvider.viewType,
        tab.group.viewColumn,
      );
      return input.uri;
    }
  }
  return undefined;
}

/**
 * CustomTextEditor for `.wmap` / `.owm`. The document (OWM-DSL text) remains the source of truth —
 * VS Code handles dirty state, saving, Git, diff, and file undo "for free". The webview renders the
 * map (diagram-js modeler) and mirrors graphical changes back into the document via WorkspaceEdit.
 */
export class WardleyEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "wardley.mapEditor";

  public static register(
    context: vscode.ExtensionContext,
    diagnostics?: WardleyDiagnostics,
  ): { provider: WardleyEditorProvider; registration: vscode.Disposable } {
    const provider = new WardleyEditorProvider(context, diagnostics);
    const registration = vscode.window.registerCustomEditorProvider(
      WardleyEditorProvider.viewType,
      provider,
      {
        // A hidden tab keeps document, view and selection (and reports 0 × 0 meanwhile).
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
    return { provider, registration };
  }

  /** Open diagram panels by document URI (one per document). */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private activePanelKey: string | undefined;
  /** The open maps, the one focused last first. */
  private readonly openMaps: OpenMap[] = [];

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics?: WardleyDiagnostics,
  ) {}

  /**
   * Shows the map Open Source to the Side means without a resource and returns its document: the
   * focused map, else the open map focused last (a link in the walkthrough takes the focus from the
   * map it means), else a map tab VS Code restored after a reload. Showing it focuses its group, so
   * the source opens beside the map, not beside the walkthrough.
   */
  public async revealSourceMap(): Promise<vscode.Uri | undefined> {
    const last = this.openMaps[0];
    if (!last) return revealRestoredMapTab();
    if (!last.panel.active) last.panel.reveal(undefined, false);
    return last.uri;
  }

  private forget(map: OpenMap): void {
    const index = this.openMaps.indexOf(map);
    if (index !== -1) this.openMaps.splice(index, 1);
  }

  private bringToFront(map: OpenMap): void {
    this.forget(map);
    this.openMaps.unshift(map);
  }

  /**
   * Runs a diagram action in the editor of `uri` (default: the focused diagram, never one focused
   * earlier). Returns false when no such diagram is open.
   */
  public runCommand(name: WebviewCommand, uri?: vscode.Uri): boolean {
    const key = uri?.toString() ?? this.activePanelKey;
    const panel = key ? this.panels.get(key) : undefined;
    if (!panel) return false;
    void panel.webview.postMessage({ type: "command", name } satisfies HostToWebview);
    return true;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    // dist/ holds webview.js, webview.css and the font files the CSS loads.
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset("webview.js"),
      styleUris: [asset("webview.css")],
      title: "Wardley Map",
      lang: "en",
      appearance: currentAppearance(vscode, { themes: WARDLEY_THEMES }),
      body: '<div id="app"></div>',
    });
    const themeBridge = connectThemeBridge(vscode, webviewPanel, { themes: WARDLEY_THEMES });

    const post = (msg: HostToWebview): Thenable<boolean> => webview.postMessage(msg);
    const key = document.uri.toString();
    this.panels.set(key, webviewPanel);
    const map: OpenMap = { uri: document.uri, panel: webviewPanel };
    if (webviewPanel.active) {
      this.activePanelKey = key;
      this.openMaps.unshift(map);
    } else {
      this.openMaps.push(map);
    }

    // Texts the webview itself produced — to suppress the echo (an own change comes back as
    // onDidChangeTextDocument) and NOT reset the canvas. A SET (not a single value): for edits A,B
    // in quick succession, EVERY echo must be suppressed, regardless of the order in which the
    // change events arrive.
    const suppressEcho = new Set<string>();

    // Edits are written one at a time, each diffed against the document as it is by then: a range
    // computed before the previous edit landed would point at the wrong lines, and VS Code rejects
    // an edit made against an older document version. Every edit carries the whole text, so edits
    // that queue up behind a running write collapse into the newest one.
    let queuedText: string | undefined;
    let writes: Promise<void> = Promise.resolve();
    const queueEdit = (text: string): Promise<void> => {
      queuedText = text;
      writes = writes.then(async () => {
        if (queuedText === undefined) return;
        const latest = queuedText;
        queuedText = undefined;
        const written = await this.applyMinimalEdit(document, latest, suppressEcho);
        // The canvas already shows the change; when the document refused it (read-only), show the
        // document again — unless a newer edit is queued, whose outcome decides instead.
        if (!written && queuedText === undefined) {
          void post({ type: "update", text: document.getText() });
        }
      });
      return writes;
    };
    // "Insert example" is no echo: the canvas learns about it through the update, imports and fits.
    const insertExample = (): Promise<void> => {
      writes = writes.then(async () => {
        await this.applyMinimalEdit(document, withExampleInserted(document.getText()), undefined);
      });
      return writes;
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== key) return;
      const text = document.getText();
      if (suppressEcho.delete(echoKey(text))) return;
      void post({ type: "update", text });
    });

    const viewStateSub = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.activePanelKey = key;
        this.bringToFront(map);
      } else if (this.activePanelKey === key) {
        this.activePanelKey = undefined;
      }
    });

    // The parser's findings are warnings: the map stays editable (guide §13.5), so no errors.
    const diagnosticsSub = this.diagnostics?.onDidChange(({ uri, count }) => {
      if (uri.toString() === key) void post({ type: "problems", count, errors: 0 });
    });

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      switch (msg.type) {
        case "ready":
          await post({ type: "init", text: document.getText() });
          this.diagnostics?.refresh(document);
          break;
        case "edit":
          await queueEdit(msg.text);
          break;
        case "insertExample":
          await insertExample();
          break;
        case "export":
          await exportImageToFile(document.uri, msg.format, msg.data, msg.fontFallback === true);
          break;
        case "showProblems":
          void vscode.commands.executeCommand("workbench.actions.view.problems");
          break;
        case "info":
          void vscode.window.showInformationMessage(msg.message);
          break;
        case "error":
          void vscode.window.showErrorMessage(msg.message);
          break;
      }
    });

    this.diagnostics?.refresh(document);

    webviewPanel.onDidDispose(() => {
      themeBridge.dispose();
      changeSub.dispose();
      viewStateSub.dispose();
      diagnosticsSub?.dispose();
      messageSub.dispose();
      if (this.panels.get(key) === webviewPanel) this.panels.delete(key);
      if (this.activePanelKey === key) this.activePanelKey = undefined;
      this.forget(map);
    });
  }

  /**
   * Writes `text` into the document, touching only the lines that differ, so the cursor of a
   * side-by-side text editor stays where it is. Resolves to false when the document refused it.
   */
  private async applyMinimalEdit(
    document: vscode.TextDocument,
    text: string,
    suppressEcho: Set<string> | undefined,
  ): Promise<boolean> {
    if (document.getText() === text) return true;
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);
    const change = minimalLineEdit(lines, text);
    if (!change) return true;
    // Register first (synchronously, before applyEdit), so the resulting change event is reliably
    // recognized as an echo. Only add when a write actually happens -> no orphaned set entries.
    const key = echoKey(text);
    suppressEcho?.add(key);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(
        change.start.line,
        change.start.character,
        change.end.line,
        change.end.character,
      ),
      change.text,
    );
    const ok = await vscode.workspace.applyEdit(edit).then(
      (applied) => applied,
      () => false,
    );
    if (!ok) suppressEcho?.delete(key); // write failed (e.g. read-only) -> no echo
    return ok;
  }
}
