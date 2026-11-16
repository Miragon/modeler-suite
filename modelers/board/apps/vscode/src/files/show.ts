/**
 * A file of the repository, shown in the editor VS Code has for it: the one a click in the
 * Explorer opens, a text editor or the custom editor of another extension. A board asks for it
 * where it has no editor of its own for a file, and gets nothing of the file.
 */
import { repoPath } from "@miragon/board-files";

import { behindLink, fileAt } from "./root.js";
import { FILE, SYMBOLIC_LINK, type BoardUriLike, type BoardVsCodeLike } from "./vscode-like.js";

type ShowVsCodeLike<Uri extends BoardUriLike> = Pick<BoardVsCodeLike<Uri>, "Uri" | "commands"> & {
  readonly workspace: { readonly fs: Pick<BoardVsCodeLike<Uri>["workspace"]["fs"], "stat"> };
};

/** VS Code's command that opens a resource in its default editor */
export const OPEN_COMMAND = "vscode.open";

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Shows the file at `path` below `root` and resolves once VS Code opened it. Rejects with a
 * message a card can show behind "This file could not be shown.". The files server hands this
 * any path of the repository, whatever the board's rule says of it, so everything is checked
 * here before VS Code is asked: that the path lies below the root and in no dot folder, that no
 * folder on the way is a link and the file is none (a link may lead out of the repository), and
 * that there is a file. No size is asked: VS Code decides what it opens.
 */
export async function showFile<Uri extends BoardUriLike>(
  vscode: ShowVsCodeLike<Uri>,
  root: Uri,
  path: string,
): Promise<void> {
  if (repoPath(path) === undefined) throw new Error(`${path} is no file of this repository`);
  const uri = fileAt(vscode, root, path);
  if (await behindLink(vscode, uri, path)) {
    throw new Error(`${path} is behind a link, and a board shows no link`);
  }
  const stat = await Promise.resolve(vscode.workspace.fs.stat(uri)).catch(() => undefined);
  if (!stat) throw new Error(`${path} does not exist`);
  if ((stat.type & SYMBOLIC_LINK) !== 0) {
    throw new Error(`${path} is a link, and a board shows no link`);
  }
  if ((stat.type & FILE) === 0) throw new Error(`${path} is no file`);
  try {
    await vscode.commands.executeCommand(OPEN_COMMAND, uri);
  } catch (error) {
    throw new Error(`VS Code could not open ${path}: ${reasonOf(error)}`, { cause: error });
  }
}
