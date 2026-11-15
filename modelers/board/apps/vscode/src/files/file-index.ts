/**
 * The files of one repository root that a board lists: its models, wherever they are, and the
 * pictures under `assets/`. One search when it starts, then a watcher on everything below the
 * root, VS Code's own file events for what a person does in the Explorer, and a search again
 * whenever those cannot say what changed. Kept in memory, so that the list is at hand whenever
 * a page asks. After Wardley Maps' `WorkspaceMaps`, the suite's first such index.
 *
 * The watcher is on every entry and not on the files a board lists, because of what VS Code
 * names (seen in VS Code 1.146 and 1.96 on Linux): a folder that another program removes or
 * moves is one word, the folder's, and none for its files, and a watcher whose glob matches
 * files alone hears nothing of it.
 */
import { repoPath, suffixRule } from "@miragon/board-files";
import type { DisposableLike } from "@miragon/modeler-shell/vscode/extension";

import { fileAt, pathBelow } from "./root.js";
import {
  DIRECTORY,
  type BoardUriLike,
  type BoardVsCodeLike,
  type FileWatcherLike,
} from "./vscode-like.js";

/** a burst of file events (a checkout, a moved folder) tells the list's listeners once */
export const LIST_REST_MS = 100;

/**
 * How many new entries of one burst are asked what they are. Beyond that a search answers for
 * all of them: a build that writes a thousand files costs one search and no thousand questions.
 */
export const FOLDER_LOOKS = 8;

/**
 * Left out of the search and of the list. `findFiles` reads no `.gitignore`, and the models of
 * an installed package are no models of the repository.
 */
const NOT_SEARCHED = "**/node_modules/**";

export type FileEvent = "created" | "changed" | "deleted";

export interface IndexSuffixes {
  /** with the dot, as the suffix table has them */
  readonly models: readonly string[];
  readonly pictures: readonly string[];
}

export interface FileIndex {
  /** sorted, and the same array until the list changes */
  list(): readonly string[];
  /** rested: once for a burst of changes */
  onListChanged(listener: () => void): () => void;
  /**
   * A file below the root came, changed or went, told at once and by its path from the root:
   * every listed file, and a file outside the list that a board may still show (a model in
   * `node_modules`), where the watcher names the file itself.
   */
  onFile(listener: (path: string, event: FileEvent) => void): () => void;
  /** a file this host made itself: listed without waiting for the watcher's word */
  created(path: string): void;
  /** settles with the first search, whether it found the files or failed */
  readonly searched: Promise<void>;
  dispose(): void;
}

type IndexVsCodeLike<Uri extends BoardUriLike> = Pick<
  BoardVsCodeLike<Uri>,
  "RelativePattern" | "Uri"
> & {
  readonly workspace: Pick<
    BoardVsCodeLike<Uri>["workspace"],
    | "findFiles"
    | "createFileSystemWatcher"
    | "onDidCreateFiles"
    | "onDidDeleteFiles"
    | "onDidRenameFiles"
    | "onDidChangeWorkspaceFolders"
  > & { readonly fs: Pick<BoardVsCodeLike<Uri>["workspace"]["fs"], "stat"> };
};

/** what an event does to the list; true when the list is another one after it */
type Change = (paths: Set<string>) => boolean;

/** the glob of every file that ends in one of the suffixes, at any depth */
function globOf(suffixes: readonly string[]): string {
  const ends = suffixes.map((suffix) => suffix.replace(/^\./, ""));
  return ends.length === 1 ? `**/*.${ends[0]}` : `**/*.{${ends.join(",")}}`;
}

const atOrBelow = (path: string, folder: string): boolean =>
  folder === "" || path === folder || path.startsWith(`${folder}/`);

function add(found: readonly string[]): Change {
  return (paths) => {
    const before = paths.size;
    for (const path of found) paths.add(path);
    return paths.size > before;
  };
}

function removeBelow(folder: string): Change {
  return (paths) => {
    const below = [...paths].filter((path) => atOrBelow(path, folder));
    for (const path of below) paths.delete(path);
    return below.length > 0;
  };
}

/**
 * The path of a file or folder VS Code names, from the root: `""` for the root itself and for a
 * folder above it, undefined for what lies beside the root.
 */
function placeOf(root: BoardUriLike, uri: BoardUriLike): string | undefined {
  const below = pathBelow(root, uri);
  if (below !== undefined) return below;
  return root.path === uri.path || pathBelow(uri, root) !== undefined ? "" : undefined;
}

/** what the index does with a file event; the watcher and the gestures of a person call it */
interface Listing {
  listable(path: string): boolean;
  /** a file whose changes a text or a picture of a board hears of, listed or not */
  followed(path: string): boolean;
  listed(path: string): boolean;
  /** every listed file at or below a folder goes, each told; answers which they were */
  leave(folder: string): string[];
  /** the files a board lists among `found` are listed, each told once */
  arrive(found: readonly string[]): void;
  /** a file came, changed or went that the list does not move for */
  tell(path: string, event: FileEvent): void;
  /** a new entry that is no listed file: searched where it turns out to be a folder */
  look(path: string): void;
  search(): void;
}

/**
 * The new entries of a burst, once it rests: where a folder is among them, `search` runs. A
 * folder that arrives whole names none of its files, and one that is filled right after it was
 * made may hold a file VS Code looked for too late. A file costs one question and no search.
 */
function folderLooks<Uri extends BoardUriLike>(
  vscode: IndexVsCodeLike<Uri>,
  root: Uri,
  restMs: number,
  search: () => void,
): { look(path: string): void; dispose(): void } {
  let unknown = new Set<string>();
  let rest: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const isFolder = (path: string): Promise<boolean> =>
    Promise.resolve(vscode.workspace.fs.stat(fileAt(vscode, root, path))).then(
      (stat) => (stat.type & DIRECTORY) !== 0,
      () => false,
    );
  async function lookAtAll(): Promise<void> {
    const asked = [...unknown];
    unknown = new Set();
    const folders =
      asked.length > FOLDER_LOOKS || (await Promise.all(asked.map(isFolder))).some(Boolean);
    if (folders && !disposed) search();
  }
  return {
    look(path) {
      unknown.add(path);
      clearTimeout(rest);
      rest = setTimeout(() => void lookAtAll(), restMs);
    },
    dispose() {
      disposed = true;
      clearTimeout(rest);
    },
  };
}

/**
 * What the watcher names, for whatever program changed the disk. It names a file, and for a
 * folder that went or came it names the folder alone.
 */
function watching<Uri extends BoardUriLike>(
  vscode: IndexVsCodeLike<Uri>,
  root: Uri,
  listing: Listing,
): DisposableLike[] {
  const watcher: FileWatcherLike<Uri> = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, "**/*"),
  );
  return [
    watcher,
    watcher.onDidCreate((uri) => {
      const path = pathBelow(root, uri);
      if (path === undefined) return;
      if (listing.listable(path)) listing.arrive([path]);
      else if (listing.followed(path)) listing.tell(path, "created");
      else listing.look(path);
    }),
    watcher.onDidChange((uri) => {
      const path = pathBelow(root, uri);
      if (path === undefined || !listing.followed(path)) return;
      // The first word of a new file may be a change: VS Code missed the moment it was made,
      // in a folder that was itself new.
      if (listing.listable(path) && !listing.listed(path)) listing.arrive([path]);
      else listing.tell(path, "changed");
    }),
    watcher.onDidDelete((uri) => {
      const path = pathBelow(root, uri);
      if (path === undefined) return;
      // A folder that went is one word for every file in it.
      const left = listing.leave(path);
      if (listing.followed(path) && !left.includes(path)) listing.tell(path, "deleted");
    }),
  ];
}

/**
 * What a person does to files in VS Code itself, told at once and with both ends of a rename,
 * where the watcher's word comes later and names an end alone. A folder that is pasted, moved
 * or deleted is one entry here and names none of the files in it.
 */
function gestures<Uri extends BoardUriLike>(
  vscode: IndexVsCodeLike<Uri>,
  root: Uri,
  listing: Listing,
): DisposableLike[] {
  return [
    vscode.workspace.onDidCreateFiles(({ files }) => {
      const places = files.flatMap((uri) => pathBelow(root, uri) ?? []);
      listing.arrive(places);
      // A new folder (a pasted one, say) may hold files that no event names.
      for (const path of places) if (!listing.listable(path)) listing.look(path);
    }),
    vscode.workspace.onDidDeleteFiles(({ files }) => {
      for (const uri of files) {
        const folder = placeOf(root, uri);
        if (folder !== undefined) listing.leave(folder);
      }
    }),
    vscode.workspace.onDidRenameFiles(({ files }) => {
      let unknown = false;
      for (const { oldUri, newUri } of files) {
        const from = placeOf(root, oldUri);
        const to = pathBelow(root, newUri);
        const moved = from === undefined ? [] : listing.leave(from);
        // What came from outside the root, or got a name a board lists only now, names no file
        // that was listed: only a search says what is there.
        if (moved.length === 0) unknown = true;
        if (to === undefined || from === undefined) continue;
        listing.arrive(moved.map((path) => to + path.slice(from.length)));
      }
      if (unknown) listing.search();
    }),
    // findFiles answers by what VS Code has open: after a change of the folders it may see more
    vscode.workspace.onDidChangeWorkspaceFolders(() => listing.search()),
  ];
}

export function createFileIndex<Uri extends BoardUriLike>(
  vscode: IndexVsCodeLike<Uri>,
  root: Uri,
  suffixes: IndexSuffixes,
  options: { restMs?: number | undefined } = {},
): FileIndex {
  const rule = suffixRule(suffixes);
  const restMs = options.restMs ?? LIST_REST_MS;
  const models = new vscode.RelativePattern(root, globOf(suffixes.models));
  const pictures = new vscode.RelativePattern(root, `assets/${globOf(suffixes.pictures)}`);
  const listListeners = new Set<() => void>();
  const fileListeners = new Set<(path: string, event: FileEvent) => void>();
  let paths = new Set<string>();
  let listed: readonly string[] | undefined;
  let searches = 0;
  let searchedOnce = false;
  /** the changes made while a search runs, which its result would otherwise undo */
  let duringSearch: Change[] | undefined;
  let rest: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let markSearched: () => void = () => {};
  const searched = new Promise<void>((resolve) => (markSearched = resolve));

  /** a file whose changes a text or a picture of a board hears of, listed or not */
  const followed = (path: string): boolean =>
    rule.model(path) || (path.startsWith("assets/") && rule.picture(path));
  /** below a dot folder and below node_modules a board lists nothing */
  const reached = (path: string): boolean =>
    repoPath(path) !== undefined && !path.split("/").includes("node_modules");
  /**
   * The list holds what a search finds. The search's glob reads a suffix by its letters as
   * they are, where the rule of what a board shows ignores their case: `X.OWM` opens for a
   * node that names it and is never listed, or the next search would take it off the list
   * again and tell its node that the file is gone.
   */
  const asWritten = (path: string, ends: readonly string[]): boolean =>
    ends.some((suffix) => path.endsWith(suffix));
  const findable = (path: string): boolean =>
    asWritten(path, suffixes.models) ||
    (path.startsWith("assets/") && asWritten(path, suffixes.pictures));
  const listable = (path: string): boolean => reached(path) && followed(path) && findable(path);

  const tellFile = (path: string, event: FileEvent): void => {
    for (const listener of [...fileListeners]) listener(path, event);
  };
  const tellList = (): void => {
    listed = undefined;
    clearTimeout(rest);
    rest = setTimeout(() => {
      for (const listener of [...listListeners]) listener();
    }, restMs);
  };
  const apply = (change: Change): void => {
    duringSearch?.push(change);
    if (change(paths) && searchedOnce) tellList();
  };

  async function search(): Promise<void> {
    const mine = ++searches;
    duringSearch ??= [];
    const found = await Promise.all([
      vscode.workspace.findFiles(models, NOT_SEARCHED),
      vscode.workspace.findFiles(pictures, NOT_SEARCHED),
    ]).then(
      (results) => results.flat(),
      () => undefined,
    );
    if (mine !== searches || disposed) return;
    const changes = duringSearch ?? [];
    duringSearch = undefined;
    // A failed search leaves the list as it was: an empty one would take every model off the picker.
    if (found) {
      const next = new Set<string>();
      for (const uri of found) {
        const path = pathBelow(root, uri);
        if (path !== undefined && listable(path)) next.add(path);
      }
      for (const change of changes) change(next);
      const gone = [...paths].filter((path) => !next.has(path));
      const come = [...next].filter((path) => !paths.has(path));
      paths = next;
      // What a search finds changed is told file by file as well: a folder that another program
      // moved or deleted reaches an open text only this way.
      for (const path of gone) tellFile(path, "deleted");
      for (const path of come) if (searchedOnce) tellFile(path, "created");
      if (!searchedOnce || gone.length > 0 || come.length > 0) tellList();
    }
    searchedOnce = true;
    markSearched();
  }

  /** every listed file at or below a folder VS Code deleted or moved away goes, each told */
  const leave = (folder: string): string[] => {
    const below = [...paths].filter((path) => atOrBelow(path, folder));
    apply(removeBelow(folder));
    for (const path of below) tellFile(path, "deleted");
    return below;
  };
  /** told once: a file this host made is named again by the watcher, later */
  const arrive = (found: readonly string[]): void => {
    const fresh = found.filter((path) => listable(path) && !paths.has(path));
    apply(add(fresh));
    for (const path of fresh) tellFile(path, "created");
  };

  const folders = folderLooks(vscode, root, restMs, () => void search());
  const listing: Listing = {
    listable,
    followed,
    listed: (path) => paths.has(path),
    leave,
    arrive,
    tell: tellFile,
    // below a dot folder and below node_modules there is nothing to look for
    look: (path) => void (reached(path) && folders.look(path)),
    search: () => void search(),
  };
  const subscriptions: DisposableLike[] = [
    ...watching(vscode, root, listing),
    ...gestures(vscode, root, listing),
  ];
  void search();

  return {
    list: () => (listed ??= Object.freeze([...paths].sort())),
    onListChanged(listener) {
      listListeners.add(listener);
      return () => void listListeners.delete(listener);
    },
    onFile(listener) {
      fileListeners.add(listener);
      return () => void fileListeners.delete(listener);
    },
    created(path) {
      arrive([path]);
    },
    searched,
    dispose() {
      disposed = true;
      clearTimeout(rest);
      folders.dispose();
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
      listListeners.clear();
      fileListeners.clear();
    },
  };
}

/** the index of a root, shared by every board of that repository that is open */
export interface IndexPool<Uri> {
  acquire(root: Uri): { readonly index: FileIndex; release(): void };
  dispose(): void;
}

export function createIndexPool<Uri extends BoardUriLike>(
  vscode: IndexVsCodeLike<Uri>,
  suffixes: IndexSuffixes,
  options: { restMs?: number | undefined } = {},
): IndexPool<Uri> {
  const shared = new Map<string, { index: FileIndex; users: number }>();
  return {
    acquire(root) {
      const key = root.toString();
      const entry = shared.get(key) ?? {
        index: createFileIndex(vscode, root, suffixes, options),
        users: 0,
      };
      shared.set(key, entry);
      entry.users += 1;
      let released = false;
      return {
        index: entry.index,
        release() {
          if (released) return;
          released = true;
          entry.users -= 1;
          if (entry.users > 0 || shared.get(key) !== entry) return;
          shared.delete(key);
          entry.index.dispose();
        },
      };
    },
    dispose() {
      for (const [, entry] of shared) entry.index.dispose();
      shared.clear();
    },
  };
}
