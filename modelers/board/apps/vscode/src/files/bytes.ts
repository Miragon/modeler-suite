/**
 * The pictures of a repository: read as bytes, and a new one stored under `assets/`. Through
 * `workspace.fs` alone, so that a remote window keeps its files.
 */
import { NEW_FILE_LIMIT_BYTES } from "@miragon/board-files";

import { behindLink, fileAt } from "./root.js";
import {
  DIRECTORY,
  FILE,
  SYMBOLIC_LINK,
  type BoardUriLike,
  type BoardVsCodeLike,
  type FileStatLike,
} from "./vscode-like.js";

/** the largest picture a board reads: its own limit for a picture, which is also a new file's */
export const BYTES_LIMIT_BYTES = NEW_FILE_LIMIT_BYTES;

type BytesVsCodeLike<Uri extends BoardUriLike> = Pick<BoardVsCodeLike<Uri>, "Uri"> & {
  readonly workspace: { readonly fs: BoardVsCodeLike<Uri>["workspace"]["fs"] };
};

/** by the end of the name, as the board's rule of what a picture is reads it */
const MIME_BY_SUFFIX: ReadonlyArray<readonly [suffix: string, mime: string]> = [
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
];

export function mimeOf(path: string): string {
  const name = path.toLowerCase();
  return MIME_BY_SUFFIX.find(([suffix]) => name.endsWith(suffix))?.[1] ?? "";
}

/** what is at `uri`, undefined for nothing */
function statOf<Uri extends BoardUriLike>(
  vscode: BytesVsCodeLike<Uri>,
  uri: Uri,
): Promise<FileStatLike | undefined> {
  return Promise.resolve(vscode.workspace.fs.stat(uri)).catch(() => undefined);
}

const megabytes = (bytes: number): number => bytes / 1024 / 1024;

/**
 * The bytes of the picture at `path`, undefined where there is no such file. Rejects, with a
 * message the page is told, for a link, for a file behind a linked folder and for a file above
 * the limit: none of them is read.
 */
export async function readPicture<Uri extends BoardUriLike>(
  vscode: BytesVsCodeLike<Uri>,
  root: Uri,
  path: string,
): Promise<{ bytes: Uint8Array; mime: string } | undefined> {
  const uri = fileAt(vscode, root, path);
  if (await behindLink(vscode, uri, path)) {
    throw new Error(`${path} is behind a link, and a board reads no link`);
  }
  const stat = await statOf(vscode, uri);
  if (!stat) return undefined;
  if ((stat.type & SYMBOLIC_LINK) !== 0) {
    throw new Error(`${path} is a link, and a board reads no link`);
  }
  if ((stat.type & FILE) === 0) return undefined;
  if (stat.size > BYTES_LIMIT_BYTES) {
    throw new Error(`${path} is larger than ${megabytes(BYTES_LIMIT_BYTES)} MiB`);
  }
  return { bytes: await vscode.workspace.fs.readFile(uri), mime: mimeOf(path) };
}

/**
 * Stores a NEW file at `path`, which the server took as `assets/<name>`. It looks first and
 * never replaces a file, and it does not write through an `assets` that is a link, which could
 * lead out of the repository. `workspace.fs` has no write that only makes a file: a file another
 * program makes between the look and the write is replaced.
 */
export async function createPicture<Uri extends BoardUriLike>(
  vscode: BytesVsCodeLike<Uri>,
  root: Uri,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const folder = fileAt(vscode, root, "assets");
  const folderStat = await statOf(vscode, folder);
  if (folderStat && (folderStat.type & SYMBOLIC_LINK) !== 0) {
    throw new Error("assets is a link, and a board stores nothing through a link");
  }
  if (folderStat && (folderStat.type & DIRECTORY) === 0) {
    throw new Error("assets is a file, so a new picture has no folder");
  }
  const uri = fileAt(vscode, root, path);
  if (await statOf(vscode, uri)) throw new Error(`${path} exists already`);
  if (!folderStat) await vscode.workspace.fs.createDirectory(folder);
  await vscode.workspace.fs.writeFile(uri, bytes);
}
