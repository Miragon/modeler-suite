import * as vscode from "vscode";
import {
  connectThemeBridge,
  currentAppearance,
  renderWebviewHtml,
} from "@miragon/modeler-shell/vscode/extension";
import { PNG_VIEW_TYPE, type ActivePanels } from "./commands.js";
import { toDiagnostics } from "./diagnostics.js";
import { EMPTY_MAP, withExampleInserted } from "./examples.js";
import { exportToFile, fontFallbackText } from "./exportImage.js";
import { WEBVIEW_TITLE } from "./mapEditorOptions.js";
import { EMBED_KEYWORD, decodeDoc, pngExtractText } from "./png.js";
import { mapProblems, problemCounts } from "./problems.js";
import type { HostToWebview, WebviewToHost } from "./protocol.js";
import { WEBVIEW_THEMES } from "./themes.js";

/**
 * The webview of the `.cm.png` editor, the same document the shell's plumbing writes for the `.cm`
 * editor, since both run one bundle: the shell's HTML, CSP and appearance around dist/webview.js.
 */
function setWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): void {
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
  });
}

/**
 * How long to wait for the webview's rasterized PNG before the save aborts. Generously sized:
 * rasterizing large diagrams on slow machines must not abort falsely (a timeout leaves the document
 * "dirty" -> the user can save again, nothing is lost).
 */
const PNG_TIMEOUT_MS = 60_000;

/**
 * In-memory model of a `.cm.png`/`.cm.png` file. The source of truth is the native JSON (`text`);
 * on disk lives a rendered PNG with the JSON embedded as a tEXt chunk.
 */
class CmPngDocument implements vscode.CustomDocument {
  text: string;
  /** Originated from an empty/new file -> mark "dirty" once on the first `ready`. */
  isNew: boolean;
  /** Prevents seeding the dirty state more than once across webview reloads. */
  seededDirty = false;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  constructor(
    readonly uri: vscode.Uri,
    text: string,
    isNew: boolean,
  ) {
    this.text = text;
    this.isNew = isNew;
  }

  dispose(): void {
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}

/** Link between document <-> active webview (exactly one, since supportsMultipleEditorsPerDocument=false). */
interface PanelBinding {
  readonly webview: vscode.Webview;
  readonly pending: Map<number, PendingPng>;
  nextId: number;
}

interface RenderedPng {
  readonly base64: string;
  readonly fontFallback: boolean;
}

interface PendingPng {
  /** Resolve/reject clean up internally (timer, cancellation subscription, map entry). */
  resolve: (rendered: RenderedPng) => void;
  reject: (err: Error) => void;
}

/**
 * Binary CustomEditor for `*.cm.png` / `*.cm.png` (embedded Context Maps document).
 *
 * While the text editor (`.cm`/`.cm.json`) uses the TextDocument as its source of truth, the PNG
 * file is binary — hence a dedicated CustomDocument with a self-managed dirty/undo/save/backup
 * lifecycle. Rendering/serialization happens in the SAME webview as the text editor; only for saving
 * does the host fetch the rasterized PNG via a `requestPng` roundtrip (a canvas only exists in the
 * browser, not in the Node host).
 */
export class CmPngEditorProvider implements vscode.CustomEditorProvider<CmPngDocument> {
  public static readonly viewType = PNG_VIEW_TYPE;

  public static register(
    context: vscode.ExtensionContext,
    panels: ActivePanels,
    diagnostics: vscode.DiagnosticCollection,
  ): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      CmPngEditorProvider.viewType,
      new CmPngEditorProvider(context, panels, diagnostics),
      {
        // Keep the modeler in memory for as long as the tab exists: needed so `saveCustomDocument`
        // can rasterize the diagram even with a hidden editor (otherwise no canvas -> no save).
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

  private readonly bindings = new Map<CmPngDocument, PanelBinding>();

  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<CmPngDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChange.event;

  // -------------------------------------------------------------------------
  // Open / Resolve
  // -------------------------------------------------------------------------

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<CmPngDocument> {
    const bytes = await this.readSource(uri, openContext.backupId);
    const { text, isNew } = loadDoc(bytes);
    return new CmPngDocument(uri, text, isNew);
  }

  /** Read the source bytes: prefer the backup (hot-exit), otherwise the file itself. */
  private async readSource(uri: vscode.Uri, backupId: string | undefined): Promise<Uint8Array> {
    const candidates = backupId ? [vscode.Uri.parse(backupId), uri] : [uri];
    for (const candidate of candidates) {
      try {
        return await vscode.workspace.fs.readFile(candidate);
      } catch {
        /* try the next source */
      }
    }
    return new Uint8Array(); // does not exist (yet) -> treat as empty/new diagram
  }

  public async resolveCustomEditor(
    document: CmPngDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    setWebviewHtml(webview, this.context.extensionUri);

    const binding: PanelBinding = { webview, pending: new Map(), nextId: 1 };
    this.bindings.set(document, binding);
    const tracking = this.panels.track(webviewPanel, document.uri, { text: false });
    const themeBridge = connectThemeBridge(vscode, webviewPanel, { themes: WEBVIEW_THEMES });

    const post = (msg: HostToWebview): Thenable<boolean> => webview.postMessage(msg);

    const messageSub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      switch (msg.type) {
        case "ready":
          await post({ type: "init", text: document.text });
          this.publishProblems(document);
          // New (empty) file: set "dirty" once so the first Cmd+S materializes a real PNG
          // (otherwise a 0-byte placeholder file sits there until the first edit).
          if (document.isNew && !document.seededDirty) {
            document.seededDirty = true;
            this.markCreated(document);
          }
          break;
        case "edit":
          this.onWebviewEdit(document, msg.text);
          break;
        case "insertExample": {
          const text = withExampleInserted(document.text);
          if (text === undefined) break;
          // One edit of the document's history; the canvas learns about it through the update
          // and fits, as after "Insert example" in the text editor.
          this.onWebviewEdit(document, text);
          await post({ type: "update", text });
          break;
        }
        case "export":
          await exportToFile(document.uri, msg.format, msg.data, msg.fontFallback);
          break;
        case "pngResponse":
          this.resolvePng(binding, msg);
          break;
        case "showProblems":
          void vscode.commands.executeCommand("workbench.actions.view.problems");
          break;
        case "error":
          void vscode.window.showErrorMessage(msg.message);
          break;
      }
    });

    webviewPanel.onDidDispose(() => {
      messageSub.dispose();
      tracking.dispose();
      themeBridge.dispose();
      this.diagnostics.delete(document.uri);
      if (this.bindings.get(document) === binding) this.bindings.delete(document);
      // Cleanly abort pending save/backup roundtrips of this (now dead) webview. Snapshot first,
      // because reject() deletes from binding.pending (don't mutate the iterator during iteration).
      const closeErr = new Error(
        "The Context Maps editor was closed before the PNG could be rendered.",
      );
      for (const p of [...binding.pending.values()]) p.reject(closeErr);
    });
  }

  // -------------------------------------------------------------------------
  // Edits / Undo-Redo (dirty state via the edit stack)
  // -------------------------------------------------------------------------

  /**
   * The embedded map's problems: in the Problems view (at the start of the file, since the PNG's
   * bytes are not the text they were found in) and on the webview's pill.
   */
  private publishProblems(document: CmPngDocument): void {
    const problems = mapProblems(document.text);
    this.diagnostics.set(document.uri, toDiagnostics(document.text, problems, true));
    void this.bindings.get(document)?.webview.postMessage({
      type: "problems",
      ...problemCounts(problems),
    } satisfies HostToWebview);
  }

  private onWebviewEdit(document: CmPngDocument, text: string): void {
    if (text === document.text) return;
    const before = document.text;
    const after = text;
    document.text = after;
    document.isNew = false;
    this.publishProblems(document);
    // Undo/Redo post to the CURRENT webview (via `bindings`), not one captured when the edit was
    // created: if the editor is moved to another group, the original webview is disposed and
    // replaced by a new one — a captured `post` would otherwise go nowhere. Cf. revertCustomDocument.
    this._onDidChange.fire({
      document,
      label: "Edit diagram",
      undo: () => {
        document.text = before;
        this.publishProblems(document);
        void this.bindings.get(document)?.webview.postMessage({ type: "update", text: before });
      },
      redo: () => {
        document.text = after;
        this.publishProblems(document);
        void this.bindings.get(document)?.webview.postMessage({ type: "update", text: after });
      },
    });
  }

  /**
   * Synthetic "Create" edit for a new, empty file: no content delta (the editor already shows the
   * empty diagram), only dirty state. Undo/Redo are no-ops — the state is EMPTY_MAP everywhere, VS
   * Code merely moves the save pointer.
   */
  private markCreated(document: CmPngDocument): void {
    this._onDidChange.fire({
      document,
      label: "Create diagram",
      undo: () => {},
      redo: () => {},
    });
  }

  // -------------------------------------------------------------------------
  // Save / Backup / Revert
  // -------------------------------------------------------------------------

  public async saveCustomDocument(
    document: CmPngDocument,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const fontFallback = await this.writePng(document, document.uri, cancellation);
    document.isNew = false;
    if (fontFallback) warnFontFallback(document.uri);
  }

  public async saveCustomDocumentAs(
    document: CmPngDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    if (await this.writePng(document, destination, cancellation)) warnFontFallback(destination);
  }

  public async backupCustomDocument(
    document: CmPngDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    // The parent folder of the backup target (usually under storagePath) may not exist yet — the
    // VS Code API requires creating it before writing, otherwise the backup (hot-exit) fails.
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(context.destination, ".."));
    await this.writePng(document, context.destination, cancellation);
    return {
      id: context.destination.toString(),
      delete: () => {
        void vscode.workspace.fs.delete(context.destination).then(undefined, () => {
          /* backup may already be gone -> ignore */
        });
      },
    };
  }

  public async revertCustomDocument(
    document: CmPngDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const bytes = await this.readSource(document.uri, undefined);
    const { text } = loadDoc(bytes);
    document.text = text;
    document.isNew = false;
    document.seededDirty = false;
    this.publishProblems(document);
    await this.bindings.get(document)?.webview.postMessage({ type: "update", text });
  }

  /** Writes the webview's PNG to `target`; true when its labels are in the system font. */
  private async writePng(
    document: CmPngDocument,
    target: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<boolean> {
    const { base64, fontFallback } = await this.requestPng(document, cancellation);
    if (cancellation.isCancellationRequested) return false;
    await vscode.workspace.fs.writeFile(target, new Uint8Array(Buffer.from(base64, "base64")));
    return fontFallback;
  }

  // -------------------------------------------------------------------------
  // PNG roundtrip with the webview
  // -------------------------------------------------------------------------

  private requestPng(
    document: CmPngDocument,
    cancellation: vscode.CancellationToken,
  ): Promise<RenderedPng> {
    const binding = this.bindings.get(document);
    if (!binding) {
      return Promise.reject(
        new Error("Cannot save this Context Maps diagram: its editor view is not available."),
      );
    }
    if (cancellation.isCancellationRequested) {
      return Promise.reject(new vscode.CancellationError());
    }
    const id = binding.nextId++;
    return new Promise<RenderedPng>((resolve, reject) => {
      const cleanup = (): void => {
        binding.pending.delete(id);
        clearTimeout(timer);
        cancelSub.dispose();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while rendering the PNG."));
      }, PNG_TIMEOUT_MS);
      // Propagate cancellation (e.g. a new save overtakes the old one) immediately, instead of
      // blocking until the timeout. `cleanup` runs here too, so a late response is cleanly discarded.
      const cancelSub = cancellation.onCancellationRequested(() => {
        cleanup();
        reject(new vscode.CancellationError());
      });
      binding.pending.set(id, {
        resolve: (rendered) => {
          cleanup();
          resolve(rendered);
        },
        reject: (err) => {
          cleanup();
          reject(err);
        },
      });
      void binding.webview.postMessage({ type: "requestPng", id });
    });
  }

  private resolvePng(
    binding: PanelBinding,
    msg: Extract<WebviewToHost, { type: "pngResponse" }>,
  ): void {
    const pending = binding.pending.get(msg.id);
    if (!pending) return; // unknown/too-late id (timeout/cancellation/dispose already cleaned up)
    if (msg.error) pending.reject(new Error(msg.error));
    else if (typeof msg.data === "string" && msg.data.length > 0) {
      pending.resolve({ base64: msg.data, fontFallback: msg.fontFallback === true });
    } else pending.reject(new Error("The PNG render returned no data."));
  }
}

/** The save went through, so the notice names the file; the console reaches no user (guide §9). */
function warnFontFallback(target: vscode.Uri): void {
  const fileName = target.path.slice(target.path.lastIndexOf("/") + 1);
  void vscode.window.showWarningMessage(fontFallbackText(`Saved ${fileName}`));
}

/**
 * Bytes -> document JSON. Empty file = new/empty diagram (EMPTY_MAP). A non-empty file WITHOUT an
 * embedded scene is not an editable Context Maps PNG -> a descriptive error (otherwise a normal
 * image would be overwritten on save).
 */
function loadDoc(bytes: Uint8Array): { text: string; isNew: boolean } {
  if (bytes.length === 0) return { text: EMPTY_MAP, isNew: true };
  const embedded = pngExtractText(bytes, EMBED_KEYWORD);
  if (!embedded) {
    throw new Error(
      "This PNG file does not contain an embedded Context Maps diagram. " +
        "Only PNGs exported from the Context Maps editor (with an embedded diagram) can be edited here.",
    );
  }
  return { text: decodeDoc(embedded), isNew: false };
}
