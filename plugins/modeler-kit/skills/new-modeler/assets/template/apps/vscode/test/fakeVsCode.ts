import {
  createVsCodeHostStub,
  type StubTextDocument,
} from '@miragon/modeler-shell/testing/vscode-stub';

/** `vscode.Uri` as far as the extension uses it: a file has `with`, so an export names its file. */
export class FakeUri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static file(path: string): FakeUri {
    return new FakeUri('file', path);
  }

  static joinPath(base: FakeUri, ...segments: string[]): FakeUri {
    return new FakeUri(base.scheme, [base.path.replace(/\/$/, ''), ...segments].join('/'));
  }

  with(change: { path: string }): FakeUri {
    return new FakeUri(this.scheme, change.path);
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface Notification {
  readonly severity: 'info' | 'warning' | 'error';
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
}

const NO_ANSWERS: Answers = {
  saveDialog: undefined,
  notification: undefined,
  writeError: undefined,
};

// The shell's stand-in runs the diagram editor (registerModelerEditor); the save dialog, the files,
// the notifications and the commands are this file's, so a test sets them up and reads them back.
const host = createVsCodeHostStub();
let answers = { ...NO_ANSWERS };
const saveDialogs: unknown[] = [];
const writtenFiles: Array<{ path: string; bytes: Uint8Array }> = [];
const notifications: Notification[] = [];
const executedCommands: unknown[][] = [];
const registeredCommands = new Map<string, () => unknown>();

function notify(severity: Notification['severity']) {
  return (message: string, ...items: unknown[]): Promise<string | undefined> => {
    notifications.push({ severity, message, items });
    return Promise.resolve(severity === 'error' ? undefined : answers.notification);
  };
}

class Diagnostic {
  source: string | undefined;

  constructor(
    readonly range: unknown,
    readonly message: string,
    readonly severity: number,
  ) {}
}

/** The module `vscode`, for `vi.mock`. */
export const vscodeModule = {
  window: Object.assign(host.vscode.window, {
    showSaveDialog(options: unknown): Promise<FakeUri | undefined> {
      saveDialogs.push(options);
      return Promise.resolve(answers.saveDialog);
    },
    showInformationMessage: notify('info'),
    showWarningMessage: notify('warning'),
    showErrorMessage: notify('error'),
  }),
  workspace: Object.assign(host.vscode.workspace, {
    workspaceFolders: undefined as ReadonlyArray<{ uri: FakeUri }> | undefined,
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
    registerCommand(command: string, callback: () => unknown) {
      registeredCommands.set(command, callback);
      return { dispose: () => void registeredCommands.delete(command) };
    },
    executeCommand(command: string, ...args: unknown[]): Promise<undefined> {
      executedCommands.push([command, ...args]);
      return Promise.resolve(undefined);
    },
  },
  languages: {
    createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
  },
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Disposable: {
    from: (...disposables: Array<{ dispose(): unknown }>) => ({
      dispose: () => disposables.forEach((disposable) => disposable.dispose()),
    }),
  },
  Uri: FakeUri,
  Range: host.vscode.Range,
  WorkspaceEdit: host.vscode.WorkspaceEdit,
};

export const fakeVsCode = {
  saveDialogs,
  writtenFiles,
  notifications,
  executedCommands,
  answer(next: Partial<Answers>): void {
    answers = { ...answers, ...next };
  },
  setWorkspaceFolder(path: string | undefined): void {
    vscodeModule.workspace.workspaceFolders =
      path === undefined ? undefined : [{ uri: FakeUri.file(path) }];
  },
  /** Runs a command as the Command Palette does and resolves once it has finished. */
  async runCommand(command: string): Promise<unknown> {
    const callback = registeredCommands.get(command);
    if (!callback) throw new Error(`${command} is not registered.`);
    return callback();
  },
  /** VS Code opening `text` at `uri` in the custom editor of `viewType`. */
  openCustomEditor(viewType: string, uri: FakeUri, text: string) {
    const lines = text.split('\n');
    const document: StubTextDocument = {
      uri,
      eol: '\n',
      readOnly: false,
      lineCount: lines.length,
      lineAt: (line) => ({ text: lines[line] ?? '' }),
      getText: () => text,
    };
    return host.openCustomEditor(viewType, document);
  },
  reset(): void {
    answers = { ...NO_ANSWERS };
    for (const list of [saveDialogs, writtenFiles, notifications, executedCommands]) {
      list.length = 0;
    }
    vscodeModule.workspace.workspaceFolders = undefined;
  },
};
