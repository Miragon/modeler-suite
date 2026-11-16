/**
 * The files port and a text session as doubles a unit test steers by hand: nothing here answers
 * before the test says so, and every call is recorded.
 */
import type { BoardFiles, DropReason, FileMove, TextSession } from "@miragon/board-files";

export interface FakeSession extends TextSession {
  /** every text the session took, in order */
  readonly writes: string[];
  /** every write it dropped as made on another text than it has, as the port's session does */
  readonly dropped: Array<{ text: string; base: string }>;
  closed: number;
  /** a change this session did not write: the port has the text first, then tells */
  replace(text: string): void;
  setAvailable(available: boolean): void;
  /** the host's word that the edit this session posted last is not in the file */
  drop(reason: DropReason): void;
  /** how many listeners the session still holds, of every kind */
  listening(): number;
}

export function fakeSession(path: string, initial: string, readOnly = false): FakeSession {
  let text = initial;
  const replaceListeners = new Set<(text: string) => void>();
  const availableListeners = new Set<(available: boolean) => void>();
  const droppedListeners = new Set<(reason: DropReason) => void>();
  const writes: string[] = [];
  const dropped: FakeSession["dropped"] = [];
  const drop = (reason: DropReason): void => {
    for (const listener of [...droppedListeners]) listener(reason);
  };
  return {
    path,
    readOnly,
    writes,
    dropped,
    closed: 0,
    text: () => text,
    write(next, base) {
      if (base !== undefined && base !== text) {
        dropped.push({ text: next, base });
        drop("crossed");
        return;
      }
      text = next;
      writes.push(next);
    },
    onReplace(listener) {
      replaceListeners.add(listener);
      return () => void replaceListeners.delete(listener);
    },
    onAvailable(listener) {
      availableListeners.add(listener);
      return () => void availableListeners.delete(listener);
    },
    onDropped(listener) {
      droppedListeners.add(listener);
      return () => void droppedListeners.delete(listener);
    },
    drop,
    listening: () => replaceListeners.size + availableListeners.size + droppedListeners.size,
    close() {
      this.closed += 1;
    },
    replace(next) {
      text = next;
      for (const listener of [...replaceListeners]) listener(next);
    },
    setAvailable(available) {
      for (const listener of [...availableListeners]) listener(available);
    },
  };
}

interface PendingRead {
  path: string;
  answer(blob: Blob | undefined): void;
  fail(error: Error): void;
}

export interface FakeFiles extends BoardFiles {
  /** a new list, as the port hands one out after a change */
  setPaths(paths: readonly string[]): void;
  tellBytesChanged(paths: readonly string[]): void;
  tellMoved(moves: readonly FileMove[]): void;
  /** the reads nobody has answered yet, oldest first */
  readonly pending: PendingRead[];
  /** every path `readBytes` was asked for, in order */
  readonly reads: string[];
  /** every path `openText` was asked for, in order; the fake refuses each it has no session for */
  readonly opens: string[];
  /** the sessions `openText` hands out, by path */
  readonly sessions: Map<string, TextSession>;
  /** every path `showFile` was asked for, in order */
  readonly shown: string[];
  /** the paths `showFile` refuses, with the message */
  readonly unshowable: Map<string, string>;
  /** what `showsFiles()` answers: undefined until the host said */
  shows: boolean | undefined;
  readonly created: Array<{ path: string; bytes: Blob }>;
  /** the paths `createFile` refuses, with the message */
  readonly refusing: Map<string, string>;
  /** how many listeners the port still holds, of every kind */
  listening(): number;
  disposed: number;
}

export function fakeFiles(
  initial: readonly string[] = [],
  options: {
    storing?: boolean | undefined;
    /** false: a port that could never show a file, without the two members */
    showing?: boolean | undefined;
  } = {},
): FakeFiles {
  let paths: readonly string[] = Object.freeze([...initial]);
  const pathListeners = new Set<() => void>();
  const bytesListeners = new Set<(paths: readonly string[]) => void>();
  const moveListeners = new Set<(moves: readonly FileMove[]) => void>();
  const pending: PendingRead[] = [];
  const reads: string[] = [];
  const opens: string[] = [];
  const created: Array<{ path: string; bytes: Blob }> = [];
  const refusing = new Map<string, string>();
  const sessions = new Map<string, TextSession>();
  const shown: string[] = [];
  const unshowable = new Map<string, string>();
  const subscribe = <Listener>(listeners: Set<Listener>, listener: Listener) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const fake: FakeFiles = {
    pending,
    reads,
    opens,
    sessions,
    shown,
    unshowable,
    shows: true,
    created,
    refusing,
    listening: () => pathListeners.size + bytesListeners.size + moveListeners.size,
    disposed: 0,
    paths: () => paths,
    onPaths: (listener) => subscribe(pathListeners, listener),
    openText(path) {
      opens.push(path);
      const session = sessions.get(path);
      return session
        ? Promise.resolve(session)
        : Promise.reject(new Error("the fake opens no text"));
    },
    readBytes(path) {
      reads.push(path);
      return new Promise((resolve, reject) => {
        pending.push({ path, answer: resolve, fail: reject });
      });
    },
    ...(options.storing === false
      ? {}
      : {
          async createFile(path: string, bytes: Blob) {
            const refusal = refusing.get(path);
            if (refusal !== undefined) throw new Error(refusal);
            created.push({ path, bytes });
          },
        }),
    ...(options.showing === false
      ? {}
      : {
          async showFile(path: string) {
            shown.push(path);
            const refusal = unshowable.get(path);
            if (refusal !== undefined) throw new Error(refusal);
          },
          showsFiles: () => fake.shows,
        }),
    onBytesChanged: (listener) => subscribe(bytesListeners, listener),
    onMoved: (listener) => subscribe(moveListeners, listener),
    settled: () => Promise.resolve(),
    dispose() {
      this.disposed += 1;
    },
    setPaths(next) {
      paths = Object.freeze([...next]);
      for (const listener of [...pathListeners]) listener();
    },
    tellBytesChanged(changed) {
      for (const listener of [...bytesListeners]) listener(changed);
    },
    tellMoved(moves) {
      for (const listener of [...moveListeners]) listener(moves);
    },
  };
  return fake;
}

/** lets every promise that is ready run to its end */
export const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
