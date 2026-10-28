import * as vscode from 'vscode';
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
  revealFileLabel,
} from '@miragon/modeler-shell/vscode/extension';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import { DIAGRAM_VIEW_TYPE, registerSideBySideCommands, revealRestoredTab } from './commands.js';
import { DIAGNOSTIC_SOURCE, documentDiagnostics } from './diagnostics.js';
import { DocumentWriter } from './DocumentWriter.js';
import { withExampleInserted } from './examples.js';
import type { ExportFormat, HostToWebview, WebviewToHost } from './protocol.js';

interface OpenDiagram {
  readonly uri: vscode.Uri;
  readonly panel: vscode.WebviewPanel;
}

/**
 * The custom text editor: the document stays the source of truth, so VS Code owns dirty state,
 * saving, Git, diff and undo (guide §13.5). The webview renders it inside the modeler shell and
 * writes every canvas edit back as one minimal WorkspaceEdit.
 */
export class EditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = DIAGRAM_VIEW_TYPE;

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new EditorProvider(context);
    return vscode.Disposable.from(
      vscode.window.registerCustomEditorProvider(EditorProvider.viewType, provider, {
        // A hidden tab keeps document, view and selection.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }),
      provider.diagnostics,
      ...registerSideBySideCommands(() => provider.revealSourceDiagram()),
    );
  }

  private readonly diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  /** The open diagrams, the one focused last first. */
  private readonly openDiagrams: OpenDiagram[] = [];

  private constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Shows the diagram Open Source to the Side means without a resource and returns its document:
   * the focused diagram, else the open diagram focused last (a link in the walkthrough takes the
   * focus from the diagram it means), else a diagram tab VS Code restored after a reload. Showing it
   * focuses its group, so the source opens beside the diagram, not beside the walkthrough.
   */
  async revealSourceDiagram(): Promise<vscode.Uri | undefined> {
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

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = panel.webview;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const asset = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(dist, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset('webview.js'),
      styleUris: [asset('webview.css')],
      title: '__DISPLAY_NAME__',
      lang: 'en',
      // on <html> before the first paint: no flash of the wrong mode
      appearance: currentAppearance(vscode, { themes: THEMES }),
      body: '<div id="app"></div>',
    });
    // Disposes itself with the panel; never into context.subscriptions (one per opened editor).
    connectThemeBridge(vscode, panel, { themes: THEMES });

    const diagram: OpenDiagram = { uri: document.uri, panel };
    if (panel.active) this.openDiagrams.unshift(diagram);
    else this.openDiagrams.push(diagram);

    const writer = new DocumentWriter(document);
    const post = (message: HostToWebview) => void webview.postMessage(message);
    const refreshDiagnostics = () => {
      const findings = documentDiagnostics(document.getText());
      this.diagnostics.set(document.uri, findings);
      const errors = findings.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
      post({ type: 'problems', count: findings.length, errors });
    };

    const subscriptions = [
      panel.onDidChangeViewState(() => {
        if (panel.active) this.bringToFront(diagram);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) return;
        if (event.contentChanges.length === 0) return;
        refreshDiagnostics();
        if (!writer.consumeEcho()) post({ type: 'update', text: document.getText() });
      }),
      webview.onDidReceiveMessage(async (message: WebviewToHost) => {
        switch (message.type) {
          case 'ready':
            post({ type: 'init', text: document.getText() });
            refreshDiagnostics();
            break;
          case 'edit':
            await writer.write(() => message.text, { suppressEcho: true });
            break;
          case 'insertExample':
            await writer.write(withExampleInserted, { suppressEcho: false });
            break;
          case 'export':
            await exportToFile(document.uri, message.format, message.data, message.fontFallback);
            break;
          case 'showProblems':
            void vscode.commands.executeCommand('workbench.actions.view.problems');
            break;
          case 'error':
            void vscode.window.showErrorMessage(message.message);
            break;
        }
      }),
    ];
    panel.onDidDispose(() => {
      for (const subscription of subscriptions) subscription.dispose();
      this.diagnostics.delete(document.uri);
      this.forget(diagram);
    });
  }
}

/** Save dialog next to the document, then a notification instead of a toast (guide §13.5). */
async function exportToFile(
  source: vscode.Uri,
  format: ExportFormat,
  data: string,
  fontFallback = false,
): Promise<void> {
  const base = source.path.replace(/\.[^./]+$/, '');
  const target = await vscode.window.showSaveDialog({
    defaultUri: source.with({ path: `${base}.${format}` }),
    filters: { [format.toUpperCase()]: [format] },
  });
  if (!target) return;
  const bytes = format === 'png' ? Buffer.from(data, 'base64') : new TextEncoder().encode(data);
  await vscode.workspace.fs.writeFile(target, bytes);
  const reveal = revealFileLabel(process.platform);
  const exported = `Exported ${vscode.workspace.asRelativePath(target)}`;
  const choice = fontFallback
    ? await vscode.window.showWarningMessage(
        `${exported} in a system font. Geist couldn't be embedded.`,
        reveal,
      )
    : await vscode.window.showInformationMessage(`${exported}.`, reveal);
  if (choice === reveal) void vscode.commands.executeCommand('revealFileInOS', target);
}
