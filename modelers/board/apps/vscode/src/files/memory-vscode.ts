/**
 * VS Code's workspace in memory, as far as the files backend uses it: a disk with folders and
 * links, text documents with VS Code's life (opened on demand, dirty after an edit, let go of
 * while clean, saved by a person, by auto save or by an extension), workspace edits that carry
 * the version they were made on, a search, watchers, VS Code's own file gestures, the workspace
 * folders, the commands and the diagnostics of the Problems view. It stands where `vscode`
 * stands in the unit tests and in a test page, and imports nothing of Node or of a page.
 *
 * Every behaviour here is one the backend depends on. Each was read from VS Code's typings and
 * source first: `test/memory-vscode.test.ts` holds each as a sentence, and the board's guide
 * says how a real VS Code then showed it. Where one differed, the fake says what was seen.
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
  MANUAL_SAVE,
  READONLY,
  SYMBOLIC_LINK,
  type BoardVsCodeLike,
  type FileStatLike,
  type FileWatcherLike,
  type GlobLike,
  type RelativePatternLike,
  type WillSaveEventLike,
} from "./vscode-like.js";

/** `vscode.TextDocumentSaveReason.AfterDelay`: auto save */
export const AFTER_DELAY_SAVE = 2;

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

/** `vscode.DiagnosticSeverity` */
export enum MemoryDiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

/** `vscode.Diagnostic`: an entry of the Problems view */
export class MemoryDiagnostic {
  source?: string;

  constructor(
    readonly range: RangeLike,
    readonly message: string,
    readonly severity: MemoryDiagnosticSeverity = MemoryDiagnosticSeverity.Error,
  ) {}
}

/** `vscode.DiagnosticCollection`: what one owner tells the Problems view, by document */
export class MemoryDiagnosticCollection {
  private readonly entries = new Map<string, readonly MemoryDiagnostic[]>();
  disposed = false;

  constructor(readonly name: string) {}

  /** an empty list takes the document's entry away, as VS Code does it */
  set(uri: MemoryUri, diagnostics: readonly MemoryDiagnostic[]): void {
    if (diagnostics.length === 0) this.entries.delete(uri.toString());
    else this.entries.set(uri.toString(), [...diagnostics]);
  }

  get(uri: MemoryUri): readonly MemoryDiagnostic[] | undefined {
    return this.entries.get(uri.toString());
  }

  has(uri: MemoryUri): boolean {
    return this.entries.has(uri.toString());
  }

  delete(uri: MemoryUri): void {
    this.entries.delete(uri.toString());
  }

  clear(): void {
    this.entries.clear();
  }

  /** the documents with an entry, as their URIs print */
  get documents(): string[] {
    return [...this.entries.keys()];
  }

  dispose(): void {
    this.disposed = true;
    this.entries.clear();
  }
}

/** a text document as VS Code hands it out; `text` and the flags are the fake's to move */
export interface MemoryDocument extends TextDocumentLike {
  readonly uri: MemoryUri;
  /** 1 for a document that was just opened, one more with every change of its text */
  readonly version: number;
  readonly isDirty: boolean;
  /** true from the close event on: the object is dead, the next open makes another */
  readonly isClosed: boolean;
  /**
   * An extension saves the document: VS Code's own save, with the reason Manual. False where
   * the file on disk is newer than the document, and VS Code then says so in a notification.
   */
  save(): Promise<boolean>;
}

interface DocumentState {
  readonly document: MemoryDocument;
  eol: "\n" | "\r\n";
  text: string;
  version: number;
  dirty: boolean;
  closed: boolean;
  /** another program wrote the file while the document had unsaved text */
  newerOnDisk: boolean;
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
  readonly opened: Emitter<TextDocumentLike>;
  readonly closed: Emitter<TextDocumentLike>;
  readonly willSave: Emitter<WillSaveEventLike>;
  readonly saved: Emitter<TextDocumentLike>;
  /** the commands an extension registered, by name */
  readonly commands: Map<string, (...rest: unknown[]) => unknown>;
  /** every command that was asked for, as `[command, ...arguments]` */
  readonly executed: unknown[][];
  /** the commands a test makes fail, each with what VS Code rejects with */
  readonly failing: Map<string, unknown>;
  /** the notifications VS Code showed of its own accord */
  readonly notices: string[];
  readonly collections: MemoryDiagnosticCollection[];
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
    else source += char.replace(/[.+^$()|[\]{}\\]/g, "\\$&");
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

/**
 * The line break of a document VS Code reads: a carriage return with a line feed where more
 * than half of the text's line breaks carry a carriage return, with or without its line feed,
 * else a line feed alone, which is also what a text without a line break gets on Linux.
 */
function lineBreakOf(text: string): "\n" | "\r\n" {
  const breaks = text.match(/\r\n|\r|\n/g) ?? [];
  const withReturn = breaks.filter((one) => one !== "\n").length;
  return withReturn > breaks.length / 2 ? "\r\n" : "\n";
}

/**
 * A text as a document of VS Code holds it: every line break is the document's one, a carriage
 * return that stands alone included. So the text of a document is not always the text of its
 * file, and no document ever holds a lone carriage return (seen in VS Code 1.146 and 1.96).
 */
const withLineBreak = (text: string, eol: string): string => text.replace(/\r\n|\r|\n/g, eol);

/** the text of a file as the document VS Code opens on it has it */
const asDocument = (text: string): string => withLineBreak(text, lineBreakOf(text));

/**
 * What the watchers hear of entries that moved, as one batch: the new names came, then the old
 * ones went. VS Code hands an extension the created entries of a batch before the deleted ones.
 */
function watchMoves(state: State, moves: ReadonlyArray<readonly [from: string, to: string]>): void {
  for (const [, to] of moves) watch(state, "created", to);
  for (const [from] of moves) watch(state, "deleted", from);
}

function documentOf(state: State, path: string, onDisk: string): DocumentState {
  const text = asDocument(onDisk);
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
    save: () =>
      // VS Code saves in another process: the answer is never in the task that asked
      Promise.resolve().then(() => !held.closed && saveNow(state, held, MANUAL_SAVE)),
  };
  const held: DocumentState = {
    document,
    eol: lineBreakOf(onDisk),
    text,
    version: 1,
    dirty: false,
    closed: false,
    newerOnDisk: false,
    undo: [],
  };
  state.documents.set(keyOf(path), held);
  state.opened.fire(document);
  return held;
}

function textOnDisk(state: State, path: string): string | undefined {
  const found = resolve(state, path);
  return found?.entry.kind === "file" ? decoder.decode(found.entry.bytes) : undefined;
}

/**
 * A text of the document that VS Code or a person made: one more version, and the event. A
 * clean document that turns unsaved says so apart: its change is told while it still calls
 * itself clean, and a second event without a content change follows once it is unsaved (seen in
 * VS Code 1.146 and 1.96).
 */
function setText(state: State, held: DocumentState, text: string, change: unknown): void {
  const wasClean = !held.dirty;
  held.text = text;
  held.version += 1;
  const onDisk = textOnDisk(state, held.document.uri.path);
  const dirty = onDisk === undefined || text !== asDocument(onDisk);
  // the text of the file again, as after a revert: nothing on the disk is newer than that
  if (!dirty) held.newerOnDisk = false;
  held.dirty = dirty && !wasClean;
  state.changed.fire({ document: held.document, contentChanges: [change] });
  if (held.dirty === dirty) return;
  held.dirty = dirty;
  state.changed.fire({ document: held.document, contentChanges: [] });
}

function closeDocument(state: State, held: DocumentState): void {
  state.documents.delete(held.document.uri.toString());
  held.closed = true;
  state.closed.fire(held.document);
}

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/**
 * VS Code's save, whoever asked for it. The listeners of will-save hear it first, with the
 * reason. VS Code looks at the disk only when it writes: a file that is newer there than the
 * document keeps its bytes, the document stays dirty, no did-save follows, and VS Code says so
 * itself. A save that went through fires the change event without a content change, for the
 * dirty state, and then did-save.
 */
function saveNow(state: State, held: DocumentState, reason: number): boolean {
  const { path } = held.document.uri;
  state.willSave.fire({ document: held.document, reason });
  if (held.newerOnDisk) {
    state.notices.push(`Failed to save '${nameOf(path)}': The content of the file is newer.`);
    return false;
  }
  const existed = state.entries.has(path);
  makeFolders(state, parentOf(path));
  state.entries.set(path, { kind: "file", bytes: encoder.encode(held.text), readOnly: false });
  held.dirty = false;
  state.changed.fire({ document: held.document, contentChanges: [] });
  state.saved.fire(held.document);
  watch(state, existed ? "changed" : "created", path);
  return true;
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
  const onDisk = decoder.decode(bytes);
  const text = asDocument(onDisk);
  // VS Code reads a clean document again when its file changes and leaves a dirty one alone.
  if (held && !held.dirty && held.text !== text) {
    held.eol = lineBreakOf(onDisk);
    setText(state, held, text, { text });
  } else if (held?.dirty && held.text !== text) held.newerOnDisk = true;
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

/**
 * The documents of files a person renamed in the Explorer, `from` and all below it. VS Code
 * moves a file's document with it: there is a document at the new path before the rename is
 * told, and the one of the old path is let go of. In the order VS Code tells it (seen in VS
 * Code 1.146 and 1.96). An unsaved document says that it is clean and closes, the new one opens
 * and then says that it is unsaved, with the unsaved text, all before the rename event. For a
 * clean document the new one opens before the event and the old one closes after it: those are
 * answered, for whoever tells the event to close them afterwards.
 */
function moveDocuments(
  state: State,
  files: readonly string[],
  from: string,
  to: string,
): DocumentState[] {
  const closedLater: DocumentState[] = [];
  for (const file of files) {
    const held = state.documents.get(keyOf(file));
    if (!held) continue;
    const target = to + file.slice(from.length);
    if (!held.dirty) {
      // the entry was moved already: the new document reads the file where it is now
      documentOf(state, target, textOnDisk(state, target) ?? held.text);
      closedLater.push(held);
      continue;
    }
    held.dirty = false;
    state.changed.fire({ document: held.document, contentChanges: [] });
    closeDocument(state, held);
    const moved = documentOf(state, target, held.text);
    moved.dirty = true;
    state.changed.fire({ document: moved.document, contentChanges: [] });
  }
  return closedLater;
}

/** closes the documents of old paths that a rename event left open, where they still are */
function closeLeft(state: State, left: readonly DocumentState[]): void {
  for (const held of left) {
    if (state.documents.get(held.document.uri.toString()) === held) closeDocument(state, held);
    else if (!held.closed) {
      held.closed = true;
      state.closed.fire(held.document);
    }
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
    const inserted = withLineBreak(edit.text, target.eol);
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
    onDidOpenTextDocument: state.opened.event,
    onDidChangeTextDocument: state.changed.event,
    onDidCloseTextDocument: state.closed.event,
    get textDocuments() {
      return [...state.documents.values()].map((held) => held.document);
    },
    onWillSaveTextDocument: state.willSave.event,
    onDidSaveTextDocument: state.saved.event,
    applyEdit: (edit) => applyEdit(state, edit),
    fs: fileSystem(state),
  };
}

/** the commands of VS Code's own that the fake takes: each is written down and does nothing */
const BUILT_IN_COMMANDS: ReadonlySet<string> = new Set([
  "vscode.open",
  "vscode.openWith",
  "revealFileInOS",
  "workbench.actions.view.problems",
]);

function commandsOf(state: State): MemoryVsCodeNamespace["commands"] {
  return {
    registerCommand(command, callback) {
      if (state.commands.has(command)) throw new Error(`command '${command}' already exists`);
      state.commands.set(command, callback);
      return {
        dispose: () => {
          if (state.commands.get(command) === callback) state.commands.delete(command);
        },
      };
    },
    executeCommand(command, ...rest) {
      state.executed.push([command, ...rest]);
      if (state.failing.has(command)) return Promise.reject(state.failing.get(command));
      const registered = state.commands.get(command);
      // a registered command runs in a later task, and what it throws rejects the call
      if (registered) return Promise.resolve().then(() => registered(...rest));
      return BUILT_IN_COMMANDS.has(command)
        ? Promise.resolve(undefined)
        : Promise.reject(new Error(`command '${command}' not found`));
    },
  };
}

/** the namespace a backend is handed: `BoardVsCodeLike` with the fake's own classes */
export interface MemoryVsCodeNamespace extends BoardVsCodeLike<MemoryUri> {
  readonly workspace: BoardVsCodeLike<MemoryUri>["workspace"] & {
    readonly workspaceFolders: ReadonlyArray<{ readonly uri: MemoryUri }> | undefined;
    /** VS Code has a document: one it read from a file, or one that moved with its file */
    onDidOpenTextDocument(listener: (document: TextDocumentLike) => unknown): DisposableLike;
    readonly textDocuments: readonly MemoryDocument[];
  };
  readonly commands: BoardVsCodeLike<MemoryUri>["commands"] & {
    /** throws for a name that is taken, as VS Code does */
    registerCommand(command: string, callback: (...rest: unknown[]) => unknown): DisposableLike;
  };
  readonly languages: {
    createDiagnosticCollection(name: string): MemoryDiagnosticCollection;
  };
  readonly Uri: typeof MemoryUri;
  readonly Range: typeof MemoryRange;
  readonly WorkspaceEdit: typeof MemoryWorkspaceEdit;
  readonly RelativePattern: typeof MemoryRelativePattern;
  readonly Diagnostic: typeof MemoryDiagnostic;
  readonly DiagnosticSeverity: typeof MemoryDiagnosticSeverity;
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
  /** a file or a folder gets another name or place: one event that names it at both ends */
  rename(from: string, to: string): void;
  /**
   * Several files or folders renamed by one edit (`WorkspaceEdit.renameFile`): one event that
   * names each of them, and the watchers hear of all of them afterwards.
   */
  move(moves: ReadonlyArray<readonly [from: string, to: string]>): void;
  /**
   * Several files or folders dragged onto a folder in one gesture. VS Code moves them one after
   * the other and tells the one event after the last, so by then the watchers have named every
   * entry but the last as one that went and one that came.
   */
  drag(moves: ReadonlyArray<readonly [from: string, to: string]>): void;
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
  /**
   * The person saves, or auto save does (`AFTER_DELAY_SAVE`): the disk has the text, and the
   * change event carries no content change. A clean document is saved too when a person asks.
   * False where the file on disk is newer than the document.
   */
  save(path: string, reason?: number): boolean;
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
  /** every command that was asked for, in order, as `[command, ...arguments]` */
  readonly executed: readonly unknown[][];
  /** `command` rejects with `error` from now on: VS Code could not do what it was asked */
  failCommand(command: string, error: unknown): void;
  /** the commands that are registered now, in the order they came */
  registeredCommands(): string[];
  /** the notifications VS Code showed of its own accord, such as a save that failed */
  readonly notices: readonly string[];
  /** the collections `languages.createDiagnosticCollection` handed out, the newest last */
  readonly diagnostics: readonly MemoryDiagnosticCollection[];
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
      watchMoves(state, [[from, to]]);
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
      this.move([[from, to]]);
    },
    move(moves) {
      const left = moves.flatMap(([from, to]) =>
        moveDocuments(state, moveDisk(state, from, to), from, to),
      );
      state.renamed.fire({ files: moves.map(bothEnds) });
      closeLeft(state, left);
      watchMoves(state, moves);
    },
    drag(moves) {
      const earlier = moves.slice(0, -1);
      const left: DocumentState[] = [];
      for (const [from, to] of earlier) {
        left.push(...moveDocuments(state, moveDisk(state, from, to), from, to));
        watchMoves(state, [[from, to]]);
      }
      const last = moves.slice(-1);
      for (const [from, to] of last) {
        left.push(...moveDocuments(state, moveDisk(state, from, to), from, to));
      }
      state.renamed.fire({ files: moves.map(bothEnds) });
      closeLeft(state, left);
      watchMoves(state, last);
    },
  };
}

const bothEnds = ([from, to]: readonly [string, string]): {
  oldUri: MemoryUri;
  newUri: MemoryUri;
} => ({
  oldUri: MemoryUri.file(from),
  newUri: MemoryUri.file(to),
});

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
    type(path, typed) {
      const found = open(path);
      const text = withLineBreak(typed, found.eol);
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
      const onDisk = textOnDisk(state, path) ?? "";
      const text = asDocument(onDisk);
      found.eol = lineBreakOf(onDisk);
      if (found.text === text) return;
      // VS Code calls the document clean before it tells the file's text, and then says once
      // more that it is clean, without a content change (seen in VS Code 1.146)
      found.dirty = false;
      setText(state, found, text, { text });
      state.changed.fire({ document: found.document, contentChanges: [] });
    },
    save: (path, reason = MANUAL_SAVE) => saveNow(state, open(path), reason),
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
    opened: new Emitter(errors),
    closed: new Emitter(errors),
    willSave: new Emitter(errors),
    saved: new Emitter(errors),
    commands: new Map(),
    executed: [],
    failing: new Map(),
    notices: [],
    collections: [],
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
      commands: commandsOf(state),
      languages: {
        createDiagnosticCollection(name) {
          const collection = new MemoryDiagnosticCollection(name);
          state.collections.push(collection);
          return collection;
        },
      },
      Uri: MemoryUri,
      Range: MemoryRange,
      WorkspaceEdit: MemoryWorkspaceEdit,
      RelativePattern: MemoryRelativePattern,
      Diagnostic: MemoryDiagnostic,
      DiagnosticSeverity: MemoryDiagnosticSeverity,
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
    executed: state.executed,
    failCommand: (command, error) => void state.failing.set(command, error),
    registeredCommands: () => [...state.commands.keys()],
    notices: state.notices,
    diagnostics: state.collections,
    listening: () => ({
      documents:
        state.changed.size +
        state.opened.size +
        state.closed.size +
        state.willSave.size +
        state.saved.size,
      files: state.created.size + state.deleted.size + state.renamed.size,
      folders: state.foldersChanged.size,
      watchers: state.watchers.size,
    }),
  };
}
