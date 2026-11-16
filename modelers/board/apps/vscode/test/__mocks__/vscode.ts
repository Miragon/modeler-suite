/**
 * The ambient `vscode` module for the unit project, which aliases `vscode` to this file (see
 * vitest.config.ts): the extension host runs in Node without a VS Code. Because Vitest resolves
 * both `'vscode'` and a relative import of this file to one module, a listener the host
 * registers and an event a test fires share one state.
 *
 * The workspace half (files, text documents and their saves, edits, the search, watchers, the
 * folders, the commands, the diagnostics) is the fake of `src/files/memory-vscode.ts`, the same
 * one the backend's own tests run against. What is added here is the half the shell's plumbing
 * needs: the window with its dialogs, notifications and tabs, the custom editor registration,
 * the theme and the settings. The extension's sources stay typed against the real
 * `@types/vscode`; a test drives the mock through `vscodeMock`, which is no part of the API.
 */
import {
  createMemoryVsCode,
  MemoryDiagnostic,
  MemoryDiagnosticSeverity,
  MemoryRange,
  MemoryRelativePattern,
  MemoryUri,
  MemoryWorkspaceEdit,
  type MemoryDiagnosticCollection,
  type MemoryVsCode,
} from "../../src/files/memory-vscode.js";

export {
  MemoryDiagnostic as Diagnostic,
  MemoryDiagnosticSeverity as DiagnosticSeverity,
  MemoryRange as Range,
  MemoryRelativePattern as RelativePattern,
  MemoryUri as Uri,
  MemoryWorkspaceEdit as WorkspaceEdit,
};

export class Disposable {
  constructor(private readonly _dispose: () => void) {}
  static from(...disposables: Array<{ dispose(): unknown }>): Disposable {
    return new Disposable(() => {
      for (const disposable of disposables) disposable.dispose();
    });
  }
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

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
}

export enum TextDocumentSaveReason {
  Manual = 1,
  AfterDelay = 2,
  FocusOut = 3,
}

/** The input of a custom editor's tab. */
export class TabInputCustom {
  constructor(
    readonly uri: MemoryUri,
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
  /** The inputs of the group's tabs; a walkthrough's is none of the API's input types. */
  readonly inputs: readonly unknown[];
  /** The index of the tab the group shows. */
  readonly activeTab?: number | undefined;
  /** The active group (default: the first). */
  readonly active?: boolean | undefined;
}

function tabGroupsOf(layout: readonly TabGroupLayout[]): MockTabGroup[] {
  return layout.map((entry, index) => {
    const group: MockTabGroup = { viewColumn: index + 1, tabs: [], activeTab: undefined };
    group.tabs.push(...entry.inputs.map((input) => ({ input, group })));
    group.activeTab = entry.activeTab === undefined ? undefined : group.tabs[entry.activeTab];
    return group;
  });
}

const NO_TABS: readonly TabGroupLayout[] = [{ inputs: [] }];
let tabGroups: MockTabGroup[] = tabGroupsOf(NO_TABS);
let activeTabGroupIndex = 0;

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

let memory: MemoryVsCode = createMemoryVsCode();

const colorThemeEmitter = new EventEmitter<{ kind: number }>();
const configurationEmitter = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();
const configuration = new Map<string, unknown>();

type MemoryWorkspace = MemoryVsCode["vscode"]["workspace"];

interface MockWorkspace extends MemoryWorkspace {
  onDidChangeConfiguration(
    listener: (e: { affectsConfiguration(section: string): boolean }) => void,
  ): Disposable;
  /** `scope` is the resource a setting is read for; the mock has one value for every resource */
  getConfiguration(section?: string, scope?: unknown): { get<T>(key: string): T | undefined };
}

const now = (): MemoryWorkspace => memory.vscode.workspace;

/**
 * One object for the life of the module, since the host keeps `vscode.workspace`; each member
 * answers from the fake of the moment, which `vscodeMock.reset` replaces.
 */
export const workspace: MockWorkspace = {
  get workspaceFolders() {
    return now().workspaceFolders;
  },
  getWorkspaceFolder: (uri) => now().getWorkspaceFolder(uri),
  onDidChangeWorkspaceFolders: (listener) => now().onDidChangeWorkspaceFolders(listener),
  findFiles: (include, exclude) => now().findFiles(include, exclude),
  createFileSystemWatcher: (pattern) => now().createFileSystemWatcher(pattern),
  onDidCreateFiles: (listener) => now().onDidCreateFiles(listener),
  onDidDeleteFiles: (listener) => now().onDidDeleteFiles(listener),
  onDidRenameFiles: (listener) => now().onDidRenameFiles(listener),
  openTextDocument: (uri) => now().openTextDocument(uri),
  onDidOpenTextDocument: (listener) => now().onDidOpenTextDocument(listener),
  onDidChangeTextDocument: (listener) => now().onDidChangeTextDocument(listener),
  onDidCloseTextDocument: (listener) => now().onDidCloseTextDocument(listener),
  get textDocuments() {
    return now().textDocuments;
  },
  onWillSaveTextDocument: (listener) => now().onWillSaveTextDocument(listener),
  onDidSaveTextDocument: (listener) => now().onDidSaveTextDocument(listener),
  applyEdit: (edit) => now().applyEdit(edit),
  fs: {
    stat: (uri) => now().fs.stat(uri),
    readFile: (uri) => now().fs.readFile(uri),
    writeFile: (uri, content) => now().fs.writeFile(uri, content),
    createDirectory: (uri) => now().fs.createDirectory(uri),
  },
  onDidChangeConfiguration: (listener) => configurationEmitter.event(listener),
  getConfiguration: (section) => ({
    get: <T>(key: string) => configuration.get(section ? `${section}.${key}` : key) as T,
  }),
};

interface RegisteredEditor {
  readonly viewType: string;
  readonly provider: unknown;
  readonly options: unknown;
  /** whether the registration was disposed, as when the extension is deactivated */
  disposed: boolean;
}

interface ShownMessage {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  /** the buttons the notification offered */
  readonly items: readonly string[];
  /** a dialog the person has to answer before anything else */
  readonly modal: boolean;
}

const registeredEditors: RegisteredEditor[] = [];
const shownMessages: ShownMessage[] = [];
const saveDialogs: unknown[] = [];
/** what the person answers the next save dialog with: the file, or nothing for a closed dialog */
let saveDialogAnswer: MemoryUri | undefined;
/** the button the person presses in every notification that offers it */
let pressed: string | undefined;

function show(
  severity: ShownMessage["severity"],
  message: string,
  rest: unknown[],
): string | undefined {
  const items = rest.filter((item): item is string => typeof item === "string");
  const modal = rest.some((item) => (item as { modal?: unknown } | null)?.modal === true);
  shownMessages.push({ severity, message, items, modal });
  return pressed !== undefined && items.includes(pressed) ? pressed : undefined;
}

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Light as number },
  tabGroups: {
    get all(): readonly MockTabGroup[] {
      return tabGroups;
    },
    get activeTabGroup(): MockTabGroup {
      return tabGroups[activeTabGroupIndex]!;
    },
  },
  onDidChangeActiveColorTheme(listener: (theme: { kind: number }) => void): Disposable {
    return colorThemeEmitter.event(listener);
  },
  showInformationMessage(message: string, ...rest: unknown[]): Promise<string | undefined> {
    return Promise.resolve(show("info", message, rest));
  },
  showWarningMessage(message: string, ...rest: unknown[]): Promise<string | undefined> {
    return Promise.resolve(show("warning", message, rest));
  },
  showErrorMessage(message: string, ...rest: unknown[]): Promise<string | undefined> {
    return Promise.resolve(show("error", message, rest));
  },
  showSaveDialog(options: unknown): Promise<MemoryUri | undefined> {
    saveDialogs.push(options);
    return Promise.resolve(saveDialogAnswer);
  },
  registerCustomEditorProvider(viewType: string, provider: unknown, options?: unknown): Disposable {
    const editor: RegisteredEditor = { viewType, provider, options, disposed: false };
    registeredEditors.push(editor);
    return new Disposable(() => {
      editor.disposed = true;
    });
  },
};

export const commands = {
  registerCommand(command: string, callback: (...rest: unknown[]) => unknown): Disposable {
    const registered = memory.vscode.commands.registerCommand(command, callback);
    return new Disposable(() => registered.dispose());
  },
  executeCommand: (command: string, ...rest: unknown[]): Promise<unknown> =>
    Promise.resolve(memory.vscode.commands.executeCommand(command, ...rest)),
};

export const languages = {
  createDiagnosticCollection: (name: string): MemoryDiagnosticCollection =>
    memory.vscode.languages.createDiagnosticCollection(name),
};

/**
 * Test control surface, NOT part of the real `vscode` API. Import from the relative mock path
 * (never from `'vscode'`) so the extension source stays typed against `@types/vscode`.
 */
export const vscodeMock = {
  /** the workspace of the moment: its disk, its documents and what a test does to them */
  get memory(): MemoryVsCode {
    return memory;
  },
  /** Switch the color theme the way VS Code does: the kind changes, then the event fires. */
  setColorThemeKind(kind: ColorThemeKind): void {
    window.activeColorTheme = { kind };
    colorThemeEmitter.fire(window.activeColorTheme);
  },
  setConfiguration(key: string, value: unknown): void {
    configuration.set(key, value);
    configurationEmitter.fire({ affectsConfiguration: (section) => key.startsWith(section) });
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
  /** Every `vscode.commands.executeCommand` call, as `[command, ...args]`. */
  executedCommands(): readonly unknown[][] {
    return memory.executed;
  },
  shownMessages(): readonly ShownMessage[] {
    return shownMessages;
  },
  /** The person presses this button in every notification that offers it; none without one. */
  press(item: string | undefined): void {
    pressed = item;
  },
  /** The file the person picks in the next save dialogs; undefined closes the dialog. */
  answerSaveDialog(uri: MemoryUri | undefined): void {
    saveDialogAnswer = uri;
  },
  /** The options of every save dialog that was shown. */
  saveDialogs(): readonly unknown[] {
    return saveDialogs;
  },
  /** The editor groups and their tabs, for `window.tabGroups`. */
  setTabGroups(layout: readonly TabGroupLayout[]): void {
    tabGroups = tabGroupsOf(layout);
    const active = layout.findIndex((entry) => entry.active === true);
    activeTabGroupIndex = active === -1 ? 0 : active;
  },
  /**
   * A new workspace and nothing registered: between tests. `files` is the disk at the start, a
   * text per absolute path.
   */
  reset(
    files: Record<string, string> = {},
    options: { workspaceFolders?: readonly string[] | undefined } = {},
  ): MemoryVsCode {
    memory = createMemoryVsCode(files, options);
    registeredEditors.length = 0;
    shownMessages.length = 0;
    saveDialogs.length = 0;
    saveDialogAnswer = undefined;
    pressed = undefined;
    tabGroups = tabGroupsOf(NO_TABS);
    activeTabGroupIndex = 0;
    configuration.clear();
    colorThemeEmitter.dispose();
    configurationEmitter.dispose();
    window.activeColorTheme = { kind: ColorThemeKind.Light };
    return memory;
  },
};
