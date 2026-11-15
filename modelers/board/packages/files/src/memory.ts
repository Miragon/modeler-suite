/**
 * A backend in memory: the web app's example repository, and every test's double. It checks no
 * path: behind `serveFiles` and `connectBackend` every path it sees was checked.
 */
import type { FileMove } from "./port.js";
import type { FilesBackend } from "./server.js";

/** a text file is its text, any other file its bytes */
export type MemoryFile = string | { bytes: Uint8Array; mime: string };

export interface MemoryBackend extends FilesBackend {
  /** a change from outside: another program, Git, the file's own editor; it makes a file too */
  outside(path: string, text: string): void;
  remove(path: string): void;
  /** the file leaves `from`, whose readers hear that it is gone, and replaces what `to` held */
  move(from: string, to: string): void;
  textOf(path: string): string | undefined;
  /**
   * Every text a reader wrote, in order: a log for tests. It grows with every write, so whoever
   * keeps a backend for long empties it (`writes.length = 0`).
   */
  readonly writes: Array<{ path: string; text: string }>;
}

/** one open text's ears */
interface TextReader {
  readonly change: Set<(text: string) => void>;
  readonly gone: Set<() => void>;
}

export function createMemoryBackend(files: Record<string, MemoryFile>): MemoryBackend {
  const store = new Map(Object.entries(files));
  const listListeners = new Set<() => void>();
  const bytesListeners = new Set<(paths: readonly string[]) => void>();
  const moveListeners = new Set<(moves: readonly FileMove[]) => void>();
  const textReaders = new Map<string, Set<TextReader>>();
  const writes: Array<{ path: string; text: string }> = [];
  let listed: readonly string[] | undefined;
  const tellList = (): void => {
    listed = undefined;
    for (const listener of [...listListeners]) listener();
  };
  const tellChange = (path: string, text: string, except?: TextReader): void => {
    for (const reader of [...(textReaders.get(path) ?? [])]) {
      if (reader !== except) for (const listener of [...reader.change]) listener(text);
    }
  };
  const tellGone = (path: string): void => {
    for (const reader of [...(textReaders.get(path) ?? [])]) {
      for (const listener of [...reader.gone]) listener();
    }
  };
  return {
    writes,
    list: () => (listed ??= Object.freeze([...store.keys()].sort())),
    onListChanged(listener) {
      listListeners.add(listener);
      return () => void listListeners.delete(listener);
    },
    async openText(path) {
      const now = store.get(path);
      if (typeof now !== "string") throw new Error(`${path} is no text file of this repository`);
      const own: TextReader = { change: new Set(), gone: new Set() };
      const readers = textReaders.get(path) ?? new Set();
      readers.add(own);
      textReaders.set(path, readers);
      return {
        readOnly: false,
        text: () => {
          const value = store.get(path);
          return typeof value === "string" ? value : "";
        },
        async write(text, base) {
          // gone, or changed since the text this write was made on
          if (store.get(path) !== base) return false;
          store.set(path, text);
          writes.push({ path, text });
          tellChange(path, text, own);
          return true;
        },
        onChange(listener) {
          own.change.add(listener);
          return () => void own.change.delete(listener);
        },
        onGone(listener) {
          own.gone.add(listener);
          return () => void own.gone.delete(listener);
        },
        close: () => void readers.delete(own),
      };
    },
    async readBytes(path) {
      const value = store.get(path);
      return value === undefined || typeof value === "string" ? undefined : value;
    },
    async createFile(path, bytes, mime) {
      if (store.has(path)) throw new Error(`${path} exists already`);
      store.set(path, { bytes, mime });
      tellList();
      for (const listener of [...bytesListeners]) listener([path]);
    },
    onBytesChanged(listener) {
      bytesListeners.add(listener);
      return () => void bytesListeners.delete(listener);
    },
    onMoved(listener) {
      moveListeners.add(listener);
      return () => void moveListeners.delete(listener);
    },
    outside(path, text) {
      const fresh = !store.has(path);
      store.set(path, text);
      if (fresh) tellList();
      tellChange(path, text);
    },
    remove(path) {
      if (!store.delete(path)) return;
      tellList();
      tellGone(path);
    },
    move(from, to) {
      const value = store.get(from);
      if (value === undefined || from === to) return;
      store.delete(from);
      store.set(to, value);
      tellList();
      for (const listener of [...moveListeners]) listener([{ from, to }]);
      // After the move was told: a page hears of the move first, so a reader that follows it is
      // on the new path before it could show that its file is gone.
      tellGone(from);
      if (typeof value === "string") tellChange(to, value);
    },
    textOf(path) {
      const value = store.get(path);
      return typeof value === "string" ? value : undefined;
    },
  };
}
