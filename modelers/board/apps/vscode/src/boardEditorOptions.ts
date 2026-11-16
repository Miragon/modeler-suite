/**
 * The board editor's options that need no `vscode` runtime, so that a test page runs the same
 * plumbing against the shell's VS Code stub: the board file itself rides on the shell's document
 * sync, and the files of the repository are served over the same panel, to messages whose type
 * starts with `board.`.
 */
import {
  isBoardMessage,
  PICTURE_SUFFIXES,
  serveFiles,
  suffixRule,
  type ClientMessage,
  type FilesBackend,
  type FilesRule,
} from "@miragon/board-files";
import type {
  ModelerEditor,
  ModelerEditorOptions,
  TextDocumentLike,
} from "@miragon/modeler-shell/vscode/extension";
import { SUITE_SUFFIXES } from "board-suite-editors/suffixes";

export const BOARD_VIEW_TYPE = "board.boardEditor";

/** the suffixes of the files a board shows as a model: those the suite's editors are made for */
export const MODEL_SUFFIXES: readonly string[] = SUITE_SUFFIXES.flatMap((entry) => entry.suffixes);

/**
 * What a board's page may reach, as the files server asks it for every path: a text only of a
 * model, bytes only of a picture.
 */
export const BOARD_FILES_RULE: FilesRule = suffixRule({
  models: MODEL_SUFFIXES,
  pictures: PICTURE_SUFFIXES,
});

/** the files of one board; `dispose` ends what the backend listens to once its editor closed */
export type BoardBackend = FilesBackend & { dispose?: (() => void) | undefined };

const NO_FILES = "this board has no files";

/** for a host that hands a board no backend: every request is answered, none is left waiting */
const noFiles: FilesBackend = {
  list: () => [],
  onListChanged: () => () => {},
  openText: () => Promise.reject(new Error(NO_FILES)),
  readBytes: () => Promise.resolve(undefined),
  createFile: () => Promise.reject(new Error(NO_FILES)),
  onBytesChanged: () => () => {},
  onMoved: () => () => {},
};

/**
 * `backendFor` is called once per editor that opens, with the board file's URI, in the call that
 * opens the editor: a backend that has to look for its files does so afterwards.
 */
export function boardEditorOptions<Document extends TextDocumentLike = TextDocumentLike>(
  backendFor: (board: Document["uri"]) => BoardBackend | undefined,
): ModelerEditorOptions<Document> {
  /** the files server of each open editor listens here for its page's messages */
  const pages = new WeakMap<ModelerEditor<Document>, Set<(message: ClientMessage) => void>>();
  return {
    viewType: BOARD_VIEW_TYPE,
    title: "Board",
    themes: ["light"],
    onDidOpen(editor) {
      const backend = backendFor(editor.document.uri);
      const listeners = new Set<(message: ClientMessage) => void>();
      pages.set(editor, listeners);
      const served = serveFiles(
        {
          post(message) {
            // A panel that went takes no message, and says so in its own way: a write that is
            // still on its way must not fail on the answer nobody waits for.
            try {
              Promise.resolve(editor.post(message)).then(undefined, () => {});
            } catch {
              // the panel is gone
            }
          },
          onMessage(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
          },
        },
        backend ?? noFiles,
        BOARD_FILES_RULE,
      );
      return {
        dispose() {
          // The server first: it closes each text after that text's last write, so what the
          // page wrote before its panel went still lands.
          served.dispose();
          pages.delete(editor);
          backend?.dispose?.();
        },
      };
    },
    onMessage(message, editor) {
      if (!isBoardMessage(message)) return;
      for (const listener of [...(pages.get(editor) ?? [])]) listener(message as ClientMessage);
    },
  };
}
