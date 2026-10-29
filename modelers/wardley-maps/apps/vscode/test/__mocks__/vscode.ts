/**
 * Thin in-repo mock of the ambient `vscode` module. Vitest aliases `vscode` to this file (see
 * vitest.config.ts) so the extension-host + protocol logic can be unit-tested in Node without
 * launching VS Code. Only the API surface the host actually uses is implemented.
 *
 * The extension source stays typed against the real `@types/vscode`; tests drive behaviour through
 * the exported `vscodeMock` control surface (which is NOT part of the real API) and the concrete
 * classes below. Because vitest resolves both `'vscode'` (aliased) and a relative import of this
 * file to the same module id, a listener the host registers and an event a test fires share state.
 */

export class Disposable {
  constructor(private readonly _dispose: () => void) {}
  dispose(): void {
    this._dispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(data: T): void {
    for (const listener of [...this.listeners]) listener(data);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class CancellationError extends Error {
  constructor() {
    super("Canceled");
    this.name = "CancellationError";
  }
}

/** Minimal cancellation source: tests pass `.token` to a provider and call `cancel()` to trip it. */
export class CancellationTokenSource {
  private readonly emitter = new EventEmitter<void>();
  readonly token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void): Disposable => this.emitter.event(listener),
  };
  get isCancellationRequested(): boolean {
    return this.token.isCancellationRequested;
  }
  cancel(): void {
    this.token.isCancellationRequested = true;
    this.emitter.fire();
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

/** Supports both real constructors: `(start, end)` and `(startLine, startChar, endLine, endChar)`. */
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrLine === "number") {
      this.start = new Position(startOrLine, endOrCharacter as number);
      this.end = new Position(endLine ?? startOrLine, endCharacter ?? (endOrCharacter as number));
    } else {
      this.start = startOrLine;
      this.end = endOrCharacter as Position;
    }
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

/** In-memory DiagnosticCollection keyed by `uri.toString()`. */
export class MockDiagnosticCollection {
  readonly entries = new Map<string, readonly Diagnostic[]>();
  disposed = false;
  constructor(readonly name: string) {}
  set(uri: { toString(): string }, diagnostics: readonly Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics);
  }
  get(uri: { toString(): string }): readonly Diagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }
  delete(uri: { toString(): string }): void {
    this.entries.delete(uri.toString());
  }
  dispose(): void {
    this.disposed = true;
    this.entries.clear();
  }
}

export class WorkspaceEdit {
  readonly edits: Array<{ uri: unknown; range: unknown; text: string }> = [];
  replace(uri: unknown, range: unknown, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  get fsPath(): string {
    return this.path;
  }
  static parse(value: string): Uri {
    const idx = value.indexOf(":");
    return idx >= 0 ? new Uri(value.slice(0, idx), value.slice(idx + 1)) : new Uri("file", value);
  }
  static file(path: string): Uri {
    return new Uri("file", path);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/$/, ""), ...segments].join("/");
    return new Uri(base.scheme, joined);
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

/** The input of a custom editor's tab. */
export class TabInputCustom {
  constructor(
    readonly uri: Uri,
    readonly viewType: string,
  ) {}
}

interface MockTab {
  readonly input: unknown;
  readonly group: MockTabGroup;
}

interface MockTabGroup {
  readonly viewColumn: number;
  readonly tabs: MockTab[];
  activeTab: MockTab | undefined;
}

/** The layout `vscodeMock.setTabGroups` describes: one entry per group, in view column order. */
export interface TabGroupLayout {
  /** The inputs of the group's tabs; the walkthrough's is none of the API's input types. */
  readonly inputs: readonly unknown[];
  /** The index of the tab the group shows. */
  readonly activeTab?: number;
  /** The active group (default: the first). */
  readonly active?: boolean;
}

function tabGroupsOf(layout: readonly TabGroupLayout[]): MockTabGroup[] {
  return layout.map((entry, index) => {
    const group: MockTabGroup = { viewColumn: index + 1, tabs: [], activeTab: undefined };
    group.tabs.push(...entry.inputs.map((input) => ({ input, group })));
    group.activeTab = entry.activeTab === undefined ? undefined : group.tabs[entry.activeTab];
    return group;
  });
}

let tabGroups: MockTabGroup[] = tabGroupsOf([{ inputs: [] }]);
let activeTabGroupIndex = 0;

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

// The document buses the host subscribes to; tests fire them via `vscodeMock`.
const docChangeEmitter = new EventEmitter<{ document: unknown; contentChanges: unknown[] }>();
const colorThemeEmitter = new EventEmitter<{ kind: ColorThemeKind }>();
const configurationEmitter = new EventEmitter<{
  affectsConfiguration(section: string): boolean;
}>();
const docOpenEmitter = new EventEmitter<unknown>();
const docCloseEmitter = new EventEmitter<unknown>();

export const workspace = {
  workspaceFolders: undefined as ReadonlyArray<{ uri: Uri }> | undefined,
  textDocuments: [] as unknown[],
  onDidChangeTextDocument(
    listener: (e: { document: unknown; contentChanges: unknown[] }) => void,
  ): Disposable {
    return docChangeEmitter.event(listener);
  },
  onDidOpenTextDocument(listener: (document: unknown) => void): Disposable {
    return docOpenEmitter.event(listener);
  },
  onDidCloseTextDocument(listener: (document: unknown) => void): Disposable {
    return docCloseEmitter.event(listener);
  },
  getConfiguration(_section?: string): { get<T>(key: string): T | undefined } {
    return { get: () => undefined };
  },
  onDidChangeConfiguration(
    listener: (event: { affectsConfiguration(section: string): boolean }) => void,
  ): Disposable {
    return configurationEmitter.event(listener);
  },
  applyEdit(_edit: WorkspaceEdit): Promise<boolean> {
    return Promise.resolve(true);
  },
  fs: {
    readFile(_uri: Uri): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array());
    },
    writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      writtenFiles.push({ uri, content });
      return Promise.resolve();
    },
    createDirectory(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
    delete(_uri: Uri): Promise<void> {
      return Promise.resolve();
    },
  },
};

interface RegisteredEditor {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
}

const registeredEditors: RegisteredEditor[] = [];
const diagnosticCollections: MockDiagnosticCollection[] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const executedCommands: Array<{ command: string; args: unknown[] }> = [];
const informationMessages: string[] = [];
const warningMessages: string[] = [];
const writtenFiles: Array<{ uri: Uri; content: Uint8Array }> = [];
let saveDialogAnswer: Uri | undefined;

export const languages = {
  createDiagnosticCollection(name: string): MockDiagnosticCollection {
    const collection = new MockDiagnosticCollection(name);
    diagnosticCollections.push(collection);
    return collection;
  },
};

export const window = {
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  tabGroups: {
    get all(): readonly MockTabGroup[] {
      return tabGroups;
    },
    get activeTabGroup(): MockTabGroup {
      return tabGroups[activeTabGroupIndex]!;
    },
  },
  activeColorTheme: { kind: ColorThemeKind.Light } as { kind: ColorThemeKind },
  onDidChangeActiveColorTheme(listener: (theme: { kind: ColorThemeKind }) => void): Disposable {
    return colorThemeEmitter.event(listener);
  },
  showInformationMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    informationMessages.push(message);
    return Promise.resolve(undefined);
  },
  showWarningMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    warningMessages.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(_message: string, ..._items: string[]): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },
  showSaveDialog(_options: unknown): Promise<Uri | undefined> {
    return Promise.resolve(saveDialogAnswer);
  },
  registerCustomEditorProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    registeredEditors.push({ viewType, provider, options });
    return new Disposable(() => {});
  },
};

export const commands = {
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(command, callback);
    return new Disposable(() => registeredCommands.delete(command));
  },
  executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    executedCommands.push({ command, args });
    const callback = registeredCommands.get(command);
    return Promise.resolve(callback?.(...args));
  },
};

/**
 * Test control surface — NOT part of the real `vscode` API. Import from the relative mock path
 * (never from `'vscode'`) so the extension source stays typed against `@types/vscode`.
 */
export const vscodeMock = {
  /** Simulate an editor change event (echo or external edit) for the given document. */
  fireDidChangeTextDocument(document: unknown, contentChanges: unknown[] = [{}]): void {
    docChangeEmitter.fire({ document, contentChanges });
  },
  fireDidOpenTextDocument(document: unknown): void {
    docOpenEmitter.fire(document);
  },
  fireDidCloseTextDocument(document: unknown): void {
    docCloseEmitter.fire(document);
  },
  /** The collections `languages.createDiagnosticCollection` handed out (newest last). */
  diagnosticCollections(): readonly MockDiagnosticCollection[] {
    return diagnosticCollections;
  },
  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  },
  /** Every `commands.executeCommand` call, including the ones the host made itself. */
  executedCommands(): ReadonlyArray<{ command: string; args: unknown[] }> {
    return executedCommands;
  },
  informationMessages(): readonly string[] {
    return informationMessages;
  },
  warningMessages(): readonly string[] {
    return warningMessages;
  },
  /** The file the next save dialogs choose; none cancels them. */
  chooseSaveTarget(uri: Uri | undefined): void {
    saveDialogAnswer = uri;
  },
  writtenFiles(): ReadonlyArray<{ uri: Uri; content: Uint8Array }> {
    return writtenFiles;
  },
  /** The provider instance a `register(...)` call handed to `registerCustomEditorProvider`. */
  lastRegisteredProvider<T>(): T {
    const last = registeredEditors[registeredEditors.length - 1];
    if (!last) throw new Error("No custom editor provider has been registered.");
    return last.provider as T;
  },
  registeredEditors(): readonly RegisteredEditor[] {
    return registeredEditors;
  },
  /** Switch VS Code's color theme: the theme bridge posts the new appearance. */
  setColorThemeKind(kind: ColorThemeKind): void {
    window.activeColorTheme = { kind };
    colorThemeEmitter.fire({ kind });
  },
  /** Lays out the editor tabs, such as the ones VS Code restored after a reload. */
  setTabGroups(layout: readonly TabGroupLayout[]): void {
    tabGroups = tabGroupsOf(layout);
    activeTabGroupIndex = Math.max(
      0,
      layout.findIndex((entry) => entry.active === true),
    );
  },
  /** Reset shared state between tests. */
  reset(): void {
    tabGroups = tabGroupsOf([{ inputs: [] }]);
    activeTabGroupIndex = 0;
    registeredEditors.length = 0;
    diagnosticCollections.length = 0;
    registeredCommands.clear();
    executedCommands.length = 0;
    informationMessages.length = 0;
    warningMessages.length = 0;
    writtenFiles.length = 0;
    saveDialogAnswer = undefined;
    docChangeEmitter.dispose();
    docOpenEmitter.dispose();
    docCloseEmitter.dispose();
    workspace.workspaceFolders = undefined;
    workspace.textDocuments = [];
    window.activeTextEditor = undefined;
    window.activeColorTheme = { kind: ColorThemeKind.Light };
    colorThemeEmitter.dispose();
    configurationEmitter.dispose();
  },
};
