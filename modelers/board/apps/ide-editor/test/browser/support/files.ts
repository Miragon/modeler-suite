/**
 * The files of a test: a repository in memory behind the port, as a host in the page builds it.
 * The one place of these tests that says how a port is made, so that a change of the files
 * package is a change here and nowhere else.
 */
import {
  connectBackend,
  createMemoryBackend,
  PICTURE_SUFFIXES,
  suffixRule,
  type BoardFiles,
  type MemoryBackend,
  type MemoryFile,
} from "@miragon/board-files";

export interface TestFiles {
  readonly backend: MemoryBackend;
  /** the port, with the ends of what the board and its host hold on it written down */
  readonly files: BoardFiles;
  /**
   * In the order it happened: `text.close <path>` (an editor closed its file), `bytes.off` (the
   * host built from the files stopped listening) and `dispose` (the port's owner ended it).
   */
  readonly log: string[];
  /** how many listeners wait for a file that moves, at this moment */
  movedListeners(): number;
}

export function testFiles(
  repository: Readonly<Record<string, MemoryFile>>,
  editors: ReadonlyArray<{ readonly suffixes: readonly string[] }>,
): TestFiles {
  const backend = createMemoryBackend({ ...repository });
  const port = connectBackend(
    backend,
    suffixRule({
      models: editors.flatMap((entry) => entry.suffixes),
      pictures: PICTURE_SUFFIXES,
    }),
  );
  const log: string[] = [];
  let movedListeners = 0;
  const files: BoardFiles = {
    ...port,
    onMoved(listener) {
      const off = port.onMoved(listener);
      movedListeners++;
      let listening = true;
      return () => {
        if (listening) movedListeners--;
        listening = false;
        off();
      };
    },
    async openText(path) {
      const session = await port.openText(path);
      return {
        ...session,
        close() {
          log.push(`text.close ${path}`);
          session.close();
        },
      };
    },
    onBytesChanged(listener) {
      const off = port.onBytesChanged(listener);
      return () => {
        log.push("bytes.off");
        off();
      };
    },
    dispose() {
      log.push("dispose");
      port.dispose();
    },
  };
  return { backend, files, log, movedListeners: () => movedListeners };
}
