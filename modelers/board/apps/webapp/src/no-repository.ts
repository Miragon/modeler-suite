/**
 * The files of a board that has none: one that was opened from a single file, or made new. A
 * `.board` file stores where a file of its repository sits and never what is in it, and the page
 * was handed the board alone. So the backend lists nothing, and says why to whoever asks for a
 * file: the host package shows a refused model's reason in its node, and the board a refused
 * picture's in a notice.
 */
import type { FilesBackend } from "@miragon/board-files";

/** In a model node, behind the host package's "This file could not be opened." */
export const NO_MODEL =
  "This board was opened as a single file. Its models are files of the repository it came from, and this page has only the board.";

/** In the board's notice, behind "<name> was not added:" */
export const NO_PICTURE =
  "this board has no repository to keep a picture in. Show the example to try pictures on a board.";

/** What the page says when the model picker of such a board is used: it has nothing to offer. */
export const NO_MODELS_TO_ADD =
  "This board has no repository behind it, so there is no model to add. Show the example to try models on a board.";

const NO_PATHS: readonly string[] = Object.freeze([]);
const never = (): (() => void) => () => undefined;

export function noRepository(): FilesBackend {
  return {
    list: () => NO_PATHS,
    onListChanged: never,
    openText: () => Promise.reject(new Error(NO_MODEL)),
    readBytes: () => Promise.resolve(undefined),
    createFile: () => Promise.reject(new Error(NO_PICTURE)),
    onBytesChanged: never,
    onMoved: never,
  };
}
