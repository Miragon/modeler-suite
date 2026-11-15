/**
 * VS Code's workspace in memory, as far as the files backend uses it: a disk with folders and
 * links, text documents with VS Code's life (opened on demand, dirty after an edit, let go of
 * while clean), workspace edits that carry the version they were made on, a search, watchers,
 * VS Code's own file gestures and the workspace folders. It stands where `vscode` stands in the
 * unit tests and in a test page, and imports nothing of Node or of a page.
 *
 * Every behaviour here is one the backend depends on and that was read from VS Code's typings
 * and source, not seen in a run: `test/memory-vscode.test.ts` holds each as a sentence, and the
 * board's guide lists them as what a real VS Code has to confirm.
 */
import type {
  DisposableLike,
  RangeLike,
  TextDocumentChangeEventLike,
  TextDocumentLike,
  WorkspaceEditLike,
} from "@miragon/modeler-shell/vscode/extension";

import {
  DIRECTORY,
  FILE,
  READONLY,
  SYMBOLIC_LINK,
  type BoardVsCodeLike,
  type FileStatLike,
  type FileWatcherLike,
  type GlobLike,
  type RelativePatternLike,
} from "./vscode-like.js";

export class MemoryUri {
  private constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string = "",
  ) {}

  static file(path: string): MemoryUri {
    return new MemoryUri("file", "", path);
  }

  /** `file:///folder/name?query`, or `scheme:path` for a resource without a place, an untitled one */
  static parse(value: string): MemoryUri {
    const parts = /^([a-z][a-z0-9+.-]*):(?:\/\/([^/?]*))?([^?]*)(?:\?(.*))?$/i.exec(value);
    if (!parts) return MemoryUri.file(value);
    return new MemoryUri(parts[1] ?? "file", parts[2] ?? "", parts[3] ?? "", parts[4] ?? "");
  }

  static joinPath(base: MemoryUri, ...segments: string[]): MemoryUri {
    const joined = [base.path.replace(/\/$/, ""), ...segments].join("/");
    return new MemoryUri(base.scheme, base.authority, joined, base.query);
  }

  /** a mock keeps no file system path apart from the path; the backend never reads it */
  get fsPath(): string {
    return this.path;
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string }): this {
    return new MemoryUri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
    ) as this;
  }

  toString(): string {
    const query = this.query === "" ? "" : `?${this.query}`;
    return this.path.startsWith("/")
      ? `${this.scheme}://${this.authority}${this.path}${query}`
      : `${this.scheme}:${this.path}${query}`;
  }
}

export class MemoryRange implements RangeLike {
  readonly start: { line: number; character: number };
  readonly end: { line: number; character: number };

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

/** one replacement of a workspace edit */
export interface MemoryTextEdit {
  readonly uri: MemoryUri;
  readonly range: RangeLike;
  readonly text: string;
}

export class MemoryWorkspaceEdit implements WorkspaceEditLike {
  readonly edits: MemoryTextEdit[] = [];

  replace(uri: MemoryUri, range: RangeLike, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

export class MemoryRelativePattern implements RelativePatternLike {
  constructor(
    readonly baseUri: MemoryUri,
    readonly pattern: string,
  ) {}
}

/** a text document as VS Code hands it out; `text` and the flags are the fake's to move */
export interface MemoryDocument extends TextDocumentLike {
  readonly uri: MemoryUri;
  /** 1 for a document that was just opened, one more with every change of its text */
  readonly version: number;
  readonly isDirty: boolean;
  /** true from the close event on: the object is dead, the next open makes another */
  readonly isClosed: boolean;
}

interface DocumentState {
  readonly document: MemoryDocument;
  readonly eol: "\n" | "\r\n";
  text: string;
  version: number;
  dirty: boolean;
  closed: boolean;
  readonly undo: string[];
}

type Entry =
  | { readonly kind: "folder" }
  | { readonly kind: "file"; bytes: Uint8Array; readOnly: boolean }
  /** a symbolic link, to a file or to a folder */
  | { readonly kind: "link"; readonly target: string };

type WatchEvent = "created" | "changed" | "deleted";

interface Watcher {
  readonly base: string;
  readonly matches: (path: string) => boolean;
  readonly listeners: Record<WatchEvent, Set<(uri: MemoryUri) => unknown>>;
}

/** what the backend asked of VS Code, for a test that holds what was NOT asked */
export interface MemoryCalls {
  readonly stat: string[];
  readonly readFile: string[];
  readonly writeFile: string[];
  readonly createDirectory: string[];
  readonly openTextDocument: string[];
  readonly findFiles: Array<{ base: string; pattern: string; exclude: string | null | undefined }>;
}

class Emitter<Value> {
  private readonly listeners = new Set<(value: Value) => unknown>();

  constructor(private readonly errors: unknown[]) {}

  readonly event = (listener: (value: Value) => unknown): DisposableLike => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  get size(): number {
    return this.listeners.size;
  }

  /** VS Code logs what a listener throws and goes on with the next */
  fire(value: Value): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(value);
      } catch (error) {
        this.errors.push(error);
      }
    }
  }
}

/** everything the parts of the fake share */
interface State {
  readonly entries: Map<string, Entry>;
  readonly documents: Map<string, DocumentState>;
  readonly watchers: Set<Watcher>;
  readonly calls: MemoryCalls;
  readonly applied: MemoryTextEdit[];
  readonly errors: unknown[];
  readonly changed: Emitter<TextDocumentChangeEventLike>;
  readonly closed: Emitter<TextDocumentLike>;
  readonly created: Emitter<{ readonly files: readonly MemoryUri[] }>;
  readonly deleted: Emitter<{ readonly files: readonly MemoryUri[] }>;
  readonly renamed: Emitter<{
    readonly files: readonly { readonly oldUri: MemoryUri; readonly newUri: MemoryUri }[];
  }>;
  readonly foldersChanged: Emitter<void>;
  folders: MemoryUri[];
  /** the watchers hear nothing: a watcher that is late, or that a setting keeps off a folder */
  quiet: boolean;
  /** edits that wait for VS Code's main thread, while a test holds them */
  heldEdits: Array<() => void> | undefined;
  heldSearches: Array<() => void> | undefined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyOf = (path: string): string => MemoryUri.file(path).toString();
const parentOf = (path: string): string => path.slice(0, path.lastIndexOf("/")) || "/";
const below = (path: string, folder: string): boolean =>
  path.startsWith(folder === "/" ? "/" : `${folder}/`);

/** VS Code's glob as far as the backend writes one: `**`, `*`, `?` and `{a,b}` */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  let groups = 0;
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index] ?? "";
    if (glob.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
    } else if (glob.startsWith("**", index)) {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "{") {
      source += "(?:";
      groups += 1;
    } else if (char === "}" && groups > 0) {
      source += ")";
      groups -= 1;
    } else if (char === "," && groups > 0) source += "|";
    else source += char.replace(/[.+^$()|[\]{}\\]/, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** VS Code's default `files.exclude`: a search leaves these out unless its exclude is `null` */
const FILES_EXCLUDE = [
  "**/.git",
  "**/.svn",
  "**/.hg",
  "**/CVS",
  "**/.DS_Store",
  "**/Thumbs.db",
].map(globToRegExp);

function excludedBySetting(path: string): boolean {
  const segments = path.split("/");
  return segments.some((_, index) =>
    FILES_EXCLUDE.some((pattern) => pattern.test(segments.slice(0, index + 1).join("/"))),
  );
}

/**
 * The entry a path leads to, with every link on the way followed, as a file system does it.
 * `link` says that the path's own last name is a link: that much `stat` tells, and no more. A
 * linked folder on the way leaves no trace.
 */
function resolve(
  state: State,
  path: string,
): { path: string; entry: Exclude<Entry, { kind: "link" }>; link: boolean } | undefined {
  let real = "";
  let link = false;
  for (const segment of path.split("/").filter((part) => part !== "")) {
    real = `${real}/${segment}`;
    link = false;
    for (let hops = 0; hops < 8; hops++) {
      const entry = state.entries.get(real);
      if (entry?.kind !== "link") break;
      real = entry.target;
      link = true;
    }
  }
  const entry = real === "" ? ({ kind: "folder" } as const) : state.entries.get(real);
  return entry && entry.kind !== "link" ? { path: real || "/", entry, link } : undefined;
}

/** makes the folders of a path that are not there, and answers which they were, the top first */
function makeFolders(state: State, path: string): string[] {
  const made: string[] = [];
  let folder = "";
  for (const segment of path.split("/").filter((part) => part !== "")) {
    folder = `${folder}/${segment}`;
    if (state.entries.has(folder)) continue;
    state.entries.set(folder, { kind: "folder" });
    made.push(folder);
  }
  return made;
}

function watch(state: State, event: WatchEvent, path: string): void {
  if (state.quiet) return;
  for (const watcher of [...state.watchers]) {
    if (!below(path, watcher.base)) continue;
    const relative = path.slice(watcher.base === "/" ? 1 : watcher.base.length + 1);
    if (!watcher.matches(relative)) continue;
    for (const listener of [...watcher.listeners[event]]) {
      try {
        listener(MemoryUri.file(path));
      } catch (error) {
        state.errors.push(error);
      }
    }
  }
}

function documentOf(state: State, path: string, text: string): DocumentState {
  const lines = (): string[] => held.text.split(/\r\n|\n/);
  const document: MemoryDocument = {
    uri: MemoryUri.file(path),
    get version() {
      return held.version;
    },
    get isDirty() {
      return held.dirty;
    },
    get isClosed() {
      return held.closed;
    },
    get lineCount() {
      return lines().length;
    },
    lineAt(line) {
      const found = lines()[line];
      if (found === undefined) throw new Error(`Illegal value for \`line\`: ${line}`);
      return { text: found };
    },
    getText: () => held.text,
  };
  const held: DocumentState = {
    document,
    eol: text.includes("\r\n") ? "\r\n" : "\n",
    text,
    version: 1,
    dirty: false,
    closed: false,
    undo: [],
  };
  state.documents.set(keyOf(path), held);
  return held;
}

function textOnDisk(state: State, path: string): string | undefined {
  const found = resolve(state, path);
  return found?.entry.kind === "file" ? decoder.decode(found.entry.bytes) : undefined;
}

/** a text of the document that VS Code or a person made: one more version, and the event */
function setText(state: State, held: DocumentState, text: string, change: unknown): void {
  held.text = text;
  held.version += 1;
  held.dirty = text !== textOnDisk(state, held.document.uri.path);
  state.changed.fire({ document: held.document, contentChanges: [change] });
}

function closeDocument(state: State, held: DocumentState): void {
  state.documents.delete(held.document.uri.toString());
  held.closed = true;
  state.closed.fire(held.document);
}

/** the file's bytes are other ones: watchers hear it, and a clean open document reads them */
function writeDisk(state: State, path: string, bytes: Uint8Array): void {
  const existing = state.entries.get(path);
  const fresh = existing?.kind !== "file";
  // a folder that is made on the way is named too, before the file in it
  for (const folder of makeFolders(state, parentOf(path))) watch(state, "created", folder);
  state.entries.set(path, {
    kind: "file",
    bytes,
    readOnly: existing?.kind === "file" && existing.readOnly,
  });
  watch(state, fresh ? "created" : "changed", path);
  const held = state.documents.get(keyOf(path));
  const text = decoder.decode(bytes);
  // VS Code reads a clean document again when its file changes and leaves a dirty one alone.
  if (held && !held.dirty && held.text !== text) setText(state, held, text, { text });
}

/**
 * The files at or below `path` leave the disk, and are answered. A document of one stays open
 * with the text it had: VS Code lets go of it no sooner than of any other clean document, and
 * reads the file again when it is back.
 */
function removeDisk(state: State, path: string): string[] {
  const gone = [...state.entries.keys()].filter((entry) => entry === path || below(entry, path));
  const files = gone.filter((entry) => state.entries.get(entry)?.kind !== "folder");
  for (const entry of gone) state.entries.delete(entry);
  return files;
}

/** the entries at or below `from` are at `to` now; answers the files among them, by their old path */
function moveDisk(state: State, from: string, to: string): string[] {
  const moved = [...state.entries].filter(([path]) => path === from || below(path, from));
  for (const [path] of moved) state.entries.delete(path);
  makeFolders(state, parentOf(to));
  for (const [path, entry] of moved) state.entries.set(to + path.slice(from.length), entry);
  return moved.filter(([, entry]) => entry.kind !== "folder").map(([path]) => path);
}

/** VS Code lets go of the clean documents of files a person deleted or moved in the Explorer */
function closeClean(state: State, files: readonly string[]): void {
  for (const file of files) {
    const held = state.documents.get(keyOf(file));
    if (held && !held.dirty) closeDocument(state, held);
  }
}

function offsetOf(
  text: string,
  eol: string,
  position: { line: number; character: number },
): number {
  const lines = text.split(/\r\n|\n/);
  let offset = 0;
  for (let line = 0; line < position.line; line++)
    offset += (lines[line] ?? "").length + eol.length;
  return offset + position.character;
}

/**
 * VS Code's main thread applies an edit: all of it or nothing. An edit of a document the
 * extension host had open carries that document's version, and a document that moved on since
 * refuses it. An edit of a file with no open document opens one and is checked against nothing.
 */
function applyNow(
  state: State,
  edits: ReadonlyArray<MemoryTextEdit & { version?: number }>,
): boolean {
  for (const edit of edits) {
    const found = resolve(state, edit.uri.path);
    const open = state.documents.get(edit.uri.toString());
    if (open && edit.version !== undefined && open.version !== edit.version) return false;
    if (!open && found?.entry.kind !== "file") return false;
    if (found?.entry.kind === "file" && found.entry.readOnly) return false;
  }
  for (const edit of edits) {
    const { path } = edit.uri;
    const target =
      state.documents.get(edit.uri.toString()) ??
      documentOf(state, path, textOnDisk(state, path) ?? "");
    const start = offsetOf(target.text, target.eol, edit.range.start);
    const end = offsetOf(target.text, target.eol, edit.range.end);
    target.undo.push(target.text);
    state.applied.push(edit);
    const inserted = edit.text.replace(/\r\n|\n/g, target.eol);
    setText(state, target, target.text.slice(0, start) + inserted + target.text.slice(end), {
      range: edit.range,
      text: edit.text,
    });
  }
  return true;
}

function statOf(state: State, path: string): FileStatLike | undefined {
  const found = resolve(state, path);
  if (!found) return undefined;
  const type = (found.entry.kind === "file" ? FILE : DIRECTORY) | (found.link ? SYMBOLIC_LINK : 0);
  if (found.entry.kind === "folder") return { type, size: 0 };
  return {
    type,
    size: found.entry.bytes.length,
    ...(found.entry.readOnly ? { permissions: READONLY } : {}),
  };
}

function findNow(
  state: State,
  include: MemoryRelativePattern,
  exclude: string | null | undefined,
): MemoryUri[] {
  const base = include.baseUri.path;
  const included = globToRegExp(include.pattern);
  const excluded =
    typeof exclude === "string" && exclude !== "" ? globToRegExp(exclude) : undefined;
  const found: MemoryUri[] = [];
  for (const [path, entry] of state.entries) {
    if (entry.kind === "folder" || !below(path, base)) continue;
    // a link is found like a file where it leads to one
    if (entry.kind === "link" && resolve(state, path)?.entry.kind !== "file") continue;
    const relative = path.slice(base === "/" ? 1 : base.length + 1);
    if (!included.test(relative) || excluded?.test(relative)) continue;
    if (exclude !== null && excludedBySetting(relative)) continue;
    found.push(MemoryUri.file(path));
  }
  return found;
}

function notFound(path: string): Error {
  return new Error(`EntryNotFound (FileSystemError): Unable to resolve nonexistent file '${path}'`);
}

function fileSystem(state: State): BoardVsCodeLike<MemoryUri>["workspace"]["fs"] {
  return {
    stat(uri) {
      state.calls.stat.push(uri.path);
      const stat = statOf(state, uri.path);
      return stat ? Promise.resolve(stat) : Promise.reject(notFound(uri.path));
    },
    readFile(uri) {
      state.calls.readFile.push(uri.path);
      const found = resolve(state, uri.path);
      return found?.entry.kind === "file"
        ? Promise.resolve(found.entry.bytes.slice())
        : Promise.reject(notFound(uri.path));
    },
    writeFile(uri, content) {
      state.calls.writeFile.push(uri.path);
      // through a link the bytes land where the link leads
      const real = resolve(state, parentOf(uri.path));
      const name = uri.path.slice(uri.path.lastIndexOf("/") + 1);
      writeDisk(state, real ? `${real.path === "/" ? "" : real.path}/${name}` : uri.path, content);
      return Promise.resolve();
    },
    createDirectory(uri) {
      state.calls.createDirectory.push(uri.path);
      makeFolders(state, uri.path);
      return Promise.resolve();
    },
  };
}

function watcherOf(state: State, pattern: GlobLike): FileWatcherLike<MemoryUri> {
  if (!(pattern instanceof MemoryRelativePattern)) {
    throw new Error("The pattern was not built with this fake's RelativePattern.");
  }
  const included = globToRegExp(pattern.pattern);
  const watcher: Watcher = {
    base: pattern.baseUri.path,
    matches: (path) => included.test(path),
    listeners: { created: new Set(), changed: new Set(), deleted: new Set() },
  };
  state.watchers.add(watcher);
  const on =
    (event: WatchEvent) =>
    (listener: (uri: MemoryUri) => unknown): DisposableLike => {
      watcher.listeners[event].add(listener);
      return { dispose: () => watcher.listeners[event].delete(listener) };
    };
  return {
    onDidCreate: on("created"),
    onDidChange: on("changed"),
    onDidDelete: on("deleted"),
    dispose: () => state.watchers.delete(watcher),
  };
}

function openTextDocument(state: State, uri: MemoryUri): Promise<TextDocumentLike> {
  state.calls.openTextDocument.push(uri.path);
  const open = state.documents.get(uri.toString());
  if (open) return Promise.resolve(open.document);
  // VS Code reads the file in another process: the answer is never in the task that asked
  return Promise.resolve().then(() => {
    const meanwhile = state.documents.get(uri.toString());
    if (meanwhile) return meanwhile.document;
    const text = textOnDisk(state, uri.path);
    if (text === undefined) {
      throw new Error(`cannot open ${uri.toString()}. Detail: Unable to read file '${uri.path}'`);
    }
    return documentOf(state, uri.path, text).document;
  });
}

function applyEdit(state: State, edit: WorkspaceEditLike): Promise<boolean> {
  if (!(edit instanceof MemoryWorkspaceEdit)) {
    return Promise.reject(new Error("The edit was not built with this fake's WorkspaceEdit."));
  }
  // The version each document has NOW travels with the edit: it is what the extension host knew
  // when it asked, and a document it had not open travels without one.
  const stamped = edit.edits.map((each) => {
    const version = state.documents.get(each.uri.toString())?.version;
    return version === undefined ? each : { ...each, version };
  });
  return new Promise<boolean>((resolve) => {
    const apply = (): void => resolve(applyNow(state, stamped));
    if (state.heldEdits) state.heldEdits.push(apply);
    else queueMicrotask(apply);
  });
}

function workspaceOf(state: State): MemoryVsCodeNamespace["workspace"] {
  return {
    get workspaceFolders() {
      return state.folders.length > 0 ? state.folders.map((uri) => ({ uri })) : undefined;
    },
    getWorkspaceFolder(uri) {
      const inside = state.folders
        .filter((folder) => folder.path === uri.path || below(uri.path, folder.path))
        .sort((one, other) => other.path.length - one.path.length)[0];
      return inside ? { uri: inside } : undefined;
    },
    onDidChangeWorkspaceFolders: (listener) => state.foldersChanged.event(() => listener()),
    findFiles(include, exclude) {
      if (!(include instanceof MemoryRelativePattern)) {
        return Promise.reject(
          new Error("The pattern was not built with this fake's RelativePattern."),
        );
      }
      state.calls.findFiles.push({ base: include.baseUri.path, pattern: include.pattern, exclude });
      return new Promise<MemoryUri[]>((resolve) => {
        const answer = (): void => resolve(findNow(state, include, exclude));
        if (state.heldSearches) state.heldSearches.push(answer);
        else queueMicrotask(answer);
      });
    },
    createFileSystemWatcher: (pattern) => watcherOf(state, pattern),
    onDidCreateFiles: state.created.event,
    onDidDeleteFiles: state.deleted.event,
    onDidRenameFiles: state.renamed.event,
    openTextDocument: (uri) => openTextDocument(state, uri),
    onDidChangeTextDocument: state.changed.event,
    onDidCloseTextDocument: state.closed.event,
    applyEdit: (edit) => applyEdit(state, edit),
    fs: fileSystem(state),
  };
}

/** the namespace a backend is handed: `BoardVsCodeLike` with the fake's own classes */
export interface MemoryVsCodeNamespace extends BoardVsCodeLike<MemoryUri> {
  readonly workspace: BoardVsCodeLike<MemoryUri>["workspace"] & {
    readonly workspaceFolders: ReadonlyArray<{ readonly uri: MemoryUri }> | undefined;
  };
  readonly Uri: typeof MemoryUri;
  readonly Range: typeof MemoryRange;
  readonly WorkspaceEdit: typeof MemoryWorkspaceEdit;
  readonly RelativePattern: typeof MemoryRelativePattern;
}

/** another program at the disk: Git, a shell, a formatter. Watchers hear of it, VS Code's file events do not */
export interface MemoryDisk {
  /** makes or replaces a file, with the folders above it */
  write(path: string, content: string | Uint8Array): void;
  folder(path: string): void;
  /** a symbolic link at `path` that leads to `target`, a file or a folder */
  link(path: string, target: string): void;
  /**
   * A file of a read-only file system: `stat` says so and an edit is refused. A file whose mode
   * forbids writing is none of that to an extension: VS Code tells no permission of it, takes
   * the edit, and fails the save.
   */
  readOnly(path: string): void;
  /**
   * A file, or a folder with all below it, as `rm -r` removes it. The watchers hear one word,
   * that of the entry itself: VS Code folds the files of a folder that went into the folder.
   */
  remove(path: string): void;
  /**
   * A rename: a file is named at both ends, a folder only as a folder, never its files. A
   * document of a file that moved away stays open, as that of a file that was removed does.
   */
  move(from: string, to: string): void;
  /** what `change` does to the disk reaches no watcher: one that is late, or kept off a folder */
  unwatched(change: () => void): void;
  text(path: string): string | undefined;
  has(path: string): boolean;
}

/** what a person does to files in VS Code's explorer: the file events fire, once for a folder */
export interface MemoryExplorer {
  create(path: string, content?: string): void;
  /** a pasted folder: one created entry, and to the watchers a folder that names none of its files */
  paste(from: string, to: string): void;
  delete(path: string): void;
  rename(from: string, to: string): void;
}

export interface MemoryVsCode {
  readonly vscode: MemoryVsCodeNamespace;
  readonly disk: MemoryDisk;
  readonly explorer: MemoryExplorer;
  /** the open document of a file, undefined while VS Code has none */
  document(path: string): MemoryDocument | undefined;
  /** a person types in a text editor, or a formatter runs: the whole text is another one */
  type(path: string, text: string): void;
  /** VS Code's undo in the file's own editor; false with nothing to undo */
  undo(path: string): boolean;
  /** the file's text again, thrown-away changes and all; the document is clean after it */
  revert(path: string): void;
  /** the person saves: the disk has the text, and the change event carries no content change */
  save(path: string): void;
  /**
   * VS Code lets go of a clean document that no editor shows, as it does about three minutes
   * after the last `openTextDocument`. Throws for a dirty one, which VS Code never lets go of.
   */
  closeDocument(path: string): void;
  setWorkspaceFolders(paths: readonly string[]): void;
  /** holds every edit from now on until the returned function runs: VS Code applies it later than asked */
  holdEdits(): () => void;
  /** holds the answer of every search from now on until the returned function runs */
  holdSearches(): () => void;
  /** every replacement VS Code applied, in order */
  readonly applied: readonly MemoryTextEdit[];
  readonly calls: MemoryCalls;
  /** what a listener threw, which VS Code logs */
  readonly errors: readonly unknown[];
  /** how many listeners and watchers are subscribed now: what a host that ended left behind */
  listening(): { documents: number; files: number; folders: number; watchers: number };
}

function diskOf(state: State): MemoryDisk {
  return {
    write(path, content) {
      writeDisk(state, path, typeof content === "string" ? encoder.encode(content) : content);
    },
    folder(path) {
      for (const folder of makeFolders(state, path)) watch(state, "created", folder);
    },
    link(path, target) {
      makeFolders(state, parentOf(path));
      state.entries.set(path, { kind: "link", target });
      watch(state, "created", path);
    },
    readOnly(path) {
      const entry = state.entries.get(path);
      if (entry?.kind === "file") entry.readOnly = true;
    },
    remove(path) {
      removeDisk(state, path);
      watch(state, "deleted", path);
    },
    move(from, to) {
      moveDisk(state, from, to);
      watch(state, "deleted", from);
      watch(state, "created", to);
    },
    unwatched(change) {
      state.quiet = true;
      try {
        change();
      } finally {
        state.quiet = false;
      }
    },
    text: (path) => textOnDisk(state, path),
    has: (path) => resolve(state, path) !== undefined,
  };
}

function explorerOf(state: State): MemoryExplorer {
  return {
    create(path, content) {
      if (content === undefined) makeFolders(state, path);
      else writeDisk(state, path, encoder.encode(content));
      state.created.fire({ files: [MemoryUri.file(path)] });
    },
    paste(from, to) {
      const copied = [...state.entries].filter(([path]) => path === from || below(path, from));
      makeFolders(state, parentOf(to));
      for (const [path, entry] of copied) state.entries.set(to + path.slice(from.length), entry);
      state.created.fire({ files: [MemoryUri.file(to)] });
      watch(state, "created", to);
    },
    delete(path) {
      // to the bin in one move: the watchers hear of the folder and of none of its files
      closeClean(state, removeDisk(state, path));
      state.deleted.fire({ files: [MemoryUri.file(path)] });
      watch(state, "deleted", path);
    },
    rename(from, to) {
      // VS Code moves a file's document with it: the one of the old path is let go of
      closeClean(state, moveDisk(state, from, to));
      state.renamed.fire({ files: [{ oldUri: MemoryUri.file(from), newUri: MemoryUri.file(to) }] });
      watch(state, "deleted", from);
      watch(state, "created", to);
    },
  };
}

function hold(queue: "heldEdits" | "heldSearches", state: State): () => void {
  const waiting: Array<() => void> = [];
  state[queue] = waiting;
  return () => {
    if (state[queue] === waiting) state[queue] = undefined;
    for (const run of waiting.splice(0)) run();
  };
}

function documentsOf(
  state: State,
): Pick<MemoryVsCode, "document" | "type" | "undo" | "revert" | "save" | "closeDocument"> {
  const open = (path: string): DocumentState => {
    const found = state.documents.get(keyOf(path));
    if (!found) throw new Error(`${path} has no open document`);
    return found;
  };
  return {
    document: (path) => state.documents.get(keyOf(path))?.document,
    type(path, text) {
      const found = open(path);
      found.undo.push(found.text);
      setText(state, found, text, { text });
    },
    undo(path) {
      const found = open(path);
      const before = found.undo.pop();
      if (before === undefined) return false;
      setText(state, found, before, { undo: true });
      return true;
    },
    revert(path) {
      const found = open(path);
      const text = textOnDisk(state, path) ?? "";
      if (found.text !== text) setText(state, found, text, { text });
    },
    save(path) {
      const found = open(path);
      const bytes = encoder.encode(found.text);
      const entry = state.entries.get(path);
      makeFolders(state, parentOf(path));
      state.entries.set(path, { kind: "file", bytes, readOnly: false });
      found.dirty = false;
      state.changed.fire({ document: found.document, contentChanges: [] });
      watch(state, entry ? "changed" : "created", path);
    },
    closeDocument(path) {
      const found = open(path);
      if (found.dirty) throw new Error(`${path} is dirty: VS Code keeps a dirty document`);
      closeDocument(state, found);
    },
  };
}

/** `files`: the disk at the start, a text per absolute path */
export function createMemoryVsCode(
  files: Record<string, string> = {},
  options: { workspaceFolders?: readonly string[] | undefined } = {},
): MemoryVsCode {
  const errors: unknown[] = [];
  const state: State = {
    entries: new Map(),
    documents: new Map(),
    watchers: new Set(),
    calls: {
      stat: [],
      readFile: [],
      writeFile: [],
      createDirectory: [],
      openTextDocument: [],
      findFiles: [],
    },
    applied: [],
    errors,
    changed: new Emitter(errors),
    closed: new Emitter(errors),
    created: new Emitter(errors),
    deleted: new Emitter(errors),
    renamed: new Emitter(errors),
    foldersChanged: new Emitter(errors),
    folders: (options.workspaceFolders ?? []).map((path) => MemoryUri.file(path)),
    quiet: false,
    heldEdits: undefined,
    heldSearches: undefined,
  };
  for (const [path, text] of Object.entries(files)) {
    makeFolders(state, parentOf(path));
    state.entries.set(path, { kind: "file", bytes: encoder.encode(text), readOnly: false });
  }
  for (const folder of state.folders) makeFolders(state, folder.path);
  return {
    vscode: {
      workspace: workspaceOf(state),
      Uri: MemoryUri,
      Range: MemoryRange,
      WorkspaceEdit: MemoryWorkspaceEdit,
      RelativePattern: MemoryRelativePattern,
    },
    disk: diskOf(state),
    explorer: explorerOf(state),
    ...documentsOf(state),
    setWorkspaceFolders(paths) {
      state.folders = paths.map((path) => MemoryUri.file(path));
      for (const folder of state.folders) makeFolders(state, folder.path);
      state.foldersChanged.fire();
    },
    holdEdits: () => hold("heldEdits", state),
    holdSearches: () => hold("heldSearches", state),
    applied: state.applied,
    calls: state.calls,
    errors,
    listening: () => ({
      documents: state.changed.size + state.closed.size,
      files: state.created.size + state.deleted.size + state.renamed.size,
      folders: state.foldersChanged.size,
      watchers: state.watchers.size,
    }),
  };
}
