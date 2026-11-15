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
}

export function testFiles(
  texts: Readonly<Record<string, string>>,
  editors: ReadonlyArray<{ readonly suffixes: readonly string[] }>,
): TestFiles {
  const backend = createMemoryBackend({ ...texts });
  const port = connectBackend(
    backend,
    suffixRule({
      models: editors.flatMap((entry) => entry.suffixes),
      pictures: PICTURE_SUFFIXES,
    }),
  );
  const log: string[] = [];
  const files: BoardFiles = {
    ...port,
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
  return { backend, files, log };
}
