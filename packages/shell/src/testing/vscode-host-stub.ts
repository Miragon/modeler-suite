import type {
  ColorThemeLike,
  CustomEditorRegistrationOptions,
  CustomTextEditorProviderLike,
  DisposableLike,
  EditorWebviewPanelLike,
  PositionLike,
  RangeLike,
  TextDocumentChangeEventLike,
  TextDocumentLike,
  UriLike,
  VsCodeEditorLike,
  WebviewLike,
  WorkspaceEditLike,
} from "../vscode/extension/index.js";

/*
 * A stand-in for the extension host's `vscode` namespace as `registerModelerEditor` uses it: text
 * documents with VS Code's line semantics and undo history, workspace edits, custom editors and
 * their webview panels. DOM-free, so it runs in a unit test and in a webview test page alike.
 */

/** The line break VS Code keeps for a document and writes every inserted `\n` as. */
export type EndOfLine = "\n" | "\r\n";

class StubUri implements UriLike {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

class StubRange implements RangeLike {
  readonly start: PositionLike;
  readonly end: PositionLike;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

/** One replacement of a `WorkspaceEdit`. */
export interface StubTextEdit {
  readonly uri: UriLike;
  readonly range: RangeLike;
  readonly text: string;
}

class StubWorkspaceEdit implements WorkspaceEditLike {
  readonly edits: StubTextEdit[] = [];

  replace(uri: UriLike, range: RangeLike, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

class Emitter<T> {
  private readonly listeners = new Set<(value: T) => unknown>();

  readonly event = (listener: (value: T) => unknown): DisposableLike => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(value: T): unknown[] {
    return [...this.listeners].map((listener) => listener(value));
  }
}

export interface StubTextDocument extends TextDocumentLike {
  readonly uri: UriLike;
  readonly eol: EndOfLine;
  /** Whether VS Code refuses every edit, as for a file opened read-only. */
  readOnly: boolean;
}

interface DocumentState {
  readonly document: StubTextDocument;
  text: string;
  readonly undoStack: string[];
  readonly redoStack: string[];
}

export interface StubWebviewPanel extends EditorWebviewPanelLike {
  readonly webview: WebviewLike;
  /** Everything the extension posted to the webview, the theme bridge's messages included. */
  readonly posted: readonly unknown[];
  /**
   * Delivers a message of the webview to the extension's listeners, as VS Code does, and resolves
   * once what they returned has settled.
   */
  receive(message: unknown): Promise<void>;
  /** Every `reveal` the extension called, in order. */
  readonly revealed: readonly {
    readonly viewColumn: number | undefined;
    readonly preserveFocus: boolean;
  }[];
  /** Moves the focus to the panel or away from it. */
  setActive(active: boolean): void;
  setVisible(visible: boolean): void;
  /** Closes the editor. */
  dispose(): void;
}

export interface OpenCustomEditorOptions {
  /** Whether the editor opens with the focus; default `true`. */
  active?: boolean | undefined;
  /** Where the extension's messages go besides `posted`, such as the test page's `window`. */
  deliver?: ((message: unknown) => void) | undefined;
}

export interface VsCodeHostStub {
  /** The namespace to hand to `registerModelerEditor`. */
  readonly vscode: VsCodeEditorLike;
  /** `context.extensionUri` */
  readonly extensionUri: UriLike;
  /** A text document; its line break is the one `text` uses first, unless `eol` says otherwise. */
  openTextDocument(
    path: string,
    text: string,
    options?: { eol?: EndOfLine | undefined },
  ): StubTextDocument;
  /** VS Code opening `document` in the custom editor of `viewType` registered last. */
  openCustomEditor(
    viewType: string,
    document: StubTextDocument,
    options?: OpenCustomEditorOptions,
  ): Promise<StubWebviewPanel>;
  /** The text editor, Git or a formatter: replaces the whole text, one undo step. */
  replaceText(document: StubTextDocument, text: string): void;
  /** VS Code's undo of the document; `false` with nothing to undo. */
  undo(document: StubTextDocument): boolean;
  redo(document: StubTextDocument): boolean;
  /** A save: the dirty state changes, the text does not (a change event without content changes). */
  save(document: StubTextDocument): void;
  /**
   * Holds every `applyEdit` from now on until the returned function runs, as VS Code applies an
   * edit in its main thread, later than the extension asked.
   */
  holdEdits(): () => void;
  /** Every replacement VS Code applied, in order. */
  readonly appliedEdits: readonly StubTextEdit[];
  /** Every command the extension executed, with its arguments. */
  readonly executedCommands: ReadonlyArray<{ command: string; args: readonly unknown[] }>;
  /** Every notification the extension showed. */
  readonly notifications: ReadonlyArray<{ severity: "info" | "error"; message: string }>;
  /** Switches VS Code's color theme kind: 1 Light, 2 Dark, 3 High Contrast, 4 High Contrast Light. */
  setColorThemeKind(kind: number): void;
}

function offsetOf(lines: readonly string[], eol: EndOfLine, position: PositionLike): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++)
    offset += (lines[line] ?? "").length + eol.length;
  return offset + position.character;
}

/** Inserted text takes the document's line break, as in VS Code. */
function withLineBreak(text: string, eol: EndOfLine): string {
  return text.replace(/\r\n|\n/g, eol);
}

/** A fake `vscode` for the document plumbing, in Node or in a test page. */
export function createVsCodeHostStub(): VsCodeHostStub {
  const documents = new Map<string, DocumentState>();
  const providers = new Map<string, CustomTextEditorProviderLike>();
  const documentChanged = new Emitter<TextDocumentChangeEventLike>();
  const themeChanged = new Emitter<ColorThemeLike>();
  const configurationChanged = new Emitter<{ affectsConfiguration(section: string): boolean }>();
  const appliedEdits: StubTextEdit[] = [];
  const executedCommands: Array<{ command: string; args: readonly unknown[] }> = [];
  const notifications: Array<{ severity: "info" | "error"; message: string }> = [];
  let held: Array<() => void> | undefined;
  let colorThemeKind = 1;

  function stateOf(uri: UriLike): DocumentState | undefined {
    return documents.get(uri.toString());
  }

  function setText(state: DocumentState, text: string, change: unknown): void {
    state.text = text;
    documentChanged.fire({ document: state.document, contentChanges: [change] });
  }

  function applyNow(edit: StubWorkspaceEdit): boolean {
    const states = edit.edits.map((each) => stateOf(each.uri));
    if (states.some((state) => !state || state.document.readOnly)) return false;
    edit.edits.forEach((each, index) => {
      const state = states[index]!;
      const { eol } = state.document;
      const lines = state.text.split(/\r\n|\n/);
      const start = offsetOf(lines, eol, each.range.start);
      const end = offsetOf(lines, eol, each.range.end);
      const before = state.text;
      const after = before.slice(0, start) + withLineBreak(each.text, eol) + before.slice(end);
      state.undoStack.push(before);
      state.redoStack.length = 0;
      appliedEdits.push(each);
      setText(state, after, { range: each.range, text: each.text });
    });
    return true;
  }

  const vscode: VsCodeEditorLike = {
    window: {
      get activeColorTheme() {
        return { kind: colorThemeKind };
      },
      onDidChangeActiveColorTheme: themeChanged.event,
      registerCustomEditorProvider(
        viewType: string,
        provider: CustomTextEditorProviderLike,
        _options?: CustomEditorRegistrationOptions,
      ) {
        providers.set(viewType, provider);
        return {
          dispose: () => {
            if (providers.get(viewType) === provider) providers.delete(viewType);
          },
        };
      },
      showInformationMessage(message: string) {
        notifications.push({ severity: "info", message });
        return Promise.resolve(undefined);
      },
      showErrorMessage(message: string) {
        notifications.push({ severity: "error", message });
        return Promise.resolve(undefined);
      },
    },
    workspace: {
      getConfiguration: () => ({ get: () => undefined }),
      onDidChangeConfiguration: configurationChanged.event,
      onDidChangeTextDocument: documentChanged.event,
      applyEdit(edit: WorkspaceEditLike) {
        if (!(edit instanceof StubWorkspaceEdit)) {
          return Promise.reject(
            new Error("The edit was not built with this stub's WorkspaceEdit."),
          );
        }
        if (!held) return Promise.resolve(applyNow(edit));
        const queue = held;
        return new Promise<boolean>((resolve) => queue.push(() => resolve(applyNow(edit))));
      },
    },
    commands: {
      executeCommand(command: string, ...args: unknown[]) {
        executedCommands.push({ command, args });
        return Promise.resolve(undefined);
      },
    },
    Uri: {
      joinPath: (base: UriLike, ...segments: string[]) =>
        new StubUri(base.scheme, [base.path.replace(/\/$/, ""), ...segments].join("/")),
    },
    Range: StubRange,
    WorkspaceEdit: StubWorkspaceEdit,
  };

  function createPanel(active: boolean, deliver: ((message: unknown) => void) | undefined) {
    const posted: unknown[] = [];
    const received = new Emitter<unknown>();
    const viewStateChanged = new Emitter<{
      readonly webviewPanel: { readonly visible: boolean; readonly active: boolean };
    }>();
    const disposed = new Emitter<void>();
    let isDisposed = false;
    const webview: WebviewLike = {
      options: {},
      html: "",
      cspSource: "vscode-webview://stub",
      asWebviewUri: (uri) => new StubUri("vscode-webview", uri.path),
      postMessage(message) {
        if (isDisposed) return Promise.resolve(false);
        posted.push(message);
        deliver?.(message);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: received.event,
    };
    const revealed: { viewColumn: number | undefined; preserveFocus: boolean }[] = [];
    const panel: StubWebviewPanel = {
      webview,
      active,
      visible: true,
      posted,
      revealed,
      onDidChangeViewState: viewStateChanged.event,
      onDidDispose: disposed.event,
      async receive(message) {
        await Promise.all(received.fire(message));
      },
      setActive(next) {
        (panel as { active: boolean }).active = next;
        viewStateChanged.fire({ webviewPanel: panel });
      },
      setVisible(next) {
        (panel as { visible: boolean }).visible = next;
        viewStateChanged.fire({ webviewPanel: panel });
      },
      reveal(viewColumn, preserveFocus = false) {
        if (isDisposed) return;
        revealed.push({ viewColumn, preserveFocus });
        const active = panel.active || !preserveFocus;
        if (panel.visible && panel.active === active) return;
        (panel as { visible: boolean }).visible = true;
        (panel as { active: boolean }).active = active;
        viewStateChanged.fire({ webviewPanel: panel });
      },
      dispose() {
        if (isDisposed) return;
        isDisposed = true;
        disposed.fire();
      },
    };
    return panel;
  }

  return {
    vscode,
    extensionUri: new StubUri("file", "/extension"),
    openTextDocument(path, text, options = {}) {
      const eol: EndOfLine = options.eol ?? (/\r\n/.exec(text) ? "\r\n" : "\n");
      const uri = new StubUri("file", path);
      const lines = (): string[] => state.text.split(/\r\n|\n/);
      const document: StubTextDocument = {
        uri,
        eol,
        readOnly: false,
        get lineCount() {
          return lines().length;
        },
        lineAt(line) {
          const lineText = lines()[line];
          if (lineText === undefined) throw new Error(`Illegal value for \`line\`: ${line}`);
          return { text: lineText };
        },
        getText: () => state.text,
      };
      const state: DocumentState = {
        document,
        text: withLineBreak(text, eol),
        undoStack: [],
        redoStack: [],
      };
      documents.set(uri.toString(), state);
      return document;
    },
    async openCustomEditor(viewType, document, options = {}) {
      const provider = providers.get(viewType);
      if (!provider) throw new Error(`No custom editor is registered for ${viewType}.`);
      const panel = createPanel(options.active ?? true, options.deliver);
      await provider.resolveCustomTextEditor(document, panel, {});
      return panel;
    },
    replaceText(document, text) {
      const state = stateOf(document.uri);
      if (!state) throw new Error(`${document.uri.toString()} is not open.`);
      state.undoStack.push(state.text);
      state.redoStack.length = 0;
      setText(state, withLineBreak(text, document.eol), { text });
    },
    undo(document) {
      const state = stateOf(document.uri);
      const before = state?.undoStack.pop();
      if (!state || before === undefined) return false;
      state.redoStack.push(state.text);
      setText(state, before, { undo: true });
      return true;
    },
    redo(document) {
      const state = stateOf(document.uri);
      const after = state?.redoStack.pop();
      if (!state || after === undefined) return false;
      state.undoStack.push(state.text);
      setText(state, after, { redo: true });
      return true;
    },
    save(document) {
      documentChanged.fire({ document, contentChanges: [] });
    },
    holdEdits() {
      const queue: Array<() => void> = [];
      held = queue;
      return () => {
        if (held === queue) held = undefined;
        for (const apply of queue.splice(0)) apply();
      };
    },
    appliedEdits,
    executedCommands,
    notifications,
    setColorThemeKind(kind) {
      colorThemeKind = kind;
      themeChanged.fire({ kind });
    },
  };
}
