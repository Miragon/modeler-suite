/**
 * An IDE host of the test's own around the shell's real `mountShell`, in the IDE column, and a
 * document the test drives. Its document keeps the rules of the shell's own sync: the texts are
 * imported one after the other, and a change of the canvas is an edit only after the first
 * import, while the editor may write, and when the text differs from the one shown last.
 */
import { mountShell, type ShellHandle } from "@miragon/modeler-shell";
import type { IdeDocumentOptions, IdeEditorHost } from "@miragon/modeler-shell/ide";
import type { BoardEditorHost } from "../../../src/board-editor.js";

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

/** The place a host keeps an editor's state in, as VS Code keeps a webview's. */
export interface TestState {
  /** what is kept now, by key */
  readonly values: Readonly<Record<string, unknown>>;
  /** every write the editor made, in order */
  readonly writes: ReadonlyArray<readonly [key: string, value: unknown]>;
}

export interface TestHost {
  readonly host: IdeEditorHost;
  readonly document: TestDocument;
  readonly state: TestState;
}

export interface TestHostOptions {
  /** true for a host without a history of its own (Orca): the canvas binds the undo keys */
  canvasOwnsHistory?: boolean | undefined;
  /** the host opened the document read only */
  readOnly?: boolean | undefined;
  /** the host cannot connect the document: `connectDocument` rejects with this message */
  connectFails?: string | undefined;
  /** what the host kept of the page before this one, by key */
  kept?: Readonly<Record<string, unknown>> | undefined;
}

export function testHost(options: TestHostOptions = {}): TestHost {
  const edits: string[] = [];
  const values: Record<string, unknown> = { ...options.kept };
  const writes: Array<readonly [string, unknown]> = [];
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
      read: (key) => values[key],
      write(key, value) {
        // as a webview's state: a copy, which the editor cannot change afterwards
        values[key] = structuredClone(value);
        writes.push([key, values[key]]);
      },
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
    state: { values, writes },
    document: {
      open: (text) => enqueue(text).then(settleReady),
      change: (text) => enqueue(text),
      edits,
      commands: () => connected?.commands ?? {},
      disconnected: () => disconnected,
    },
  };
}

export interface TestWebHost {
  /** The three members every web app brings; this one keeps no view. */
  readonly host: BoardEditorHost;
  readonly document: TestDocument;
}

/** The Miragon mark of the start screen: a picture a test page can load without a server. */
const MARK = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>',
)}`;

/**
 * A web app's host around the same document: the shell's real `mountShell` in the web column,
 * with a legal line and a start screen, which is shown from the mount on where `startScreen` is
 * true. The canvas keeps its own history, as in a page that has no other.
 */
export function testWebHost(options: { startScreen?: boolean | undefined } = {}): TestWebHost {
  const ide = testHost({ canvasOwnsHistory: true });
  return {
    document: ide.document,
    host: {
      canvasOwnsHistory: true,
      connectDocument: ide.host.connectDocument,
      mountShell(root, shellOptions): ShellHandle {
        const shell = mountShell(root, {
          ...shellOptions,
          host: "web",
          lang: "en",
          platform: "other",
          legal: { links: [{ label: "GitHub", href: "https://github.com/Miragon/modeler-suite" }] },
          emptyState: {
            title: "Board Modeler",
            text: "Start a new board, or explore the example.",
            komet: MARK,
            onNewDiagram: () => undefined,
          },
        });
        if (options.startScreen === true) shell.setEmptyState(true);
        return shell;
      },
    },
  };
}
