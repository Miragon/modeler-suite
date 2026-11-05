import type { DocumentImportContext } from "../../vscode/webview/index.js";
import { orcaEditorApi, type OrcaDocumentSession, type OrcaTextMerge } from "./api.js";

export interface OrcaDocumentSyncOptions {
  /** As `DocumentSyncOptions.importText`: shows `text`, `false` when the canvas refused it. */
  importText(text: string, context: DocumentImportContext): Promise<boolean>;
  /** As `DocumentSyncOptions.exportText`: the document as the canvas shows it now. */
  exportText(reconciledText: string): string;
  /** Whether the canvas may write the document; default always. */
  canWrite?: (() => boolean) | undefined;
  /**
   * The notation's three-way merge (`ModelTextMerge` of `@miragon/modeler-api`). Required: without
   * it Orca drops the user's draft when an agent writes the file during an edit, and hands no write
   * that comes in under unsaved edits to the editor.
   */
  merge: OrcaTextMerge;
  /** Called with the error when `merge` throws; Orca then keeps its Reload/Overwrite banner. */
  onMergeConflict?: ((error: unknown) => void) | undefined;
  /** Orca's quiet time before it sends a change, default 250 ms. */
  debounceMs?: number | undefined;
}

export interface OrcaDocumentSync {
  readonly session: OrcaDocumentSession;
  /** Whether Orca opened the file read-only (an agent transcript, a remote file). */
  readonly readOnly: boolean;
  /** As `DocumentSync.pushEdit`; nothing while the session is read-only. */
  readonly pushEdit: () => void;
  /** Resolves once the first text was imported or refused. */
  readonly ready: Promise<void>;
  /** Resolves once every import queued so far has settled. */
  readonly imported: () => Promise<void>;
  /** Writes `text` as the user's change and shows it, as the empty-file hint's example. */
  readonly replaceDocument: (text: string) => void;
  /** Stops listening to Orca and ends the session. */
  readonly disconnect: () => void;
}

/**
 * The Orca counterpart of `connectDocumentSync`: the session's first value is the `init`, a
 * replacement (an outside write, or the result of `merge`) an `update`, and a change on the canvas
 * goes out with `session.change`. Imports run strictly one at a time.
 */
export async function connectOrcaDocumentSync(
  options: OrcaDocumentSyncOptions,
): Promise<OrcaDocumentSync> {
  const merge: OrcaTextMerge = (lastSyncedText, externalText, draftText) => {
    try {
      return options.merge(lastSyncedText, externalText, draftText);
    } catch (error) {
      options.onMergeConflict?.(error);
      throw error;
    }
  };
  const session = await orcaEditorApi().document.session({
    merge,
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
  });
  let reconciledText = "";
  let initialized = false;
  let imports: Promise<void> = Promise.resolve();

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

  const ready = enqueue(session.value);
  const replacements = session.onReplace((text) => void enqueue(text));

  return {
    session,
    get readOnly() {
      return session.readOnly;
    },
    pushEdit: () => {
      if (!initialized || session.readOnly || (options.canWrite && !options.canWrite())) return;
      const text = options.exportText(reconciledText);
      if (text === reconciledText) return;
      reconciledText = text;
      session.change(text);
    },
    ready,
    imported: () => imports,
    replaceDocument: (text) => {
      if (session.readOnly) return;
      session.change(text);
      void enqueue(text);
    },
    disconnect: () => {
      replacements.dispose();
      session.dispose();
    },
  };
}
