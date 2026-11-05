/**
 * The frozen `window.orca` of an Orca custom editor frame (plugin API 1), as far as the shell uses
 * it. Orca ships no typings a package can depend on, so the shapes are structural.
 */

export interface OrcaDisposable {
  dispose(): void;
}

/** The three-way merge Orca calls with `(base, outside, mine)`; throws to keep Orca's banner. */
export type OrcaTextMerge = (
  lastSyncedText: string,
  externalText: string,
  draftText: string,
) => string;

export interface OrcaSessionOptions {
  merge?: OrcaTextMerge | undefined;
  debounceMs?: number | undefined;
}

/** `orca.document.session()`: Orca's document sync for a text editor. */
export interface OrcaDocumentSession {
  /** The latest text, including changes Orca has not accepted yet. */
  readonly value: string;
  /** An agent transcript or a remote file the person may not change. */
  readonly readOnly: boolean;
  /** The file changed outside the editor, or a merge produced a new text. */
  onReplace(callback: (value: string) => void): OrcaDisposable;
  /** A no-op while `readOnly`. */
  change(value: string): void;
  /** Sends the pending change now; rejects with the refusal's code. */
  flush(): Promise<void>;
  dispose(): void;
}

export interface OrcaTheme {
  readonly colorScheme: string;
}

export interface OrcaSaveAsRequest {
  suggestedName: string;
  mimeType: string;
  data: string | ArrayBuffer;
}

export interface OrcaSaveAsResult {
  readonly status: "saved" | "cancelled";
}

export interface OrcaEditorApi {
  readonly document?: {
    session?(options?: OrcaSessionOptions): Promise<OrcaDocumentSession>;
  };
  /** Desktop app only, and only within a few seconds of a click or key press in the frame. */
  readonly files?: { saveAs(request: OrcaSaveAsRequest): Promise<OrcaSaveAsResult> };
  /** Desktop app only, after a click or key press; Orca asks before a host it has not allowed. */
  readonly shell?: { openExternal(url: string): Promise<{ readonly opened: boolean }> };
  on(event: "theme", callback: (theme: OrcaTheme) => void): OrcaDisposable;
}

declare const orca: OrcaEditorApi | undefined;

/** `window.orca` of an editor frame that has `document.session` (Orca 1.4.246 and later). */
export function orcaEditorApi(): OrcaEditorApi & {
  readonly document: { session(options?: OrcaSessionOptions): Promise<OrcaDocumentSession> };
} {
  if (typeof orca === "undefined" || typeof orca.document?.session !== "function") {
    throw new Error(
      "@miragon/modeler-shell: this page does not run as an Orca custom editor with document.session",
    );
  }
  return orca as ReturnType<typeof orcaEditorApi>;
}
