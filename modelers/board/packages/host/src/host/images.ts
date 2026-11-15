/**
 * The images of a board host, from the files of a repository. The board reads an image while it
 * renders, so the bytes are loaded when a node first asks and kept: the same Blob for a path
 * until `onChange` told of another.
 */
import type { BoardFiles } from "@miragon/board-files";
import type { BoardImages } from "@miragon/board-renderer";

interface Known {
  blob: Blob | undefined;
  /** counts the loads of this path: only the answer of the last one is taken */
  load: number;
}

export function imagesFrom(files: BoardFiles): BoardImages & { dispose(): void } {
  const known = new Map<string, Known>();
  const listeners = new Set<() => void>();
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const load = (path: string): void => {
    const entry = known.get(path) ?? { blob: undefined, load: 0 };
    known.set(path, entry);
    const mine = ++entry.load;
    const take = (blob: Blob | undefined): void => {
      if (entry.load !== mine || entry.blob === blob) return;
      entry.blob = blob;
      tell();
    };
    files.readBytes(path).then(take, () => take(undefined));
  };
  const offBytes = files.onBytesChanged((paths) => {
    for (const path of paths) if (known.has(path)) load(path);
  });
  let taken = new Set<string>();
  let takenFrom: readonly string[] | undefined;
  return {
    read(path) {
      const entry = known.get(path);
      if (!entry && path !== "") load(path);
      return entry?.blob;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    taken(path) {
      const paths = files.paths();
      if (paths !== takenFrom) {
        takenFrom = paths;
        taken = new Set(paths);
      }
      return taken.has(path) || known.get(path)?.blob !== undefined;
    },
    ...(files.createFile
      ? {
          async store(path: string, bytes: Blob) {
            await files.createFile?.(path, bytes);
            // the node that is written next reads the bytes at once
            const entry = known.get(path) ?? { blob: undefined, load: 0 };
            known.set(path, entry);
            entry.load += 1;
            entry.blob = bytes;
            tell();
          },
        }
      : {}),
    dispose() {
      offBytes();
      // a load that ends later tells nobody
      listeners.clear();
    },
  };
}
