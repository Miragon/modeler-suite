import * as vscode from 'vscode';
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
  revealFileLabel,
} from '@miragon/modeler-shell/vscode/extension';
import { DIAGRAM_VIEW_TYPE, registerSideBySideCommands } from './commands.js';
import { DIAGNOSTIC_SOURCE, documentDiagnostics } from './diagnostics.js';
import { DocumentWriter } from './DocumentWriter.js';
import { withExampleInserted } from './examples.js';
import type { ExportFormat, HostToWebview, WebviewToHost } from './protocol.js';
import { WEBVIEW_THEMES } from './themes.js';

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
      ...registerSideBySideCommands(() => provider.activeDocumentUri()),
    );
  }

  private readonly diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  private activePanel: vscode.WebviewPanel | undefined;
  private readonly documentOfPanel = new WeakMap<vscode.WebviewPanel, vscode.Uri>();

  private constructor(private readonly context: vscode.ExtensionContext) {}

  /** The document of the focused diagram, if a diagram editor has the focus. */
  activeDocumentUri(): vscode.Uri | undefined {
    return this.activePanel ? this.documentOfPanel.get(this.activePanel) : undefined;
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
      appearance: currentAppearance(vscode, { themes: WEBVIEW_THEMES }),
      body: '<div id="app"></div>',
    });
    // Disposes itself with the panel; never into context.subscriptions (one per opened editor).
    connectThemeBridge(vscode, panel, { themes: WEBVIEW_THEMES });

    this.documentOfPanel.set(panel, document.uri);
    if (panel.active) this.activePanel = panel;

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
        if (panel.active) this.activePanel = panel;
        else if (this.activePanel === panel) this.activePanel = undefined;
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
            await exportToFile(document.uri, message.format, message.data);
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
      if (this.activePanel === panel) this.activePanel = undefined;
    });
  }
}

/** Save dialog next to the document, then a notification instead of a toast (guide §13.5). */
async function exportToFile(source: vscode.Uri, format: ExportFormat, data: string): Promise<void> {
  const base = source.path.replace(/\.[^./]+$/, '');
  const target = await vscode.window.showSaveDialog({
    defaultUri: source.with({ path: `${base}.${format}` }),
    filters: { [format.toUpperCase()]: [format] },
  });
  if (!target) return;
  const bytes = format === 'png' ? Buffer.from(data, 'base64') : new TextEncoder().encode(data);
  await vscode.workspace.fs.writeFile(target, bytes);
  const reveal = revealFileLabel(process.platform);
  const choice = await vscode.window.showInformationMessage(
    `Exported ${vscode.workspace.asRelativePath(target)}.`,
    reveal,
  );
  if (choice === reveal) void vscode.commands.executeCommand('revealFileInOS', target);
}
