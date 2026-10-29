import {
  isAppearanceMessage,
  isTypedMessage,
  type DocumentWebviewMessage,
  type ProblemCounts,
  type TypedMessage,
} from "../protocol.js";

/** `acquireVsCodeApi()` as far as the document sync posts through it. */
export interface DocumentSyncApi {
  postMessage(message: unknown): void;
}

export interface DocumentImportContext {
  /** The `init` text, the first one this webview shows. */
  first: boolean;
  /** The text the canvas showed last, "" before the first import. */
  reconciledText: string;
}

export interface DocumentSyncOptions {
  /** The webview's `acquireVsCodeApi()`, which the modeler acquires once. */
  api: DocumentSyncApi;
  /**
   * Shows the document's `text` on the canvas: imports it, or leaves the canvas alone when it
   * already shows that document (only formatting differs, as after `insertFinalNewline` on a save).
   * Resolves to `false` when the canvas refused the text, which it then shows as invalid and
   * read-only; the next update is imported again. Never runs twice at once.
   */
  importText(text: string, context: DocumentImportContext): Promise<boolean>;
  /**
   * The document as the canvas shows it now, written from the text it showed last (a modeler may
   * keep that text's comments and order, as Wardley's `patchDSL` does).
   */
  exportText(reconciledText: string): string;
  /** Whether the canvas may write the document; default always. `false` while it is read-only. */
  canWrite?: (() => boolean) | undefined;
  /** The pill's counts, from the extension's diagnostics. */
  onProblems?: ((counts: ProblemCounts) => void) | undefined;
  /** Command Palette and editor title commands for this editor, by name. */
  commands?: Readonly<Record<string, () => unknown>> | undefined;
  /** The extension's messages the sync does not handle itself (the shell's appearance excluded). */
  onMessage?: ((message: TypedMessage) => void) | undefined;
}

export interface DocumentSync {
  /**
   * A change on the canvas: posts the document as an `edit` when it differs from the text the
   * canvas showed last. Nothing before the first import, which the canvas does not show yet, nor
   * while `canWrite()` is false: the canvas then shows the last valid text, and an edit would
   * overwrite the text the user is fixing.
   */
  readonly pushEdit: () => void;
  /** Resolves once the first `init` text was imported or refused. */
  readonly ready: Promise<void>;
  /** Resolves once every import queued so far has settled. */
  readonly imported: () => Promise<void>;
  /** The problems pill's `onActivate`: opens the Problems view. */
  readonly showProblems: () => void;
  /** The empty-file hint's `onInsertExample`. */
  readonly insertExample: () => void;
  /** Posts to the extension: the shared messages or the modeler's own. */
  readonly post: (message: DocumentWebviewMessage | TypedMessage) => void;
  /** Stops listening to the extension. */
  readonly disconnect: () => void;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * The webview's half of `registerModelerEditor`: answers `init` and `update` with strictly
 * serialised imports (two quick undos must not import concurrently and finish in the wrong
 * order), posts the canvas's changes as `edit`s, hands `problems` and `command` to the modeler and
 * posts `ready` once connected. Connect it once the modeler can import; the extension answers
 * `ready` in a later task.
 */
export function connectDocumentSync(options: DocumentSyncOptions): DocumentSync {
  const { api } = options;
  let reconciledText = "";
  let initialized = false;
  let imports: Promise<void> = Promise.resolve();
  let settleReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => (settleReady = resolve));

  async function show(text: string): Promise<void> {
    const first = !initialized;
    try {
      if (await options.importText(text, { first, reconciledText })) reconciledText = text;
    } finally {
      initialized = true;
    }
  }

  function enqueue(text: string): Promise<void> {
    imports = imports
      .then(() => show(text))
      .catch((error: unknown) => console.error("@miragon/modeler-shell: import failed", error));
    return imports;
  }

  const post = (message: DocumentWebviewMessage | TypedMessage): void => api.postMessage(message);

  const listener = (event: MessageEvent<unknown>): void => {
    const message = event.data;
    if (!isTypedMessage(message) || isAppearanceMessage(message)) return;
    switch (message.type) {
      case "init":
        if (typeof message.text === "string") void enqueue(message.text).then(settleReady);
        return;
      case "update":
        if (typeof message.text === "string") void enqueue(message.text);
        return;
      case "problems":
        if (isCount(message.count) && isCount(message.errors)) {
          options.onProblems?.({ count: message.count, errors: message.errors });
        }
        return;
      case "command": {
        const { commands } = options;
        // Own entries only: a name such as "constructor" must not reach Object.prototype.
        if (typeof message.name === "string" && commands && Object.hasOwn(commands, message.name)) {
          commands[message.name]?.();
        }
        return;
      }
      default:
        options.onMessage?.(message);
    }
  };
  window.addEventListener("message", listener);
  post({ type: "ready" });

  return {
    pushEdit: () => {
      if (!initialized || (options.canWrite && !options.canWrite())) return;
      const text = options.exportText(reconciledText);
      if (text === reconciledText) return;
      reconciledText = text;
      post({ type: "edit", text });
    },
    ready,
    imported: () => imports,
    showProblems: () => post({ type: "showProblems" }),
    insertExample: () => post({ type: "insertExample" }),
    post,
    disconnect: () => window.removeEventListener("message", listener),
  };
}
