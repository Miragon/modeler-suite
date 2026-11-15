/**
 * What a path of the port may be. The server runs `repoPath` on every path before a backend sees
 * it: a page is not trusted with a path. The check reads the path's text and nothing else. It
 * keeps a path inside the repository's root; it does not say that the file is one the page
 * should have: a folder such as `.git`, a dot file, a link that leads out of the root and a name
 * the place folds onto another one all pass. What a backend offers is the backend's to decide,
 * and one with a disk behind it checks a path again against what it lists.
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
 * A repository-relative path with forward slashes, or undefined for anything else: no string, an
 * empty one, more than 1024 characters, a backslash, a control character (a NUL, a line break),
 * a scheme or a drive letter, an absolute path, and a segment that is empty, `.` or `..`.
 */
export function repoPath(input: unknown): string | undefined {
  if (typeof input !== "string" || input === "" || input.length > 1024) return undefined;
  if (input.includes("\\") || hasControlCharacter(input)) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)) return undefined;
  // an empty segment is an absolute path, a doubled slash or a slash at the end
  const segments = input.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }
  return input;
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
