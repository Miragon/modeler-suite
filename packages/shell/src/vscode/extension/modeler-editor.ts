import type { Theme } from "../../core/index.js";
import {
  isTypedMessage,
  type DocumentHostMessage,
  type ProblemCounts,
  type TypedMessage,
} from "../protocol.js";
import { createDocumentWriter } from "./document-writer.js";
import { renderWebviewHtml } from "./html.js";
import { connectThemeBridge, currentAppearance } from "./theme-bridge.js";
import type {
  DisposableLike,
  EditorWebviewPanelLike,
  TextDocumentLike,
  UriLike,
  VsCodeEditorLike,
} from "./types.js";

/** The modeler's diagnostics, as functions of the document (each notation finds its own problems). */
export interface ModelerEditorDiagnostics<Document extends TextDocumentLike = TextDocumentLike> {
  /**
   * Finds the problems of `document`, keeps them where the Problems view reads them (the modeler's
   * `DiagnosticCollection`) and returns the pill's counts. Called when the editor opens, when its
   * webview is ready and after every change of the text, the webview's own edits included: an
   * edit on the canvas can add or remove a finding.
   */
  refresh(document: Document): ProblemCounts;
  /** The editor of `document` closed: drop what only it kept up to date. */
  clear?: ((document: Document) => void) | undefined;
}

/** One open editor, for the modeler's own messages and hooks. */
export interface ModelerEditor<Document extends TextDocumentLike = TextDocumentLike> {
  readonly document: Document;
  readonly panel: EditorWebviewPanelLike;
  /** Posts to this editor's webview. */
  post(message: unknown): PromiseLike<boolean>;
  /** Resolves once every edit queued so far has landed or was refused. */
  written(): Promise<void>;
}

export interface ModelerEditorOptions<
  Document extends TextDocumentLike = TextDocumentLike,
  Message extends TypedMessage = TypedMessage,
> {
  /** `contributes.customEditors[].viewType` of the extension's `package.json`. */
  viewType: string;
  /** The webview document's `<title>`. */
  title: string;
  /** The modes the webview can show, for the theme bridge and the HTML's first paint. */
  themes: readonly Theme[];
  /** Full key of `miragon.<modeler>.colorTheme`; omit until the modeler can show dark. */
  settingKey?: string | undefined;
  /** `<html lang>`, the tool's UI language; default `"en"`. */
  lang?: string | undefined;
  /** The folder of the webview bundle in the extension, its only local resource root; default `"dist"`. */
  bundleDirectory?: string | undefined;
  /** The bundle's script in `bundleDirectory`; default `"webview.js"`. */
  script?: string | undefined;
  /** The bundle's stylesheets in `bundleDirectory`, in load order; default `["webview.css"]`. */
  styles?: readonly string[] | undefined;
  /** `inlineStyles` of `renderWebviewHtml`; default `true`. */
  inlineStyles?: boolean | undefined;
  /**
   * "Insert example" of the empty-file hint: the document's text with the example in, written as
   * one edit (guide §13.5) and imported like any change the webview did not make. `undefined`
   * leaves the document as it is. Without it the message is ignored.
   */
  insertExample?: ((documentText: string) => string | undefined) | undefined;
  /** The problems behind the pill; without them the webview gets no `problems` message. */
  diagnostics?: ModelerEditorDiagnostics<Document> | undefined;
  /** The webview's messages the plumbing does not answer itself, such as an export. */
  onMessage?: ((message: Message, editor: ModelerEditor<Document>) => unknown) | undefined;
  /** Runs when an editor opens; what it returns is disposed with the editor. */
  onDidOpen?: ((editor: ModelerEditor<Document>) => DisposableLike | void) | undefined;
}

export interface ModelerEditorRegistration<
  Document extends TextDocumentLike = TextDocumentLike,
> extends DisposableLike {
  /**
   * Shows the editor a command without a resource means and returns its document: the focused
   * editor, else the open editor focused last (a walkthrough link or a Command Palette entry takes
   * the focus from the editor it means), which is shown and takes the focus, so a command that
   * opens something `ViewColumn.Beside` opens it beside that editor, not beside the walkthrough.
   * `undefined` while no editor is open, as before VS Code resolves a tab it restored.
   */
  revealActiveDocument(): Document["uri"] | undefined;
  /**
   * Posts `{ type: "command", name }` to the editor of `uri`, or without `uri` to the focused
   * editor, never to one focused earlier. `false` when there is no such editor.
   */
  runCommand(name: string, uri?: UriLike): boolean;
  dispose(): void;
}

interface OpenEditor<Uri extends UriLike> {
  readonly uri: Uri;
  readonly panel: EditorWebviewPanelLike;
}

const PROBLEMS_VIEW_COMMAND = "workbench.actions.view.problems";

function summaryOf(counts: ProblemCounts): string {
  return `${counts.count}:${counts.errors}`;
}

function problemsMessage(counts: ProblemCounts): DocumentHostMessage {
  return { type: "problems", count: counts.count, errors: counts.errors };
}

/**
 * Registers a custom text editor whose document stays the source of truth: VS Code keeps dirty
 * state, saving, Git, diff and the undo history, and the webview shows the canvas in the shell.
 * Per editor it writes the shell's webview HTML, connects the theme bridge, answers `ready` with
 * the text, writes every `edit` as one minimal `WorkspaceEdit` and posts every other change as an
 * `update`, keeps the problems pill in step with `diagnostics`, and answers "Insert example",
 * "Show in Problems view" and the `info` and `error` notifications. `vscode` is the extension's own
 * namespace.
 */
export function registerModelerEditor<
  Document extends TextDocumentLike = TextDocumentLike,
  Message extends TypedMessage = TypedMessage,
>(
  vscode: VsCodeEditorLike,
  context: { readonly extensionUri: UriLike },
  options: ModelerEditorOptions<Document, Message>,
): ModelerEditorRegistration<Document> {
  const bridgeOptions = { themes: options.themes, settingKey: options.settingKey };
  const { diagnostics, insertExample } = options;
  type Entry = OpenEditor<Document["uri"]>;
  const editorsByDocument = new Map<string, Entry>();
  /** The open editors, the one focused last first. */
  const focusOrder: Entry[] = [];
  let focused: Entry | undefined;

  const forget = (editor: Entry): void => {
    const index = focusOrder.indexOf(editor);
    if (index !== -1) focusOrder.splice(index, 1);
  };

  function writeHtml(panel: EditorWebviewPanelLike): void {
    const { webview } = panel;
    const bundle = vscode.Uri.joinPath(context.extensionUri, options.bundleDirectory ?? "dist");
    webview.options = { enableScripts: true, localResourceRoots: [bundle] };
    const asset = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(bundle, file)).toString();
    webview.html = renderWebviewHtml({
      cspSource: webview.cspSource,
      scriptUri: asset(options.script ?? "webview.js"),
      styleUris: (options.styles ?? ["webview.css"]).map(asset),
      title: options.title,
      lang: options.lang ?? "en",
      appearance: currentAppearance(vscode, bridgeOptions),
      inlineStyles: options.inlineStyles,
    });
  }

  function open(document: Document, panel: EditorWebviewPanelLike): void {
    writeHtml(panel);
    const key = document.uri.toString();
    const writer = createDocumentWriter(vscode, document);
    const post = (message: unknown): PromiseLike<boolean> => panel.webview.postMessage(message);
    const editor: ModelerEditor<Document> = {
      document,
      panel,
      post,
      written: () => writer.settled(),
    };
    const entry: Entry = { uri: document.uri, panel };
    editorsByDocument.set(key, entry);
    if (panel.active) {
      focused = entry;
      focusOrder.unshift(entry);
    } else {
      focusOrder.push(entry);
    }

    // Undefined until the webview is ready: before, it has no pill to keep in step.
    let postedProblems: string | undefined;
    const refreshProblems = (): void => {
      if (!diagnostics) return;
      const counts = diagnostics.refresh(document);
      if (postedProblems === undefined || postedProblems === summaryOf(counts)) return;
      postedProblems = summaryOf(counts);
      void post(problemsMessage(counts));
    };

    const resync = (): void => void post({ type: "update", text: document.getText() });

    async function answer(message: TypedMessage): Promise<unknown> {
      switch (message.type) {
        case "ready": {
          await post({ type: "init", text: document.getText() });
          if (!diagnostics) return undefined;
          // A reloaded webview sends `ready` again and has forgotten what its pill showed.
          const counts = diagnostics.refresh(document);
          postedProblems = summaryOf(counts);
          return post(problemsMessage(counts));
        }
        case "edit": {
          if (typeof message.text !== "string") return undefined;
          const text = message.text;
          const written = await writer.write(() => text, { suppressEcho: true });
          // The canvas already shows the change: when the document refused it, show the document
          // again, unless a newer edit is queued, whose outcome decides instead.
          if (!written && writer.pending === 0) resync();
          return undefined;
        }
        case "insertExample":
          if (!insertExample) return undefined;
          return writer.write(insertExample, { suppressEcho: false });
        case "showProblems":
          return vscode.commands.executeCommand(PROBLEMS_VIEW_COMMAND);
        case "info":
          if (typeof message.message !== "string") return undefined;
          return vscode.window.showInformationMessage(message.message);
        case "error":
          if (typeof message.message !== "string") return undefined;
          return vscode.window.showErrorMessage(message.message);
        default:
          return options.onMessage?.(message as Message, editor);
      }
    }

    const subscriptions: DisposableLike[] = [
      connectThemeBridge(vscode, panel, bridgeOptions),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== key) return;
        // A save or a dirty-state change fires without a content change: nothing to sync.
        if (event.contentChanges.length === 0) return;
        // The sync first: a modeler's diagnostics that throw keep neither a change from the canvas
        // nor an echo in the writer, where it would swallow a later change back to that text.
        if (!writer.consumeEcho()) resync();
        refreshProblems();
      }),
      panel.webview.onDidReceiveMessage((message) =>
        isTypedMessage(message) ? answer(message) : undefined,
      ),
      panel.onDidChangeViewState(() => {
        if (panel.active) {
          focused = entry;
          forget(entry);
          focusOrder.unshift(entry);
        } else if (focused === entry) {
          focused = undefined;
        }
      }),
    ];
    const close = (): void => {
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
      diagnostics?.clear?.(document);
      if (editorsByDocument.get(key) === entry) editorsByDocument.delete(key);
      if (focused === entry) focused = undefined;
      forget(entry);
    };
    panel.onDidDispose(close);
    // A hook that throws fails the editor in VS Code: nothing of it may stay focused or reachable.
    try {
      diagnostics?.refresh(document);
      const opened = options.onDidOpen?.(editor);
      if (opened) subscriptions.push(opened);
    } catch (error) {
      close();
      throw error;
    }
  }

  const registration = vscode.window.registerCustomEditorProvider(
    options.viewType,
    {
      // VS Code hands its own documents to the provider it registered: `Document` is their type.
      resolveCustomTextEditor: (document, panel) => open(document as Document, panel),
    },
    {
      // A hidden tab keeps document, view and selection (and reports 0 × 0 meanwhile).
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    },
  );

  return {
    revealActiveDocument() {
      const last = focusOrder[0];
      if (!last) return undefined;
      if (!last.panel.active) last.panel.reveal(undefined, false);
      return last.uri;
    },
    runCommand(name, uri) {
      const editor = uri ? editorsByDocument.get(uri.toString()) : focused;
      if (!editor) return false;
      void editor.panel.webview.postMessage({
        type: "command",
        name,
      } satisfies DocumentHostMessage);
      return true;
    },
    dispose: () => void registration.dispose(),
  };
}
