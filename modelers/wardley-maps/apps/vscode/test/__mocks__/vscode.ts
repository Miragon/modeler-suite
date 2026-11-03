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

import { posix } from "node:path";

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
  get authority(): string {
    return "";
  }
  static parse(value: string): Uri {
    const idx = value.indexOf(":");
    return idx >= 0 ? new Uri(value.slice(0, idx), value.slice(idx + 1)) : new Uri("file", value);
  }
  static file(path: string): Uri {
    return new Uri("file", path);
  }
  /** Normalises `.`, `..` and repeated slashes, as the real one does outside Windows. */
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, posix.join(base.path, ...segments));
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

/** A glob below `base`, a folder's Uri. */
export class RelativePattern {
  readonly baseUri: Uri;
  constructor(
    base: Uri | { uri: Uri },
    readonly pattern: string,
  ) {
    this.baseUri = base instanceof Uri ? base : base.uri;
  }
}

/** The only glob the extension watches and searches: the map files. */
const MAP_FILES = /\.(wmap|owm)$/i;

function isBelow(path: string, folder: string): boolean {
  return path.startsWith(`${folder.replace(/\/$/, "")}/`);
}

/**
 * Whether a file event or search result at `path` matches `include`: a map file inside a
 * workspace folder for the string glob (the real one reports from workspace folders only), a map
 * file below its base for a RelativePattern.
 */
function matchesMapGlob(path: string, include: string | RelativePattern): boolean {
  if (!MAP_FILES.test(path)) return false;
  return include instanceof RelativePattern
    ? isBelow(path, include.baseUri.path)
    : workspace.getWorkspaceFolder(Uri.file(path)) !== undefined;
}

interface MockWatcher {
  readonly include: string | RelativePattern;
  readonly created: EventEmitter<Uri>;
  readonly deleted: EventEmitter<Uri>;
}

const watchers: MockWatcher[] = [];

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
const filesCreatedEmitter = new EventEmitter<{ files: readonly Uri[] }>();
const filesDeletedEmitter = new EventEmitter<{ files: readonly Uri[] }>();
const filesRenamedEmitter = new EventEmitter<{
  files: ReadonlyArray<{ oldUri: Uri; newUri: Uri }>;
}>();
const workspaceFoldersEmitter = new EventEmitter<unknown>();
const configuration = new Map<string, unknown>();

export const workspace = {
  workspaceFolders: undefined as ReadonlyArray<{ uri: Uri }> | undefined,
  textDocuments: [] as unknown[],
  /** The folder holding `uri`, by whole path segments and scheme as the real one compares them. */
  getWorkspaceFolder(uri: Uri): { uri: Uri } | undefined {
    return workspace.workspaceFolders?.find(
      ({ uri: folder }) =>
        folder.scheme === uri.scheme &&
        (uri.path === folder.path || uri.path.startsWith(`${folder.path}/`)),
    );
  },
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
  /** VS Code's own file operations (Explorer, a WorkspaceEdit), for files and folders alike. */
  onDidCreateFiles(listener: (event: { files: readonly Uri[] }) => void): Disposable {
    return filesCreatedEmitter.event(listener);
  },
  onDidDeleteFiles(listener: (event: { files: readonly Uri[] }) => void): Disposable {
    return filesDeletedEmitter.event(listener);
  },
  onDidRenameFiles(
    listener: (event: { files: ReadonlyArray<{ oldUri: Uri; newUri: Uri }> }) => void,
  ): Disposable {
    return filesRenamedEmitter.event(listener);
  },
  onDidChangeWorkspaceFolders(listener: (event: unknown) => void): Disposable {
    return workspaceFoldersEmitter.event(listener);
  },
  /** Reports what `vscodeMock.fireFileWatcher` names, if it matches, unless told to ignore it. */
  createFileSystemWatcher(
    include: string | RelativePattern,
    ignoreCreateEvents = false,
    _ignoreChangeEvents = false,
    ignoreDeleteEvents = false,
  ) {
    const watcher: MockWatcher = {
      include,
      created: new EventEmitter<Uri>(),
      deleted: new EventEmitter<Uri>(),
    };
    watchers.push(watcher);
    const never = (): Disposable => new Disposable(() => {});
    return {
      onDidCreate: ignoreCreateEvents ? never : watcher.created.event,
      onDidChange: never,
      onDidDelete: ignoreDeleteEvents ? never : watcher.deleted.event,
      dispose: () => {
        const index = watchers.indexOf(watcher);
        if (index !== -1) watchers.splice(index, 1);
        watcher.created.dispose();
        watcher.deleted.dispose();
      },
    };
  },
  /** What `vscodeMock.setConfiguration` set, by the full key. */
  getConfiguration(section?: string, _scope?: unknown): { get<T>(key: string): T | undefined } {
    return {
      get: <T>(key: string) => configuration.get(section ? `${section}.${key}` : key) as T,
    };
  },
  onDidChangeConfiguration(
    listener: (event: { affectsConfiguration(section: string): boolean }) => void,
  ): Disposable {
    return configurationEmitter.event(listener);
  },
  /** Records the edit (`vscodeMock.appliedEdits`); a test replaces it to apply one. */
  applyEdit(edit: WorkspaceEdit): Promise<boolean> {
    appliedEdits.push(edit);
    return Promise.resolve(true);
  },
  /**
   * The map files `vscodeMock.setFileTypes` named inside a workspace folder, or below a
   * RelativePattern's base, in no particular order; it reads only the map pattern the extension
   * asks for.
   */
  findFiles(include: string | RelativePattern): Promise<Uri[]> {
    findFilesCalls.push(include);
    return Promise.resolve(
      [...fileTypes]
        .filter(([path, type]) => type & FileType.File && matchesMapGlob(path, include))
        .map(([path]) => Uri.file(path))
        .reverse(),
    );
  },
  fs: {
    /** Knows what `vscodeMock.setFileTypes` named; anything else is missing. */
    stat(uri: Uri): Promise<{ type: FileType }> {
      const type = fileTypes.get(uri.path);
      return type === undefined
        ? Promise.reject(new Error(`No such file: ${uri.path}`))
        : Promise.resolve({ type });
    },
    /** The text `vscodeMock.setFileTexts` gave the file, as UTF-8; empty for any other. */
    readFile(uri: Uri): Promise<Uint8Array> {
      return Promise.resolve(new TextEncoder().encode(fileTexts.get(uri.path) ?? ""));
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
const errorMessages: string[] = [];
const writtenFiles: Array<{ uri: Uri; content: Uint8Array }> = [];
const fileTypes = new Map<string, FileType>();
const fileTexts = new Map<string, string>();
const findFilesCalls: Array<string | RelativePattern> = [];
const appliedEdits: WorkspaceEdit[] = [];
const shownMessages: Array<{ message: string; options: unknown; items: unknown[] }> = [];
let messageAnswer: string | undefined;
const openedExternally: Uri[] = [];
const quickPicks: Array<{ items: readonly QuickPickItem[]; options: unknown }> = [];
let quickPickAnswer: string | undefined;
let saveDialogAnswer: Uri | undefined;

export interface QuickPickItem {
  label: string;
  description?: string;
}

export interface MessageItem {
  title: string;
  isCloseAffordance?: boolean;
}

export const env = {
  openExternal(uri: Uri): Promise<boolean> {
    openedExternally.push(uri);
    return Promise.resolve(true);
  },
};

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
  /**
   * Records the message, its options (`{ modal: true }`) and its items, and takes the item
   * `vscodeMock.answerMessage` named by its title; none dismisses the message.
   */
  showInformationMessage(message: string, ...rest: unknown[]): Promise<unknown> {
    informationMessages.push(message);
    const [first, ...others] = rest;
    const hasOptions = typeof first === "object" && first !== null && !("title" in first);
    const items = hasOptions ? others : rest;
    shownMessages.push({ message, options: hasOptions ? first : undefined, items });
    return Promise.resolve(
      items.find((item) =>
        typeof item === "string"
          ? item === messageAnswer
          : (item as MessageItem).title === messageAnswer,
      ),
    );
  },
  showWarningMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    warningMessages.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(message: string, ..._items: string[]): Promise<string | undefined> {
    errorMessages.push(message);
    return Promise.resolve(undefined);
  },
  showSaveDialog(_options: unknown): Promise<Uri | undefined> {
    return Promise.resolve(saveDialogAnswer);
  },
  /** Records what it offers and takes the item `vscodeMock.answerQuickPick` named; none cancels. */
  showQuickPick<T extends QuickPickItem>(
    items: readonly T[],
    options?: unknown,
  ): Promise<T | undefined> {
    quickPicks.push({ items, options });
    return Promise.resolve(items.find(({ label }) => label === quickPickAnswer));
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
  errorMessages(): readonly string[] {
    return errorMessages;
  },
  /** What `workspace.fs.stat` finds, by path. */
  setFileTypes(types: Readonly<Record<string, FileType>>): void {
    fileTypes.clear();
    for (const [path, type] of Object.entries(types)) fileTypes.set(path, type);
  },
  /** The current file system, by path, for a test that changes it. */
  fileTypes(): ReadonlyMap<string, FileType> {
    return fileTypes;
  },
  /** What `workspace.fs.readFile` reads, by path: files and their texts. */
  setFileTexts(texts: Readonly<Record<string, string>>): void {
    fileTexts.clear();
    for (const [path, text] of Object.entries(texts)) {
      fileTexts.set(path, text);
      if (!fileTypes.has(path)) fileTypes.set(path, FileType.File);
    }
  },
  fileText(path: string): string | undefined {
    return fileTexts.get(path);
  },
  /** Every `workspace.findFiles` include, in call order. */
  findFilesCalls(): ReadonlyArray<string | RelativePattern> {
    return findFilesCalls;
  },
  /**
   * A file event on disk, as the watchers report it: only to those whose glob matches `path`, so
   * a folder's event reaches none of the map watchers and says nothing about the maps inside.
   */
  fireFileWatcher(kind: "create" | "delete", path: string): void {
    for (const watcher of [...watchers]) {
      if (!matchesMapGlob(path, watcher.include)) continue;
      (kind === "create" ? watcher.created : watcher.deleted).fire(Uri.file(path));
    }
  },
  fireDidCreateFiles(paths: readonly string[]): void {
    filesCreatedEmitter.fire({ files: paths.map((path) => Uri.file(path)) });
  },
  fireDidDeleteFiles(paths: readonly string[]): void {
    filesDeletedEmitter.fire({ files: paths.map((path) => Uri.file(path)) });
  },
  fireDidRenameFiles(moves: ReadonlyArray<readonly [oldPath: string, newPath: string]>): void {
    filesRenamedEmitter.fire({
      files: moves.map(([oldPath, newPath]) => ({
        oldUri: Uri.file(oldPath),
        newUri: Uri.file(newPath),
      })),
    });
  },
  fireDidChangeWorkspaceFolders(): void {
    workspaceFoldersEmitter.fire({});
  },
  /** A setting `workspace.getConfiguration` reads, by its full key. */
  setConfiguration(key: string, value: unknown): void {
    configuration.set(key, value);
  },
  /** Every edit `workspace.applyEdit` got while the mock's own one was in place. */
  appliedEdits(): readonly WorkspaceEdit[] {
    return appliedEdits;
  },
  /** Every `window.showInformationMessage` with its options and items. */
  shownMessages(): ReadonlyArray<{ message: string; options: unknown; items: unknown[] }> {
    return shownMessages;
  },
  /** The title of the item the next messages choose; none dismisses them. */
  answerMessage(title: string | undefined): void {
    messageAnswer = title;
  },
  /** Every `env.openExternal` call. */
  openedExternally(): readonly Uri[] {
    return openedExternally;
  },
  /** What every `window.showQuickPick` offered. */
  quickPicks(): ReadonlyArray<{ items: readonly QuickPickItem[]; options: unknown }> {
    return quickPicks;
  },
  /** The label the next Quick Picks choose; none cancels them. */
  answerQuickPick(label: string | undefined): void {
    quickPickAnswer = label;
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
    errorMessages.length = 0;
    writtenFiles.length = 0;
    fileTypes.clear();
    fileTexts.clear();
    findFilesCalls.length = 0;
    appliedEdits.length = 0;
    shownMessages.length = 0;
    messageAnswer = undefined;
    configuration.clear();
    watchers.length = 0;
    filesCreatedEmitter.dispose();
    filesDeletedEmitter.dispose();
    filesRenamedEmitter.dispose();
    workspaceFoldersEmitter.dispose();
    openedExternally.length = 0;
    quickPicks.length = 0;
    quickPickAnswer = undefined;
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
