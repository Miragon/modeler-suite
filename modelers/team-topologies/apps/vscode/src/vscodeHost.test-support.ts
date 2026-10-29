import {
  createVsCodeHostStub,
  type StubTextDocument,
  type VsCodeHostStub,
} from "@miragon/modeler-shell/testing/vscode-stub";

/*
 * The `vscode` module of the extension's unit tests (`vi.mock("vscode", …)` hands the sources
 * `vscodeModule`): the shell's stand-in for the extension host's documents, custom editors and
 * webview panels, plus what only this extension calls (its commands, the tab groups, the save
 * participant and the diagnostics' classes). `resetVsCodeHost()` starts every test with a fresh
 * host, which `vscodeHost()` returns.
 */

let host: VsCodeHostStub = createVsCodeHostStub();
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export class Uri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static file(path: string): Uri {
    return new Uri("file", path);
  }

  static joinPath(base: { scheme: string; path: string }, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ""), ...segments].join("/"));
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

/** Both of VS Code's constructors: `(start, end)` and `(startLine, startCharacter, endLine, endCharacter)`. */
export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startOrLine === "number" && typeof endOrCharacter === "number") {
      this.start = new Position(startOrLine, endOrCharacter);
      this.end = new Position(endLine ?? startOrLine, endCharacter ?? endOrCharacter);
    } else {
      this.start = startOrLine as Position;
      this.end = endOrCharacter as Position;
    }
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
}

export class Diagnostic {
  source: string | undefined;

  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity,
  ) {}
}

export enum TextDocumentSaveReason {
  Manual = 1,
  AfterDelay = 2,
  FocusOut = 3,
}

export class TabInputCustom {
  constructor(
    readonly uri: Uri,
    readonly viewType: string,
  ) {}
}

interface Tab {
  readonly input: unknown;
  readonly group: TabGroup;
}

interface TabGroup {
  readonly viewColumn: number;
  readonly tabs: Tab[];
  activeTab: Tab | undefined;
}

/** One entry per group, in view column order; the walkthrough's input is none of the API's. */
export type TabLayout = ReadonlyArray<{
  inputs: readonly unknown[];
  /** The index of the tab the group shows. */
  activeTab?: number;
  /** The active group (default: the first). */
  active?: boolean;
}>;

const tabs = { groups: [] as TabGroup[], active: 0 };

/** Lays out VS Code's tab groups, as `window.tabGroups` reports them. */
export function layOutTabs(layout: TabLayout): void {
  tabs.groups = layout.map((entry, index) => {
    const group: TabGroup = { viewColumn: index + 1, tabs: [], activeTab: undefined };
    group.tabs.push(...entry.inputs.map((input) => ({ input, group })));
    group.activeTab = entry.activeTab === undefined ? undefined : group.tabs[entry.activeTab];
    return group;
  });
  tabs.active = Math.max(
    0,
    layout.findIndex((entry) => entry.active === true),
  );
}
layOutTabs([{ inputs: [] }]);

interface WillSaveEvent {
  readonly document: StubTextDocument;
  readonly reason: TextDocumentSaveReason;
  waitUntil(thenable: PromiseLike<unknown>): void;
}

const willSaveListeners = new Set<(event: WillSaveEvent) => unknown>();

export const vscodeModule = {
  Uri,
  Position,
  Range,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentSaveReason,
  TabInputCustom,
  ViewColumn: { Beside: -2 },
  // The host's own class: its applyEdit takes only the edits it built.
  WorkspaceEdit: class {
    constructor() {
      return new host.vscode.WorkspaceEdit();
    }
  },
  window: {
    get activeColorTheme() {
      return host.vscode.window.activeColorTheme;
    },
    activeTextEditor: undefined,
    tabGroups: {
      get all(): readonly TabGroup[] {
        return tabs.groups;
      },
      get activeTabGroup(): TabGroup {
        return tabs.groups[tabs.active]!;
      },
    },
    onDidChangeActiveColorTheme: (
      ...args: Parameters<VsCodeHostStub["vscode"]["window"]["onDidChangeActiveColorTheme"]>
    ) => host.vscode.window.onDidChangeActiveColorTheme(...args),
    registerCustomEditorProvider: (
      ...args: Parameters<VsCodeHostStub["vscode"]["window"]["registerCustomEditorProvider"]>
    ) => host.vscode.window.registerCustomEditorProvider(...args),
    showInformationMessage: (message: string) => host.vscode.window.showInformationMessage(message),
    showErrorMessage: (message: string) => host.vscode.window.showErrorMessage(message),
  },
  workspace: {
    getConfiguration: (section?: string) => host.vscode.workspace.getConfiguration(section),
    onDidChangeConfiguration: (
      ...args: Parameters<VsCodeHostStub["vscode"]["workspace"]["onDidChangeConfiguration"]>
    ) => host.vscode.workspace.onDidChangeConfiguration(...args),
    onDidChangeTextDocument: (
      ...args: Parameters<VsCodeHostStub["vscode"]["workspace"]["onDidChangeTextDocument"]>
    ) => host.vscode.workspace.onDidChangeTextDocument(...args),
    applyEdit: (...args: Parameters<VsCodeHostStub["vscode"]["workspace"]["applyEdit"]>) =>
      host.vscode.workspace.applyEdit(...args),
    onWillSaveTextDocument(listener: (event: WillSaveEvent) => unknown) {
      willSaveListeners.add(listener);
      return { dispose: () => willSaveListeners.delete(listener) };
    },
  },
  commands: {
    registerCommand(id: string, callback: (...args: unknown[]) => unknown) {
      registeredCommands.set(id, callback);
      return { dispose: () => registeredCommands.delete(id) };
    },
    executeCommand: (command: string, ...args: unknown[]) =>
      host.vscode.commands.executeCommand(command, ...args),
  },
};

/** The host of the running test. */
export function vscodeHost(): VsCodeHostStub {
  return host;
}

/** A text document of the host, with the `positionAt` the diagnostics locate their problems by. */
export function openTextDocument(path: string, text: string): StubTextDocument {
  const document = host.openTextDocument(path, text);
  return Object.assign(document, {
    positionAt(offset: number): Position {
      const linesBefore = document
        .getText()
        .slice(0, offset)
        .split(/\r\n|\n/);
      return new Position(linesBefore.length - 1, linesBefore.at(-1)?.length ?? 0);
    },
  });
}

export function resetVsCodeHost(): void {
  host = createVsCodeHostStub();
  registeredCommands.clear();
  willSaveListeners.clear();
  layOutTabs([{ inputs: [] }]);
}

/** Runs a command the extension registered, as the Command Palette or a button does. */
export function runCommand(id: string, ...args: unknown[]): unknown {
  return registeredCommands.get(id)?.(...args);
}

/**
 * VS Code saving `document`: every save participant runs, the save waits for what they passed to
 * `waitUntil`, then the dirty state changes.
 */
export async function saveDocument(
  document: StubTextDocument,
  reason: TextDocumentSaveReason = TextDocumentSaveReason.Manual,
): Promise<void> {
  const waits: PromiseLike<unknown>[] = [];
  for (const listener of [...willSaveListeners]) {
    listener({ document, reason, waitUntil: (thenable) => waits.push(thenable) });
  }
  await Promise.all(waits);
  host.save(document);
}
