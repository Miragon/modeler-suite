/**
 * The files of a VS Code workspace as the board's files server asks for them. The backend is
 * made for one board file, in the call that opens its editor: the repository root is looked for
 * after that, and until it is found the list is empty and every request waits for it.
 */
import type { BackendText, FilesBackend } from "@miragon/board-files";
import { suffixRule } from "@miragon/board-files";

import { createPicture, readPicture } from "./bytes.js";
import { openDocumentText, type DocumentText } from "./documents.js";
import {
  createIndexPool,
  type FileEvent,
  type FileIndex,
  type IndexPool,
  type IndexSuffixes,
} from "./file-index.js";
import { fileAt, findRoot } from "./root.js";
import type { BoardUriLike, BoardVsCodeLike } from "./vscode-like.js";

/** shown by a node behind "This file could not be opened.", and by the board's notice for a picture */
export const NO_ROOT = "this board is in no repository and in no open folder, so it has no files";

export interface VsCodeBackendOptions<Uri> {
  /** the board file: the root of every path is its repository's */
  readonly board: Uri;
  /** what a board lists: the suffixes of the editors it has, and of the pictures it draws */
  readonly suffixes: IndexSuffixes;
  /** the extension's indexes, one per root for every board of it; without, one of its own */
  readonly indexes?: IndexPool<Uri> | undefined;
}

export interface VsCodeBackend extends FilesBackend {
  /** settles once the root was looked for and, where there is one, its files were searched */
  ready(): Promise<void>;
  /**
   * Ends what the backend listens to. A text stays as it is until the server closed it, which it
   * does after the text's last write: an edit that reached the host lands though its panel went.
   */
  dispose(): void;
}

/** the root of the moment and its index */
interface Rooted<Uri> {
  readonly root: Uri;
  readonly index: FileIndex;
  release(): void;
}

const NONE: readonly string[] = Object.freeze([]);
const keyOf = (uri: BoardUriLike | undefined): string => uri?.toString() ?? "";

export function createVsCodeBackend<Uri extends BoardUriLike>(
  vscode: BoardVsCodeLike<Uri>,
  options: VsCodeBackendOptions<Uri>,
): VsCodeBackend {
  const pool = options.indexes ?? createIndexPool(vscode, options.suffixes);
  const rule = suffixRule(options.suffixes);
  const listListeners = new Set<() => void>();
  const bytesListeners = new Set<(paths: readonly string[]) => void>();
  /** the open texts by path: one per page that has the path open */
  const texts = new Map<string, Set<DocumentText<Uri>>>();
  let rooted: Rooted<Uri> | undefined;
  let lookups = 0;
  let disposed = false;

  const tellList = (): void => {
    for (const listener of [...listListeners]) listener();
  };
  const onFile = (path: string, event: FileEvent): void => {
    for (const text of [...(texts.get(path) ?? [])]) text.file(event);
    if (!rule.picture(path)) return;
    for (const listener of [...bytesListeners]) listener([path]);
  };

  /** the root is another one, or none: every path names another file from now on */
  function settle(root: Uri | undefined): void {
    if (keyOf(root) === keyOf(rooted?.root)) return;
    const before = rooted?.index.list() ?? NONE;
    rooted?.release();
    rooted = undefined;
    if (root) {
      const { index, release } = pool.acquire(root);
      const stops = [index.onListChanged(tellList), index.onFile(onFile)];
      rooted = {
        root,
        index,
        release() {
          for (const stop of stops) stop();
          release();
        },
      };
    }
    for (const [path, readers] of texts) {
      for (const text of [...readers]) text.moved(root ? fileAt(vscode, root, path) : undefined);
    }
    // An index that still searches tells the list itself when it has one.
    const now = rooted?.index.list() ?? NONE;
    if (now.length !== before.length || now.some((path, at) => path !== before[at])) tellList();
  }

  function lookUp(): Promise<void> {
    const mine = ++lookups;
    const take = (root: Uri | undefined): void => {
      if (mine === lookups && !disposed) settle(root);
    };
    return findRoot(vscode, options.board).then(take, () => take(undefined));
  }
  let looking = lookUp();
  // A board with no `.git` above it has the folder VS Code has open for its root, and that may
  // come or go while the board is open.
  const folders = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    looking = lookUp();
  });

  function reader(path: string, text: DocumentText<Uri>): BackendText {
    const readers = texts.get(path) ?? new Set();
    readers.add(text);
    texts.set(path, readers);
    return {
      readOnly: text.readOnly,
      text: () => text.text(),
      write: (next, base) => text.write(next, base),
      onChange: (listener) => text.onChange(listener),
      onGone: (listener) => text.onGone(listener),
      close() {
        readers.delete(text);
        if (readers.size === 0 && texts.get(path) === readers) texts.delete(path);
        text.close();
      },
    };
  }

  return {
    list: () => rooted?.index.list() ?? NONE,
    onListChanged(listener) {
      listListeners.add(listener);
      return () => void listListeners.delete(listener);
    },
    async openText(path) {
      await looking;
      const at = rooted?.root;
      if (!at) throw new Error(NO_ROOT);
      const text = await openDocumentText(vscode, path, fileAt(vscode, at, path));
      const now = rooted?.root;
      // the root changed while the file was read: the text follows it like every other
      if (keyOf(now) !== keyOf(at)) text.moved(now ? fileAt(vscode, now, path) : undefined);
      return reader(path, text);
    },
    async readBytes(path) {
      await looking;
      return rooted ? readPicture(vscode, rooted.root, path) : undefined;
    },
    async createFile(path, bytes) {
      await looking;
      const at = rooted;
      if (!at) throw new Error(NO_ROOT);
      await createPicture(vscode, at.root, path, bytes);
      // listed and told at once: the watcher's word of the new file comes later, if at all
      at.index.created(path);
    },
    onBytesChanged(listener) {
      bytesListeners.add(listener);
      return () => void bytesListeners.delete(listener);
    },
    // A file that moves is a file that went and one that came in this increment.
    onMoved: () => () => {},
    async ready() {
      await looking;
      await rooted?.index.searched;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      folders.dispose();
      rooted?.release();
      rooted = undefined;
      if (!options.indexes) pool.dispose();
      listListeners.clear();
      bytesListeners.clear();
    },
  };
}
