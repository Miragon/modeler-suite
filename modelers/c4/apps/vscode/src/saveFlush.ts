import type { FlushMessage } from "./protocol.js";

/**
 * VS Code gives a save participant about 1.5 s before it skips it, and drops one that overruns
 * repeatedly; a webview that doesn't answer in time is saved without its draft instead.
 */
export const FLUSH_TIMEOUT_MS = 1000;

/** An open diagram editor, as far as a flush needs it: the shell's `ModelerEditor` fits. */
export interface FlushTarget {
  post(message: unknown): PromiseLike<boolean>;
  /** Every edit queued so far has landed or was refused. */
  written(): Promise<void>;
}

/** The `c4.flush` round trips of one editor's webview (SPEC 8.2). */
export interface WebviewFlushes {
  /**
   * Asks the webview to commit a field still being typed in. Resolves once it answered and the
   * edit it posted before its answer has landed, after `FLUSH_TIMEOUT_MS` without an answer, or at
   * once when the message was not delivered.
   */
  request(): Promise<void>;
  /** The webview's `c4.flushed`. */
  answered(id: unknown): void;
  /** The editor closed: no answer comes any more, so every waiting save goes on. */
  dispose(): void;
}

/**
 * Has no `vscode` import, so the e2e test page can run the same round trip against the shell's
 * stand-in for VS Code.
 */
export function webviewFlushes(editor: FlushTarget): WebviewFlushes {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  let disposed = false;
  return {
    request: () =>
      new Promise<void>((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        const id = nextId++;
        const finish = (): void => {
          clearTimeout(timer);
          pending.delete(id);
          resolve();
        };
        const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
        pending.set(id, finish);
        editor.post({ type: "c4.flush", id } satisfies FlushMessage).then((delivered) => {
          if (!delivered) finish();
        }, finish);
      }).then(() => editor.written()),
    answered: (id) => {
      if (typeof id === "number") pending.get(id)?.();
    },
    dispose: () => {
      disposed = true;
      for (const finish of [...pending.values()]) finish();
    },
  };
}
