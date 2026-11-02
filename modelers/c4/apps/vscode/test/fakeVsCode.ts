import { createVsCodeHostStub } from "@miragon/modeler-shell/testing/vscode-stub";

/** `vscode.Uri` as far as the extension uses it: a file has `with`, so an export names its file. */
export class FakeUri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static file(path: string): FakeUri {
    return new FakeUri("file", path);
  }

  static joinPath(base: FakeUri, ...segments: string[]): FakeUri {
    return new FakeUri(base.scheme, [base.path.replace(/\/$/, ""), ...segments].join("/"));
  }

  with(change: { path: string }): FakeUri {
    return new FakeUri(this.scheme, change.path);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

/** A text document with VS Code's offsets: `\r\n`, `\n` and `\r` end a line. */
export class FakeTextDocument {
  readonly eol = "\n";
  readOnly = false;

  constructor(
    readonly uri: FakeUri,
    private text: string,
    // `languages.setTextDocumentLanguage` changes it.
    public languageId = "structurizr-dsl",
  ) {}

  get lineCount(): number {
    return this.lines().length;
  }

  getText(): string {
    return this.text;
  }

  setText(text: string): void {
    this.text = text;
  }

  lineAt(line: number): { text: string } {
    return { text: this.lines()[line] ?? "" };
  }

  positionAt(offset: number): Position {
    const before = this.text.slice(0, offset);
    const breaks = [...before.matchAll(/\r\n|\n|\r/g)];
    const last = breaks.at(-1);
    const lineStart = last === undefined ? 0 : last.index + last[0].length;
    return new Position(breaks.length, offset - lineStart);
  }

  offsetAt(position: { readonly line: number; readonly character: number }): number {
    let lineStart = 0;
    const breaks = this.text.matchAll(/\r\n|\n|\r/g);
    for (let line = 0; line < position.line; line++) {
      const next = breaks.next();
      if (next.done) return this.text.length;
      lineStart = next.value.index + next.value[0].length;
    }
    return Math.min(lineStart + position.character, this.text.length);
  }

  private lines(): string[] {
    return this.text.split(/\r\n|\n|\r/);
  }
}

export interface Notification {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly items: readonly unknown[];
}

interface Answers {
  /** The file the save dialog returns; `undefined` is a dismissed dialog. */
  saveDialog: FakeUri | undefined;
  /** The action the user picks in a notification. */
  notification: string | undefined;
  /** Why writing a file fails; `undefined` writes it. */
  writeError: Error | undefined;
  /** Why writing a setting fails; `undefined` writes it. */
  settingsError: Error | undefined;
}

const NO_ANSWERS: Answers = {
  saveDialog: undefined,
  notification: undefined,
  writeError: undefined,
  settingsError: undefined,
};

type Listener<T> = (value: T) => unknown;

class Emitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>) => {
    this.listeners.add(listener);
    return { dispose: () => void this.listeners.delete(listener) };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** A `vscode.QuickPick` the test drives: it records what the command shows and accepts an item. */
export class FakeQuickPick<Item extends { label: string }> {
  title: string | undefined;
  placeholder: string | undefined;
  matchOnDescription = false;
  items: readonly Item[] = [];
  selectedItems: readonly Item[] = [];
  shown = false;
  disposed = false;
  private readonly accepted = new Emitter<void>();
  private readonly hidden = new Emitter<void>();
  readonly onDidAccept = this.accepted.event;
  readonly onDidHide = this.hidden.event;

  show(): void {
    this.shown = true;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.hidden.fire();
  }

  dispose(): void {
    this.disposed = true;
  }

  /** The user picks the row labelled `label` and presses Enter. */
  accept(label: string): void {
    const item = this.items.find((candidate) => candidate.label === label);
    if (!item) throw new Error(`No row ${label}`);
    this.selectedItems = [item];
    this.accepted.fire();
  }
}

class Diagnostic {
  source: string | undefined;
  code: string | undefined;

  constructor(
    readonly range: { start: Position; end: Position },
    readonly message: string,
    readonly severity: number,
  ) {}
}

class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

class TabInputCustom {
  constructor(
    readonly uri: FakeUri,
    readonly viewType: string,
  ) {}
}

/** `vscode.TextDocumentSaveReason`. */
export enum TextDocumentSaveReason {
  Manual = 1,
  AfterDelay = 2,
  FocusOut = 3,
}

interface WillSaveEvent {
  readonly document: FakeTextDocument;
  readonly reason: TextDocumentSaveReason;
  waitUntil(thenable: PromiseLike<unknown>): void;
}

/** One replacement of a `WorkspaceEdit` the shell's stand-in built. */
export interface AppliedEdit {
  readonly uri: FakeUri;
  readonly range: Range;
  readonly text: string;
}

/** A text editor `showTextDocument` opened or revealed. */
export interface ShownTextDocument {
  readonly document: FakeTextDocument;
  readonly viewColumn: number | undefined;
  readonly selection: Range | undefined;
  readonly revealed: Array<{ range: Range; type: number }>;
}

class FakeDiagnosticCollection {
  readonly entries = new Map<string, Diagnostic[]>();

  constructor(readonly name: string) {}

  set(uri: FakeUri, diagnostics: Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics);
  }

  get(uri: FakeUri): Diagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }

  delete(uri: FakeUri): void {
    this.entries.delete(uri.toString());
  }

  dispose(): void {
    this.entries.clear();
  }
}

// The shell's stand-in runs the diagram editor (registerModelerEditor); the dialogs, the files,
// the notifications, the commands, the settings and the documents are this file's, so a test sets
// them up and reads them back.
const host = createVsCodeHostStub();
let answers = { ...NO_ANSWERS };
const saveDialogs: unknown[] = [];
const writtenFiles: Array<{ path: string; bytes: Uint8Array }> = [];
const notifications: Notification[] = [];
const executedCommands: unknown[][] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const quickPicks: Array<FakeQuickPick<{ label: string }>> = [];
const diagnosticCollections: FakeDiagnosticCollection[] = [];
const settingUpdates: Array<{ section: string; value: unknown; target: unknown }> = [];
let userSettings: Record<string, unknown> = {};
const documentOpened = new Emitter<FakeTextDocument>();
const documentChanged = new Emitter<{
  document: FakeTextDocument;
  contentChanges: readonly unknown[];
}>();
const documentClosed = new Emitter<FakeTextDocument>();
const documentsByUri = new Map<string, FakeTextDocument>();
const appliedEdits: AppliedEdit[] = [];
const willSaveListeners = new Set<(event: WillSaveEvent) => unknown>();
const shownTextDocuments: ShownTextDocument[] = [];
const visibleTextEditors: Array<{ document: FakeTextDocument; viewColumn: number }> = [];
let heldEdits: Array<() => void> | undefined;
const installedExtensions = new Set<string>();
const languageChanges: Array<{ path: string; languageId: string }> = [];

/** VS Code applying a `WorkspaceEdit`: refused for a document it doesn't know or can't edit. */
function applyNow(edits: readonly AppliedEdit[]): boolean {
  const documents = edits.map((edit) => documentsByUri.get(edit.uri.toString()));
  if (documents.some((document) => !document || document.readOnly)) return false;
  edits.forEach((edit, index) => {
    const document = documents[index]!;
    const before = document.getText();
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    const text = edit.text.replace(/\r\n|\n/g, document.eol);
    document.setText(before.slice(0, start) + text + before.slice(end));
    appliedEdits.push(edit);
    documentChanged.fire({ document, contentChanges: [{ range: edit.range, text: edit.text }] });
  });
  return true;
}

function notify(severity: Notification["severity"]) {
  return (message: string, ...items: unknown[]): Promise<string | undefined> => {
    notifications.push({ severity, message, items });
    return Promise.resolve(answers.notification);
  };
}

const tabGroups = {
  activeTabGroup: { tabs: [] as unknown[] },
  all: [] as Array<{ tabs: unknown[]; activeTab?: unknown; viewColumn?: number }>,
};

/** The module `vscode`, for `vi.mock`. */
export const vscodeModule = {
  window: Object.assign(host.vscode.window, {
    showSaveDialog(options: unknown): Promise<FakeUri | undefined> {
      saveDialogs.push(options);
      return Promise.resolve(answers.saveDialog);
    },
    showInformationMessage: notify("info"),
    showWarningMessage: notify("warning"),
    showErrorMessage: notify("error"),
    createQuickPick<Item extends { label: string }>(): FakeQuickPick<Item> {
      const picker = new FakeQuickPick<Item>();
      quickPicks.push(picker as unknown as FakeQuickPick<{ label: string }>);
      return picker;
    },
    tabGroups,
    activeTextEditor: undefined as { document: { uri: FakeUri } } | undefined,
    visibleTextEditors,
    showTextDocument(
      document: FakeTextDocument,
      options: { viewColumn?: number; selection?: Range } = {},
    ) {
      const shown: ShownTextDocument = {
        document,
        viewColumn: options.viewColumn,
        selection: options.selection,
        revealed: [],
      };
      shownTextDocuments.push(shown);
      return Promise.resolve({
        document,
        revealRange: (range: Range, type: number) => void shown.revealed.push({ range, type }),
      });
    },
  }),
  workspace: Object.assign(host.vscode.workspace, {
    workspaceFolders: undefined as ReadonlyArray<{ uri: FakeUri }> | undefined,
    textDocuments: [] as FakeTextDocument[],
    onDidOpenTextDocument: documentOpened.event,
    onDidChangeTextDocument: documentChanged.event,
    onDidCloseTextDocument: documentClosed.event,
    onWillSaveTextDocument(listener: (event: WillSaveEvent) => unknown) {
      willSaveListeners.add(listener);
      return { dispose: () => void willSaveListeners.delete(listener) };
    },
    applyEdit(edit: { readonly edits?: readonly AppliedEdit[] }): Promise<boolean> {
      const edits = edit.edits ?? [];
      const queue = heldEdits;
      if (!queue) return Promise.resolve(applyNow(edits));
      return new Promise<boolean>((resolve) => queue.push(() => resolve(applyNow(edits))));
    },
    getConfiguration(section: string) {
      const prefix = `${section}.`;
      return {
        get: (key: string) => userSettings[prefix + key],
        inspect: (key: string) => ({ key: prefix + key, globalValue: userSettings[prefix + key] }),
        update(key: string, value: unknown, target: unknown): Promise<void> {
          if (answers.settingsError) return Promise.reject(answers.settingsError);
          settingUpdates.push({ section: prefix + key, value, target });
          userSettings = { ...userSettings, [prefix + key]: value };
          return Promise.resolve();
        },
      };
    },
    fs: {
      writeFile(uri: FakeUri, bytes: Uint8Array): Promise<void> {
        if (answers.writeError) return Promise.reject(answers.writeError);
        writtenFiles.push({ path: uri.path, bytes });
        return Promise.resolve();
      },
      stat: (uri: FakeUri): Promise<never> => Promise.reject(new Error(`No file at ${uri.path}`)),
    },
  }),
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown) {
      registeredCommands.set(command, callback);
      return {
        dispose: () => {
          if (registeredCommands.get(command) === callback) registeredCommands.delete(command);
        },
      };
    },
    executeCommand(command: string, ...args: unknown[]): Promise<undefined> {
      executedCommands.push([command, ...args]);
      return Promise.resolve(undefined);
    },
  },
  languages: {
    createDiagnosticCollection(name: string) {
      const collection = new FakeDiagnosticCollection(name);
      diagnosticCollections.push(collection);
      return collection;
    },
    /** VS Code treats a language change as a close and an open of the document, in one go. */
    setTextDocumentLanguage(
      document: FakeTextDocument,
      languageId: string,
    ): Promise<FakeTextDocument> {
      languageChanges.push({ path: document.uri.path, languageId });
      documentClosed.fire(document);
      document.languageId = languageId;
      documentOpened.fire(document);
      return Promise.resolve(document);
    },
  },
  extensions: {
    getExtension: (id: string) => (installedExtensions.has(id) ? { id } : undefined),
  },
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ViewColumn: { Active: -1, Beside: -2 },
  TextDocumentSaveReason,
  TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
  Disposable: {
    from: (...disposables: Array<{ dispose(): unknown }>) => ({
      dispose: () => disposables.forEach((disposable) => disposable.dispose()),
    }),
  },
  TabInputCustom,
  Uri: FakeUri,
  Position,
  Range,
  WorkspaceEdit: host.vscode.WorkspaceEdit,
};

export const fakeVsCode = {
  saveDialogs,
  writtenFiles,
  notifications,
  executedCommands,
  quickPicks,
  settingUpdates,
  diagnosticCollections,
  /** Every `languages.setTextDocumentLanguage` the extension called, in order. */
  languageChanges: languageChanges as readonly { path: string; languageId: string }[],
  /** Another extension the user installed, by its id (`publisher.name`). */
  installExtension(id: string): void {
    installedExtensions.add(id);
  },
  /** Every replacement of a `WorkspaceEdit` VS Code applied, in order. */
  appliedEdits: appliedEdits as readonly AppliedEdit[],
  shownTextDocuments: shownTextDocuments as readonly ShownTextDocument[],
  /** A text editor of `document` that VS Code shows in `viewColumn`. */
  showTextEditor(document: FakeTextDocument, viewColumn: number): void {
    visibleTextEditors.push({ document, viewColumn });
  },
  /**
   * Holds every `applyEdit` from now on until the returned function runs, as VS Code applies an
   * edit in its main thread, later than the extension asked.
   */
  holdEdits(): () => void {
    const queue: Array<() => void> = [];
    heldEdits = queue;
    return () => {
      if (heldEdits === queue) heldEdits = undefined;
      for (const apply of queue.splice(0)) apply();
    };
  },
  /**
   * VS Code saving `document`: every save participant runs, the save waits for what they passed
   * to `waitUntil`, then the dirty state changes (a change event without content changes).
   */
  async saveDocument(
    document: FakeTextDocument,
    reason: TextDocumentSaveReason = TextDocumentSaveReason.Manual,
  ): Promise<void> {
    const waits: PromiseLike<unknown>[] = [];
    for (const listener of [...willSaveListeners]) {
      listener({ document, reason, waitUntil: (thenable) => waits.push(thenable) });
    }
    await Promise.all(waits);
    documentChanged.fire({ document, contentChanges: [] });
  },
  answer(next: Partial<Answers>): void {
    answers = { ...answers, ...next };
  },
  setUserSettings(settings: Record<string, unknown>): void {
    userSettings = { ...settings };
  },
  setWorkspaceFolder(path: string | undefined): void {
    vscodeModule.workspace.workspaceFolders =
      path === undefined ? undefined : [{ uri: FakeUri.file(path) }];
  },
  /** Runs a command as the Command Palette does (or a title button, with `args`). */
  async runCommand(command: string, ...args: unknown[]): Promise<unknown> {
    const callback = registeredCommands.get(command);
    if (!callback) throw new Error(`${command} is not registered.`);
    return callback(...args);
  },
  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  },
  /** VS Code opening `text` at `uri` in the custom editor of `viewType`. */
  async openCustomEditor(
    viewType: string,
    uri: FakeUri,
    text: string,
    options: { active?: boolean } = {},
  ) {
    const document = new FakeTextDocument(uri, text);
    documentsByUri.set(uri.toString(), document);
    const panel = await host.openCustomEditor(viewType, document, options);
    return { panel, document };
  },
  /** A text document VS Code opens (a text editor, Git, the extension host). */
  openTextDocument(document: FakeTextDocument): void {
    documentsByUri.set(document.uri.toString(), document);
    vscodeModule.workspace.textDocuments.push(document);
    documentOpened.fire(document);
  },
  changeTextDocument(document: FakeTextDocument, text: string): void {
    document.setText(text);
    documentChanged.fire({ document, contentChanges: [{ text }] });
  },
  closeTextDocument(document: FakeTextDocument): void {
    const documents = vscodeModule.workspace.textDocuments;
    documents.splice(documents.indexOf(document), 1);
    documentClosed.fire(document);
  },
  reset(): void {
    answers = { ...NO_ANSWERS };
    userSettings = {};
    for (const list of [
      saveDialogs,
      writtenFiles,
      notifications,
      executedCommands,
      quickPicks,
      settingUpdates,
      diagnosticCollections,
      appliedEdits,
      shownTextDocuments,
      visibleTextEditors,
      languageChanges,
    ]) {
      list.length = 0;
    }
    documentsByUri.clear();
    installedExtensions.clear();
    willSaveListeners.clear();
    heldEdits = undefined;
    vscodeModule.workspace.workspaceFolders = undefined;
    vscodeModule.workspace.textDocuments.length = 0;
    vscodeModule.window.activeTextEditor = undefined;
    tabGroups.activeTabGroup.tabs.length = 0;
    tabGroups.all.length = 0;
  },
};
