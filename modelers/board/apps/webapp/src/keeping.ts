import type { BackendText, FilesBackend, MemoryBackend } from "@miragon/board-files";
import type { AppStorage } from "./storage.js";

/** The repository in memory, with every write that it took kept in the browser as well. */
export function keeping(
  memory: MemoryBackend,
  kept: AppStorage,
  saved: (taken: boolean) => void,
): FilesBackend {
  const keepingText = (path: string, text: BackendText): BackendText => ({
    get readOnly() {
      return text.readOnly;
    },
    text: () => text.text(),
    async write(next) {
      const written = await text.write(next);
      // The backend logs every text it took, for tests. Nothing reads the log here, and a page
      // that stays open would hold every version of every model.
      memory.writes.length = 0;
      if (written) saved(kept.keepText(path, next));
      return written;
    },
    onChange: (listener) => text.onChange(listener),
    onGone: (listener) => text.onGone(listener),
    close: () => text.close(),
  });
  return {
    list: () => memory.list(),
    onListChanged: (listener) => memory.onListChanged(listener),
    openText: async (path) => keepingText(path, await memory.openText(path)),
    readBytes: (path) => memory.readBytes(path),
    async createFile(path, bytes, mime) {
      await memory.createFile(path, bytes, mime);
      saved(kept.keepBytes(path, bytes, mime));
    },
    onBytesChanged: (listener) => memory.onBytesChanged(listener),
    onMoved: (listener) => memory.onMoved(listener),
  };
}
