/**
 * Thin in-repo mock of the ambient `vscode` module. Vitest aliases `vscode` to this file (see
 * vitest.config.ts) so the extension host's logic can be unit-tested in Node without launching
 * VS Code. Only the API surface the host uses is implemented; tests drive it through `vscodeMock`,
 * which is NOT part of the real API.
 */

export class Disposable {
  constructor(private readonly onDispose: () => void) {}
  static from(...disposables: Array<{ dispose(): unknown }>): Disposable {
    return new Disposable(() => {
      for (const disposable of disposables) disposable.dispose();
    });
  }
  dispose(): void {
    this.onDispose();
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(event: T) => void>();
  readonly event = (listener: (event: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class CancellationError extends Error {}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
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

export class WorkspaceEdit {
  readonly edits: Array<{ uri: Uri; range: Range; text: string }> = [];
  replace(uri: Uri, range: Range, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}
  static file(path: string): Uri {
    return new Uri("file", path);
  }
  static parse(value: string): Uri {
    const colon = value.indexOf(":");
    return colon >= 0 ? new Uri(value.slice(0, colon), value.slice(colon + 1)) : Uri.file(value);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ""), ...segments].join("/"));
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString(): string {
    return `${this.scheme}:${this.path}`;
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
  code?: string | number;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
}

export class MockDiagnosticCollection {
  private readonly entries = new Map<string, readonly Diagnostic[]>();
  constructor(readonly name: string) {}
  set(uri: Uri, diagnostics: readonly Diagnostic[]): void {
    this.entries.set(uri.toString(), diagnostics);
  }
  get(uri: Uri): readonly Diagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }
  delete(uri: Uri): void {
    this.entries.delete(uri.toString());
  }
  dispose(): void {
    this.entries.clear();
  }
}

/** A text document whose content the mock's `applyEdit` changes. */
export class MockTextDocument {
  constructor(
    readonly uri: Uri,
    private text: string,
  ) {}
  getText(): string {
    return this.text;
  }
  /** Applies a recorded edit the way VS Code does, '\n' turned into the document's line break. */
  apply(range: Range, inserted: string): void {
    const lineBreak = this.text.includes("\r\n") ? "\r\n" : "\n";
    const lines = this.text.split(/\r\n|\n/);
    const offset = (position: Position): number =>
      lines.slice(0, position.line).reduce((sum, line) => sum + line.length + lineBreak.length, 0) +
      position.character;
    this.text =
      this.text.slice(0, offset(range.start)) +
      inserted.replace(/\n/g, lineBreak) +
      this.text.slice(offset(range.end));
  }
}

const documentChanges = new EventEmitter<{ document: unknown; contentChanges: unknown[] }>();
const documents = new Map<string, MockTextDocument>();
const appliedEdits: WorkspaceEdit[] = [];

export const workspace = {
  workspaceFolders: undefined as ReadonlyArray<{ uri: Uri }> | undefined,
  onDidChangeTextDocument(
    listener: (event: { document: unknown; contentChanges: unknown[] }) => void,
  ): Disposable {
    return documentChanges.event(listener);
  },
  onDidChangeConfiguration(): Disposable {
    return new Disposable(() => undefined);
  },
  getConfiguration(): { get<T>(key: string): T | undefined } {
    return { get: () => undefined };
  },
  applyEdit(edit: WorkspaceEdit): Promise<boolean> {
    appliedEdits.push(edit);
    for (const { uri, range, text } of edit.edits) {
      const document = documents.get(uri.toString());
      if (!document) continue;
      document.apply(range, text);
      documentChanges.fire({ document, contentChanges: [{ range, text }] });
    }
    return Promise.resolve(true);
  },
  fs: {
    written: [] as Array<{ uri: Uri; content: Uint8Array }>,
    writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      workspace.fs.written.push({ uri, content });
      return Promise.resolve();
    },
    readFile(): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array());
    },
  },
};

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const executedCommands: unknown[][] = [];
const notifications: Array<{ level: string; message: string; items: string[] }> = [];
let saveDialogAnswer: Uri | undefined;
let notificationAnswer: string | undefined;

export const window = {
  activeColorTheme: { kind: 1 },
  activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
  onDidChangeActiveColorTheme(): Disposable {
    return new Disposable(() => undefined);
  },
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    notifications.push({ level: "info", message, items });
    return Promise.resolve(notificationAnswer);
  },
  showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    notifications.push({ level: "warning", message, items });
    return Promise.resolve(notificationAnswer);
  },
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    notifications.push({ level: "error", message, items });
    return Promise.resolve(undefined);
  },
  showSaveDialog(): Promise<Uri | undefined> {
    return Promise.resolve(saveDialogAnswer);
  },
  showOpenDialog(): Promise<Uri[] | undefined> {
    return Promise.resolve(undefined);
  },
  registerCustomEditorProvider(): Disposable {
    return new Disposable(() => undefined);
  },
};

export const commands = {
  registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
    registeredCommands.set(command, callback);
    return new Disposable(() => registeredCommands.delete(command));
  },
  executeCommand(command: string, ...rest: unknown[]): Promise<unknown> {
    executedCommands.push([command, ...rest]);
    return Promise.resolve(undefined);
  },
};

export const languages = {
  createDiagnosticCollection(name: string): MockDiagnosticCollection {
    return new MockDiagnosticCollection(name);
  },
};

/** Test control surface — NOT part of the real `vscode` API. */
export const vscodeMock = {
  /** A text document `applyEdit` writes into (and fires its change event for). */
  openDocument(path: string, text: string): MockTextDocument {
    const document = new MockTextDocument(Uri.file(path), text);
    documents.set(document.uri.toString(), document);
    return document;
  },
  appliedEdits(): readonly WorkspaceEdit[] {
    return appliedEdits;
  },
  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  },
  /** Runs a registered command the way the Command Palette or a walkthrough link does. */
  runCommand(command: string, ...args: unknown[]): unknown {
    const callback = registeredCommands.get(command);
    if (!callback) throw new Error(`Command ${command} is not registered.`);
    return callback(...args);
  },
  executedCommands(): readonly unknown[][] {
    return executedCommands;
  },
  notifications(): ReadonlyArray<{ level: string; message: string; items: string[] }> {
    return notifications;
  },
  answerSaveDialog(uri: Uri | undefined): void {
    saveDialogAnswer = uri;
  },
  answerNotification(item: string | undefined): void {
    notificationAnswer = item;
  },
  reset(): void {
    documents.clear();
    appliedEdits.length = 0;
    registeredCommands.clear();
    executedCommands.length = 0;
    notifications.length = 0;
    workspace.fs.written.length = 0;
    workspace.workspaceFolders = undefined;
    saveDialogAnswer = undefined;
    notificationAnswer = undefined;
    documentChanges.dispose();
  },
};
