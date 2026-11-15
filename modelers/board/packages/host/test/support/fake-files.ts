/**
 * The files port and a text session as doubles a unit test steers by hand: nothing here answers
 * before the test says so, and every call is recorded.
 */
import type { BoardFiles, FileMove, TextSession } from "@miragon/board-files";

export interface FakeSession extends TextSession {
  /** every text the session was asked to write, in order */
  readonly writes: string[];
  closed: number;
  /** a change this session did not write: the port has the text first, then tells */
  replace(text: string): void;
  setAvailable(available: boolean): void;
}

export function fakeSession(path: string, initial: string, readOnly = false): FakeSession {
  let text = initial;
  const replaceListeners = new Set<(text: string) => void>();
  const availableListeners = new Set<(available: boolean) => void>();
  const writes: string[] = [];
  return {
    path,
    readOnly,
    writes,
    closed: 0,
    text: () => text,
    write(next) {
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
  readonly created: Array<{ path: string; bytes: Blob }>;
  /** the paths `createFile` refuses, with the message */
  readonly refusing: Map<string, string>;
  /** how many listeners the port still holds, of every kind */
  listening(): number;
  disposed: number;
}

export function fakeFiles(
  initial: readonly string[] = [],
  options: { storing?: boolean | undefined } = {},
): FakeFiles {
  let paths: readonly string[] = Object.freeze([...initial]);
  const pathListeners = new Set<() => void>();
  const bytesListeners = new Set<(paths: readonly string[]) => void>();
  const moveListeners = new Set<(moves: readonly FileMove[]) => void>();
  const pending: PendingRead[] = [];
  const reads: string[] = [];
  const created: Array<{ path: string; bytes: Blob }> = [];
  const refusing = new Map<string, string>();
  const subscribe = <Listener>(listeners: Set<Listener>, listener: Listener) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return {
    pending,
    reads,
    created,
    refusing,
    listening: () => pathListeners.size + bytesListeners.size + moveListeners.size,
    disposed: 0,
    paths: () => paths,
    onPaths: (listener) => subscribe(pathListeners, listener),
    openText: () => Promise.reject(new Error("the fake opens no text")),
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
    onBytesChanged: (listener) => subscribe(bytesListeners, listener),
    onMoved: (listener) => subscribe(moveListeners, listener),
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
}

/** lets every promise that is ready run to its end */
export const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
