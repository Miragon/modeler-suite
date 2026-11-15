/**
 * The ambient `vscode` module for the unit project, which aliases `vscode` to this file (see
 * vitest.config.ts): the extension host runs in Node without a VS Code. Because Vitest resolves
 * both `'vscode'` and a relative import of this file to one module, a listener the host
 * registers and an event a test fires share one state.
 *
 * The workspace half (files, text documents, edits, the search, watchers, the folders) is the
 * fake of `src/files/memory-vscode.ts`, the same one the backend's own tests run against. What
 * is added here is the half the shell's document plumbing needs: the window, the custom editor
 * registration, the theme and the commands. The extension's sources stay typed against the real
 * `@types/vscode`; a test drives the mock through `vscodeMock`, which is no part of the API.
 */
import {
  createMemoryVsCode,
  MemoryRange,
  MemoryRelativePattern,
  MemoryUri,
  MemoryWorkspaceEdit,
  type MemoryVsCode,
} from "../../src/files/memory-vscode.js";

export {
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
  getConfiguration(section?: string): { get<T>(key: string): T | undefined };
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
  onDidChangeTextDocument: (listener) => now().onDidChangeTextDocument(listener),
  onDidCloseTextDocument: (listener) => now().onDidCloseTextDocument(listener),
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

const registeredEditors: RegisteredEditor[] = [];
const executedCommands: unknown[][] = [];
const shownMessages: Array<{ severity: "info" | "warning" | "error"; message: string }> = [];

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Light as number },
  onDidChangeActiveColorTheme(listener: (theme: { kind: number }) => void): Disposable {
    return colorThemeEmitter.event(listener);
  },
  showInformationMessage(message: string): Promise<string | undefined> {
    shownMessages.push({ severity: "info", message });
    return Promise.resolve(undefined);
  },
  showWarningMessage(message: string): Promise<string | undefined> {
    shownMessages.push({ severity: "warning", message });
    return Promise.resolve(undefined);
  },
  showErrorMessage(message: string): Promise<string | undefined> {
    shownMessages.push({ severity: "error", message });
    return Promise.resolve(undefined);
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
  executeCommand(command: string, ...rest: unknown[]): Promise<unknown> {
    executedCommands.push([command, ...rest]);
    return Promise.resolve(undefined);
  },
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
    return executedCommands;
  },
  shownMessages(): ReadonlyArray<{ severity: "info" | "warning" | "error"; message: string }> {
    return shownMessages;
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
    executedCommands.length = 0;
    shownMessages.length = 0;
    configuration.clear();
    colorThemeEmitter.dispose();
    configurationEmitter.dispose();
    window.activeColorTheme = { kind: ColorThemeKind.Light };
    return memory;
  },
};
