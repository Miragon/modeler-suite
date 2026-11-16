/**
 * "New Board from Example": the example's board and the files it shows, written into the folder
 * a person picked. The files go beside the board file and never over a file that is there.
 *
 * A node stores its file's path from the repository's root, not from the board file. So the
 * board is written with the paths its place gives: a board in `docs/` of a repository shows
 * `docs/models/tea.owm`, the file that was written beside it.
 */
import { encodeBoard, parseBoardText } from "@miragon/board-schema-model";

import type { ExampleRepository } from "./example-files.js";
import { findRoot, pathBelow } from "./files/root.js";
import type { BoardUriLike, BoardVsCodeLike } from "./files/vscode-like.js";

type ExampleVsCodeLike<Uri extends BoardUriLike> = Pick<BoardVsCodeLike<Uri>, "Uri"> & {
  readonly workspace: {
    getWorkspaceFolder: BoardVsCodeLike<Uri>["workspace"]["getWorkspaceFolder"];
    readonly fs: Pick<
      BoardVsCodeLike<Uri>["workspace"]["fs"],
      "stat" | "writeFile" | "createDirectory"
    >;
  };
};

const encoder = new TextEncoder();
const folderOf = (path: string): string => path.slice(0, path.lastIndexOf("/"));

/**
 * A note of the example without the paragraphs that are true in the web app alone: there the
 * browser keeps the files and a menu entry resets them, and here they are files on a disk.
 */
const withoutBrowserWords = (text: string): string =>
  text
    .split("\n\n")
    .filter((paragraph) => !/\bbrowser/i.test(paragraph))
    .join("\n\n");

/**
 * The example's board for a board file in `folder`, the board file's folder as a path from the
 * repository's root with a slash at its end, or the empty text at the root: every path of an
 * example file is one below that folder, where a node names it and where an arrow's label
 * quotes it.
 */
export function exampleBoardText(example: ExampleRepository, folder: string): string {
  const parsed = parseBoardText(example.board);
  if (!parsed.ok) throw new Error(`the example board cannot be read: ${parsed.reason}`);
  const moved = (value: unknown): unknown =>
    typeof value === "string" && Object.hasOwn(example.files, value) ? folder + value : value;
  const elements = Object.entries(parsed.snapshot.elements).map(([id, attrs]) => {
    const next = { ...attrs };
    // an attribute an element does not have stays away: the board's text writes no undefined
    for (const key of ["file", "label"]) next[key] = moved(attrs[key]);
    if (typeof attrs.text === "string") next.text = withoutBrowserWords(attrs.text);
    return [id, next] as const;
  });
  return encodeBoard({ elements: Object.fromEntries(elements), meta: parsed.snapshot.meta });
}

async function exists<Uri extends BoardUriLike>(
  vscode: ExampleVsCodeLike<Uri>,
  uri: Uri,
): Promise<boolean> {
  return Promise.resolve(vscode.workspace.fs.stat(uri)).then(
    () => true,
    () => false,
  );
}

/**
 * Writes the example around the board file `board`: each file of the example beside it unless
 * something is there under that name, then the board file itself, whose place the person chose
 * in a dialog that asked before it replaced. Answers the example files that were there already
 * and were kept, by their paths from the board's folder. `workspace.fs` has no write that only
 * makes a file: one another program makes between the look and the write is replaced.
 */
export async function writeExample<Uri extends BoardUriLike>(
  vscode: ExampleVsCodeLike<Uri>,
  example: ExampleRepository,
  board: Uri,
): Promise<{ kept: string[] }> {
  const folder = board.with({ path: folderOf(board.path) });
  const root = await findRoot(vscode, board);
  const below = root === undefined ? undefined : pathBelow(root, folder);
  const kept: string[] = [];
  const made = new Set<string>();
  for (const [path, text] of Object.entries(example.files)) {
    const segments = path.split("/");
    const file = vscode.Uri.joinPath(folder, ...segments);
    if (await exists(vscode, file)) {
      kept.push(path);
      continue;
    }
    const parent = segments.slice(0, -1);
    if (parent.length > 0 && !made.has(parent.join("/"))) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, ...parent));
      made.add(parent.join("/"));
    }
    await vscode.workspace.fs.writeFile(file, encoder.encode(text));
  }
  // The board last: it is opened once it is written, and by then its files are there.
  const text = exampleBoardText(example, below === undefined ? "" : `${below}/`);
  await vscode.workspace.fs.writeFile(board, encoder.encode(text));
  return { kept };
}

/** what a person is told about example files that were there already; undefined for none */
export function keptMessage(kept: readonly string[]): string | undefined {
  const [first] = kept;
  if (first === undefined) return undefined;
  if (kept.length === 1) {
    return `${first} was already there. It was left as it is, and the board shows it.`;
  }
  const named = kept.slice(0, 3).join(", ");
  const more = kept.length > 3 ? ` and ${kept.length - 3} more` : "";
  return `${kept.length} files of the example were already there: ${named}${more}. They were left as they are, and the board shows them.`;
}
