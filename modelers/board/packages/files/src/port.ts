/**
 * The port: a repository's files as the page of a board asks for them. A host whose files are
 * across a channel answers it with `createFilesClient`, one whose files are in the page with
 * `connectBackend`.
 */

/** a file that has a new path, both repository-relative */
export interface FileMove {
  from: string;
  to: string;
}

/**
 * ONE text file for ONE reader. What this session writes never comes back to it; the other
 * sessions on the path hear it at once.
 */
export interface TextSession {
  readonly path: string;
  readonly readOnly: boolean;
  /** the text as the page has it now: the last one written here or told from outside */
  text(): string;
  /**
   * Nothing happens for the text the path has already, on a read-only file and on one that is
   * gone. A write the host refused comes back through `onReplace` as the text the host has.
   *
   * `base` is the text the writer made `text` from. Where the path has another text by now, the
   * write is dropped: the writer was told that text through `onReplace`, and a write over it
   * would lose it. Without `base` the write counts as made on the text the path has. A write
   * that crossed a change on its way to the host ends the same way: the host drops it, and its
   * text comes through `onReplace`.
   */
  write(text: string, base?: string | undefined): void;
  /** a change this session did not write: another session on the path, or the outside */
  onReplace(listener: (text: string) => void): () => void;
  /** the file went away (false) or is back (true); the text of one that is back follows in `onReplace` */
  onAvailable(listener: (available: boolean) => void): () => void;
  close(): void;
}

export interface BoardFiles {
  /** every path the host offers, the SAME array until `onPaths` reported a change */
  paths(): readonly string[];
  onPaths(listener: () => void): () => void;
  /**
   * Rejects with the host's message for a path it refuses or cannot read as text, and for a
   * file that went away under an earlier session and is not back.
   */
  openText(path: string): Promise<TextSession>;
  /**
   * The bytes of a file, or undefined where the host has none under the path. Rejects with the
   * host's message for a path it refuses and for a read it could not do.
   */
  readBytes(path: string): Promise<Blob | undefined>;
  /**
   * Stores a NEW file, `assets/<name>`, and rejects for any other path and for one that is in
   * use. Absent where the host stores none.
   */
  createFile?: ((path: string, bytes: Blob) => Promise<void>) | undefined;
  /** files whose bytes are new: a file that was created, or one that changed outside */
  onBytesChanged(listener: (paths: readonly string[]) => void): () => void;
  onMoved(listener: (moves: readonly FileMove[]) => void): () => void;
  /**
   * Resolves once the host has dealt with every write made before the call: each is in the place
   * that keeps the files, was refused there, or was dropped as made on an older text. Rejects
   * when the files are closed first. Whoever must have its last write in the place awaits this
   * before it disposes.
   */
  settled(): Promise<void>;
  /** ends every delivery and rejects whatever still waits for its answer */
  dispose(): void;
}
