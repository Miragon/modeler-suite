/**
 * The parts of the `vscode` namespace the files of a workspace are kept with, typed structurally:
 * the backend never imports `vscode`, so it runs against the fake in `memory-vscode.ts` in a unit
 * test and in a test page. The extension passes its own `import * as vscode from "vscode"`.
 *
 * Only `workspace.fs`, `findFiles`, the watcher, the text documents and URIs: no `node:fs` and no
 * `fsPath`, so that a window on a remote machine or on a virtual file system keeps its files.
 */
import type {
  DisposableLike,
  TextDocumentChangeEventLike,
  TextDocumentLike,
  VsCodeDocumentEditLike,
} from "@miragon/modeler-shell/vscode/extension";

/** `vscode.FileType`: a link to a file is `FILE | SYMBOLIC_LINK`, the values are VS Code's API */
export const FILE = 1;
export const DIRECTORY = 2;
export const SYMBOLIC_LINK = 64;
/** `vscode.FilePermission.Readonly` */
export const READONLY = 1;

/** `vscode.Uri` as far as the files need it; `path` is decoded and has forward slashes */
export interface BoardUriLike {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  toString(): string;
  /** a URI that differs in what `change` names; a query and a fragment are kept unless named */
  with(change: { path: string; query?: string; fragment?: string }): this;
}

/** `vscode.FileStat` */
export interface FileStatLike {
  readonly type: number;
  readonly size: number;
  readonly permissions?: number | undefined;
}

/** `vscode.RelativePattern`: a glob below a folder, which need not be a workspace folder */
export interface RelativePatternLike {
  readonly pattern: string;
}

/**
 * `vscode.GlobPattern`. A plain text is a glob over the workspace folders, which the backend
 * never passes: its files are below a root that need not be one of them.
 */
export type GlobLike = string | RelativePatternLike;

/** `vscode.FileSystemWatcher` */
export interface FileWatcherLike<Uri> extends DisposableLike {
  onDidCreate(listener: (uri: Uri) => unknown): DisposableLike;
  onDidChange(listener: (uri: Uri) => unknown): DisposableLike;
  onDidDelete(listener: (uri: Uri) => unknown): DisposableLike;
}

/** `vscode.workspace` as far as the files need it, beside the edit the shell's writer applies */
export interface BoardWorkspaceLike<Uri> {
  /** the workspace folder a file is in, the innermost one */
  getWorkspaceFolder(uri: Uri): { readonly uri: Uri } | undefined;
  onDidChangeWorkspaceFolders(listener: () => unknown): DisposableLike;
  /**
   * `exclude` as a glob leaves VS Code's `files.exclude` setting in force beside it; only `null`
   * turns that off.
   */
  findFiles(include: GlobLike, exclude?: string | null): PromiseLike<Uri[]>;
  createFileSystemWatcher(pattern: GlobLike): FileWatcherLike<Uri>;
  /** what a person does to files in VS Code itself; a folder is one entry, its files are not named */
  onDidCreateFiles(
    listener: (event: { readonly files: readonly Uri[] }) => unknown,
  ): DisposableLike;
  onDidDeleteFiles(
    listener: (event: { readonly files: readonly Uri[] }) => unknown,
  ): DisposableLike;
  onDidRenameFiles(
    listener: (event: {
      readonly files: readonly { readonly oldUri: Uri; readonly newUri: Uri }[];
    }) => unknown,
  ): DisposableLike;
  /** the document VS Code has open for the file, or a new one read from the file */
  openTextDocument(uri: Uri): PromiseLike<TextDocumentLike>;
  onDidChangeTextDocument(
    listener: (event: TextDocumentChangeEventLike) => unknown,
  ): DisposableLike;
  /** VS Code let go of a document: the object is dead, and the next open makes another */
  onDidCloseTextDocument(listener: (document: TextDocumentLike) => unknown): DisposableLike;
  readonly fs: {
    /** rejects where nothing is at `uri` */
    stat(uri: Uri): PromiseLike<FileStatLike>;
    readFile(uri: Uri): PromiseLike<Uint8Array>;
    /** makes the file or replaces it: there is no write that only makes one */
    writeFile(uri: Uri, content: Uint8Array): PromiseLike<void>;
    /** with the folders above it, and without a word for a folder that is there */
    createDirectory(uri: Uri): PromiseLike<void>;
  };
}

export interface BoardVsCodeLike<
  Uri extends BoardUriLike = BoardUriLike,
> extends VsCodeDocumentEditLike {
  readonly workspace: VsCodeDocumentEditLike["workspace"] & BoardWorkspaceLike<Uri>;
  readonly Uri: { joinPath(base: Uri, ...pathSegments: string[]): Uri };
  readonly RelativePattern: new (base: Uri, pattern: string) => RelativePatternLike;
}
