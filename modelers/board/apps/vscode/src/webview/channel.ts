/**
 * The files of a board's repository over the webview's one pipe to the extension. A webview may
 * acquire VS Code's API once, and the shell's editor host does that for the board file's own
 * sync; the files protocol rides on the same pipe, its messages told apart by the `board.` their
 * types start with. Out through the API's `postMessage`, in through the editor host's
 * `onMessage`, which hands on whatever the document sync does not answer itself.
 */
import {
  isBoardMessage,
  type Channel,
  type ClientMessage,
  type HostMessage,
} from "@miragon/board-files";

/** `acquireVsCodeApi()` as far as the files post through it */
export interface PostingApi {
  postMessage(message: unknown): void;
}

export interface FilesChannel {
  /**
   * For `vsCodeEditorHost({ onMessage })`: takes a message of the files protocol and leaves
   * every other one alone.
   */
  readonly receive: (message: unknown) => void;
  /** The page's side for `createFilesClient`, posting through the API the editor host acquired. */
  over(api: PostingApi): Channel<ClientMessage, HostMessage>;
}

export function filesChannel(): FilesChannel {
  const listeners = new Set<(message: HostMessage) => void>();
  return {
    receive(message) {
      if (!isBoardMessage(message)) return;
      // a listener may unsubscribe while the others are told
      for (const listener of [...listeners]) {
        if (listeners.has(listener)) listener(message as HostMessage);
      }
    },
    over: (api) => ({
      post: (message) => api.postMessage(message),
      onMessage(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    }),
  };
}
