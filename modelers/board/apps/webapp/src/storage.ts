/**
 * What the web app keeps in this browser: the board's text and every file of the example a
 * person changed or added. There is no disk behind the app, so this is all that outlives a
 * reload. A blocked or full storage (private mode, a policy, a quota) never stops the app: a
 * save answers false and the changes stay in the page.
 */
import { fromBase64, isNewAssetPath, toBase64, type MemoryFile } from "@miragon/board-files";
import { isNodeAttrs, parseBoardText } from "@miragon/board-schema-model";

/** What the app uses of `window.localStorage`, so that a test hands in a store of its own. */
export type KeyValueStore = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** The example the app starts from: the board's text and the files of its repository by path. */
export interface ExampleRepository {
  readonly board: string;
  readonly files: Readonly<Record<string, MemoryFile>>;
}

export interface AppStorage {
  /** the board text to start with: the kept one, or the example's */
  board(): string;
  /** the repository to start with: the example, with every kept file in its place */
  files(): Record<string, MemoryFile>;
  /** each answers whether the browser took it; the example's own text is kept by forgetting */
  keepBoard(text: string): boolean;
  keepText(path: string, text: string): boolean;
  keepBytes(path: string, bytes: Uint8Array, mime: string): boolean;
  /**
   * Forgets every kept picture `shown` does not name. A picture is kept when it is stored, and
   * its node may go a moment later. Within one life of the page an undo brings the node back; a
   * restart has no undo, and without this the bytes would fill the browser's storage for good.
   */
  forgetPictures(shown: ReadonlySet<string>): void;
  /** forgets everything kept: the next start shows the example */
  reset(): void;
}

const PREFIX = "miragon-board-example:";
const BOARD_KEY = `${PREFIX}board`;
const TEXT_PREFIX = `${PREFIX}text:`;
const BYTES_PREFIX = `${PREFIX}bytes:`;

/** A store in memory: for a browser that blocks its own, and for tests. */
export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

/**
 * The files the image nodes of a board text show, or undefined for a text that is no board: what
 * is not known to be without a node is not forgotten.
 */
export function picturesOf(boardText: string): ReadonlySet<string> | undefined {
  const parsed = parseBoardText(boardText);
  if (!parsed.ok) return undefined;
  const shown = new Set<string>();
  for (const attrs of Object.values(parsed.snapshot.elements)) {
    if (isNodeAttrs(attrs) && attrs.type === "image" && typeof attrs.file === "string") {
      shown.add(attrs.file);
    }
  }
  return shown;
}

/** Whether the page was opened to bring the example back: `?reset` in its address. */
export const resetRequested = (search: string): boolean => new URLSearchParams(search).has("reset");

function keptKeys(store: KeyValueStore): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

/** the answer of a storage that may be blocked or full: `otherwise` where it throws */
function guarded<Answer>(ask: () => Answer, otherwise: Answer): Answer {
  try {
    return ask();
  } catch {
    return otherwise;
  }
}

function bytesOf(value: string | null): MemoryFile | undefined {
  if (value === null) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { mime, base64 } = parsed as Record<string, unknown>;
  if (typeof mime !== "string" || typeof base64 !== "string") return undefined;
  return { bytes: fromBase64(base64), mime };
}

export function createAppStorage(store: KeyValueStore, example: ExampleRepository): AppStorage {
  const exampleText = (path: string): string | undefined => {
    const file = Object.hasOwn(example.files, path) ? example.files[path] : undefined;
    return typeof file === "string" ? file : undefined;
  };
  const keep = (key: string, value: string, original: string | undefined): boolean =>
    guarded(() => {
      if (value === original) store.removeItem(key);
      else store.setItem(key, value);
      return true;
    }, false);
  // A kept entry that fits no file of this example is left out: a text for a path the example
  // no longer has, a new file outside assets/, a value another program wrote.
  const keptFile = (key: string): [path: string, file: MemoryFile] | undefined => {
    if (key.startsWith(TEXT_PREFIX)) {
      const path = key.slice(TEXT_PREFIX.length);
      const text = store.getItem(key);
      return text !== null && exampleText(path) !== undefined ? [path, text] : undefined;
    }
    if (!key.startsWith(BYTES_PREFIX)) return undefined;
    const path = key.slice(BYTES_PREFIX.length);
    if (Object.hasOwn(example.files, path) || !isNewAssetPath(path)) return undefined;
    const file = bytesOf(store.getItem(key));
    return file === undefined ? undefined : [path, file];
  };

  return {
    board: () => guarded(() => store.getItem(BOARD_KEY), null) ?? example.board,
    files() {
      const kept = guarded(() => keptKeys(store), []).flatMap((key) => {
        const entry = guarded(() => keptFile(key), undefined);
        return entry === undefined ? [] : [entry];
      });
      return { ...example.files, ...Object.fromEntries(kept) };
    },
    keepBoard: (text) => keep(BOARD_KEY, text, example.board),
    keepText: (path, text) => keep(`${TEXT_PREFIX}${path}`, text, exampleText(path)),
    keepBytes: (path, bytes, mime) =>
      guarded(() => {
        store.setItem(`${BYTES_PREFIX}${path}`, JSON.stringify({ mime, base64: toBase64(bytes) }));
        return true;
      }, false),
    forgetPictures(shown) {
      guarded(() => {
        for (const key of keptKeys(store)) {
          const kept = key.startsWith(BYTES_PREFIX) ? key.slice(BYTES_PREFIX.length) : undefined;
          if (kept !== undefined && !shown.has(kept)) store.removeItem(key);
        }
      }, undefined);
    },
    reset() {
      guarded(() => {
        for (const key of keptKeys(store)) store.removeItem(key);
      }, undefined);
    },
  };
}
