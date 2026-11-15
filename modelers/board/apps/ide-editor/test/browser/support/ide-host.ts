/**
 * An IDE host of the test's own around the shell's real `mountShell`, in the IDE column, and a
 * document the test drives. Its document keeps the rules of the shell's own sync: the texts are
 * imported one after the other, and a change of the canvas is an edit only after the first
 * import, while the editor may write, and when the text differs from the one shown last.
 */
import { mountShell, type ShellHandle } from "@miragon/modeler-shell";
import type { IdeDocumentOptions, IdeEditorHost } from "@miragon/modeler-shell/ide";

export interface TestDocument {
  /** The first text. Resolves once the editor imported or refused it. */
  open(text: string): Promise<void>;
  /** A change from outside: the host's undo, a text editor beside the board, a checkout. */
  change(text: string): Promise<void>;
  /** Every text the editor pushed as an edit, in order. */
  readonly edits: readonly string[];
  /** The commands the editor offers the host, by name. */
  commands(): Readonly<Record<string, () => unknown>>;
  disconnected(): boolean;
}

export interface TestHost {
  readonly host: IdeEditorHost;
  readonly document: TestDocument;
}

export interface TestHostOptions {
  /** true for a host without a history of its own (Orca): the canvas binds the undo keys */
  canvasOwnsHistory?: boolean | undefined;
  /** the host opened the document read only */
  readOnly?: boolean | undefined;
  /** the host cannot connect the document: `connectDocument` rejects with this message */
  connectFails?: string | undefined;
}

export function testHost(options: TestHostOptions = {}): TestHost {
  const edits: string[] = [];
  let connected: IdeDocumentOptions | undefined;
  let disconnected = false;
  let reconciled = "";
  let initialised = false;
  let imports: Promise<void> = Promise.resolve();
  let settleReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => (settleReady = resolve));

  const show = async (text: string): Promise<void> => {
    if (!connected) throw new Error("the editor has not connected its document");
    const first = !initialised;
    try {
      if (await connected.importText(text, { first, reconciledText: reconciled })) {
        reconciled = text;
      }
    } finally {
      initialised = true;
    }
  };
  const enqueue = (text: string): Promise<void> => {
    imports = imports.then(() => show(text));
    return imports;
  };

  const host: IdeEditorHost = {
    kind: "vscode",
    canvasOwnsHistory: options.canvasOwnsHistory === true,
    state: {
      view: undefined,
      legendOpen: undefined,
      writeLegendOpen: () => undefined,
      read: () => undefined,
      write: () => undefined,
      persistView: () => () => undefined,
    },
    mountShell: (root, shellOptions): ShellHandle =>
      mountShell(root, {
        ...shellOptions,
        host: "ide",
        keyScope: "document",
        lang: "en",
        platform: "other",
      }),
    async connectDocument(_shell, documentOptions) {
      if (options.connectFails !== undefined) throw new Error(options.connectFails);
      connected = documentOptions;
      return {
        pushEdit() {
          if (!initialised || !documentOptions.canWrite()) return;
          const text = documentOptions.exportText(reconciled);
          if (text === reconciled) return;
          reconciled = text;
          edits.push(text);
        },
        ready,
        imported: () => imports,
        readOnly: options.readOnly === true,
        insertExample: () => undefined,
        disconnect: () => void (disconnected = true),
      };
    },
    saveExport: async () => undefined,
    notify: () => undefined,
  };
  return {
    host,
    document: {
      open: (text) => enqueue(text).then(settleReady),
      change: (text) => enqueue(text),
      edits,
      commands: () => connected?.commands ?? {},
      disconnected: () => disconnected,
    },
  };
}
