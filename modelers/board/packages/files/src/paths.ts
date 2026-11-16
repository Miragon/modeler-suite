/**
 * What a path of the port may be, and which paths a board reaches. The server runs `repoPath` on
 * every path before a backend sees it, and then asks the host's rule (`FilesRule`): a page is not
 * trusted with a path. Both read the path's text and nothing else. They keep a path inside the
 * repository's root, out of its dot folders and on the files a board shows; they do not follow a
 * link that leads out of the root, and they do not know how the place folds one name onto
 * another. A backend with a disk checks those two itself.
 */

/** a character below the space, or the delete character: no name of a file has one */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * The short name NTFS gives `.git` (`GIT~1`): on Windows it opens Git's folder without a dot.
 * Git itself refuses a path with such a segment (`core.protectNTFS`).
 */
const GIT_SHORT_NAME = /^git~\d+$/i;

/**
 * Why a path is none of the port's, undefined for one that is. `outside`: no
 * repository-relative path with forward slashes at all. `hidden`: such a path with a segment
 * that starts with a dot, a dot file or a dot folder at any depth (`.git`, `.github`, `.vscode`,
 * `.env`), or with a segment that is the short name Windows has for `.git`: what a repository
 * keeps there is on no board.
 */
export function pathProblem(input: unknown): "outside" | "hidden" | undefined {
  if (typeof input !== "string" || input === "" || input.length > 1024) return "outside";
  if (input.includes("\\") || hasControlCharacter(input)) return "outside";
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)) return "outside";
  // an empty segment is an absolute path, a doubled slash or a slash at the end
  const segments = input.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "outside";
  }
  return segments.some((segment) => segment.startsWith(".") || GIT_SHORT_NAME.test(segment))
    ? "hidden"
    : undefined;
}

/**
 * A repository-relative path with forward slashes, or undefined for anything else: no string, an
 * empty one, more than 1024 characters, a backslash, a control character (a NUL, a line break),
 * a scheme or a drive letter, an absolute path, an empty segment, and a segment that starts with
 * a dot (`.`, `..`, a dot file, a dot folder).
 */
export function repoPath(input: unknown): string | undefined {
  return pathProblem(input) === undefined ? (input as string) : undefined;
}

/** the largest file a page may create: the board's own limit for a picture */
export const NEW_FILE_LIMIT_BYTES = 10 * 1024 * 1024;

/** what Windows reads as a device and not as a file, whatever follows the first dot */
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * The one shape a new file may have: `assets/<name>`, the name of letters, digits, dot, dash and
 * underscore, which is what the board makes of a picture's name. A page chooses this name, so it
 * is none that means something else to the place that stores it: no dot file (`.gitignore`), no
 * dot at the end, which Windows drops, and no device name of Windows (`nul`, `con.png`).
 */
export function isNewAssetPath(path: string): boolean {
  const name = /^assets\/([A-Za-z0-9._-]+)$/.exec(path)?.[1];
  if (name === undefined || repoPath(path) === undefined) return false;
  return !name.startsWith(".") && !name.endsWith(".") && !DEVICE_NAME.test(name);
}

/**
 * The entry whose suffix is the longest one the file name of `path` ends with, ignoring case. A
 * file named only the suffix is none; of two entries with the same suffix the first is taken.
 */
export function bySuffix<Entry extends { suffixes: readonly string[] }>(
  entries: readonly Entry[],
  path: string,
): Entry | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  let best: { entry: Entry; length: number } | undefined;
  for (const entry of entries) {
    for (const suffix of entry.suffixes) {
      const longer = suffix.length > (best?.length ?? 0);
      if (longer && name.length > suffix.length && name.endsWith(suffix.toLowerCase())) {
        best = { entry, length: suffix.length };
      }
    }
  }
  return best?.entry;
}

/**
 * The host's rule of what a board may reach, asked by the server for every path a page sends and
 * for every path of the list it tells the page. A path the rule refuses never reaches the
 * backend.
 */
export interface FilesRule {
  /** a file a board shows as a model: it is opened as a text, and written */
  model(path: string): boolean;
  /** a file a board draws as a picture: its bytes are read, and a new file is one */
  picture(path: string): boolean;
}

/**
 * The suffixes of the pictures a board draws, lower case and with the dot. The files package
 * cannot import the board: `packages/host/test/files-host.test.ts` holds the list against the
 * board's own.
 */
export const PICTURE_SUFFIXES: readonly string[] = [
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
];

/**
 * A rule by the end of a file's name, as `bySuffix` reads it: the suffixes of the editors a host
 * shows, and of the pictures its board draws (`PICTURE_SUFFIXES`).
 */
export function suffixRule(suffixes: {
  models: readonly string[];
  pictures: readonly string[];
}): FilesRule {
  const models = [{ suffixes: suffixes.models }];
  const pictures = [{ suffixes: suffixes.pictures }];
  return {
    model: (path) => bySuffix(models, path) !== undefined,
    picture: (path) => bySuffix(pictures, path) !== undefined,
  };
}
