/**
 * The repository root of a board file. A node stores a path from that root, and designIQ reads
 * the same board against the repository's root, so the folder VS Code has open is only the
 * second choice: the nearest folder above the board that holds `.git` comes first.
 */
import { SYMBOLIC_LINK, type BoardUriLike, type BoardVsCodeLike } from "./vscode-like.js";

type RootVsCodeLike<Uri extends BoardUriLike> = {
  readonly workspace: {
    getWorkspaceFolder: BoardVsCodeLike<Uri>["workspace"]["getWorkspaceFolder"];
    readonly fs: Pick<BoardVsCodeLike<Uri>["workspace"]["fs"], "stat">;
  };
  readonly Uri: BoardVsCodeLike<Uri>["Uri"];
};

/** the folders above a file, the nearest first; none for a path that is not absolute */
export function foldersAbove(path: string): string[] {
  if (!path.startsWith("/")) return [];
  const folders: string[] = [];
  for (let end = path.lastIndexOf("/"); end > 0; end = path.lastIndexOf("/", end - 1)) {
    folders.push(path.slice(0, end));
  }
  folders.push("/");
  return folders;
}

/** a folder's path without the slash at its end, which a workspace folder may carry */
function withoutEndSlash<Uri extends BoardUriLike>(folder: Uri): Uri {
  const { path } = folder;
  return path.length > 1 && path.endsWith("/") ? folder.with({ path: path.slice(0, -1) }) : folder;
}

/**
 * The nearest folder above `board` with a `.git` in it (a folder, or the file a worktree and a
 * submodule have), else the workspace folder the board is in, else none: a board that was opened
 * as a single file outside every repository reaches no file.
 */
export async function findRoot<Uri extends BoardUriLike>(
  vscode: RootVsCodeLike<Uri>,
  board: Uri,
): Promise<Uri | undefined> {
  for (const folder of foldersAbove(board.path)) {
    // Without the board's query and fragment: a board that Git shows from its history carries
    // the revision there, and a folder asked with it would be answered for the board itself.
    const candidate = board.with({ path: folder, query: "", fragment: "" });
    const found = await Promise.resolve(
      vscode.workspace.fs.stat(vscode.Uri.joinPath(candidate, ".git")),
    ).then(
      () => true,
      () => false,
    );
    if (found) return candidate;
  }
  const folder = vscode.workspace.getWorkspaceFolder(board);
  return folder ? withoutEndSlash(folder.uri) : undefined;
}

/**
 * The path of `uri` from `root` with forward slashes, undefined for a file that is not below it.
 * Compared as text: a file system that folds case may name one file in two ways, and the second
 * is then not below the root.
 */
export function pathBelow(root: BoardUriLike, uri: BoardUriLike): string | undefined {
  if (uri.scheme !== root.scheme || uri.authority !== root.authority) return undefined;
  const base = root.path.endsWith("/") ? root.path : `${root.path}/`;
  if (!uri.path.startsWith(base) || uri.path.length === base.length) return undefined;
  return uri.path.slice(base.length);
}

/**
 * Whether a folder between the root and `file` is a link. `stat` names an entry itself and never
 * the way to it: a file behind a linked folder is a plain file to it, though the link may lead
 * out of the repository. So every folder on the way is asked on its own, the outermost first.
 * `file` is `fileAt(root, path)`, which is how the folders are counted. A folder that is not
 * there says nothing here: the file's own check then says that it does not exist.
 */
export async function behindLink<Uri extends BoardUriLike>(
  vscode: {
    readonly workspace: { readonly fs: Pick<BoardVsCodeLike<Uri>["workspace"]["fs"], "stat"> };
  },
  file: Uri,
  path: string,
): Promise<boolean> {
  const depth = path.split("/").length - 1;
  const folders = foldersAbove(file.path).slice(0, depth).reverse();
  // a URI that does not name the folders its path has: its way cannot be asked, so it is not taken
  if (folders.length < depth) return true;
  for (const folder of folders) {
    const stat = await Promise.resolve(vscode.workspace.fs.stat(file.with({ path: folder }))).catch(
      () => undefined,
    );
    if (stat && (stat.type & SYMBOLIC_LINK) !== 0) return true;
  }
  return false;
}

/** the file a repository-relative path names; the path went through the server's checks */
export function fileAt<Uri extends BoardUriLike>(
  vscode: Pick<BoardVsCodeLike<Uri>, "Uri">,
  root: Uri,
  path: string,
): Uri {
  return vscode.Uri.joinPath(root, ...path.split("/"));
}
