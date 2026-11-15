/**
 * A model's text as VS Code keeps it: the file's text document. The board reads it and writes
 * it there, so the file turns dirty and is saved by the person, and its undo history, a text
 * editor beside the board, Git and the file's own modeler all work on the same text.
 *
 * VS Code owns the document. It lets go of a clean one that no editor shows a few minutes after
 * it was opened, and the object is dead from then on: none is kept across its close event, and
 * the next write opens the document anew. Nothing here saves.
 */
import type { BackendText } from "@miragon/board-files";
import {
  createDocumentWriter,
  type DisposableLike,
  type DocumentWriter,
  type TextDocumentLike,
} from "@miragon/modeler-shell/vscode/extension";

import type { FileEvent } from "./file-index.js";
import { behindLink } from "./root.js";
import {
  FILE,
  READONLY,
  SYMBOLIC_LINK,
  type BoardUriLike,
  type BoardVsCodeLike,
} from "./vscode-like.js";

/**
 * The largest file a board opens as a model. Every change of a model crosses to the page and
 * back as a whole text; the models of the suite are a few kilobytes.
 */
export const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;

type DocumentsVsCodeLike<Uri extends BoardUriLike> = Pick<
  BoardVsCodeLike<Uri>,
  "Range" | "WorkspaceEdit"
> & {
  readonly workspace: Pick<
    BoardVsCodeLike<Uri>["workspace"],
    "applyEdit" | "openTextDocument" | "onDidChangeTextDocument" | "onDidCloseTextDocument"
  > & { readonly fs: Pick<BoardVsCodeLike<Uri>["workspace"]["fs"], "stat"> };
};

/**
 * Whether a text is more than `limit` bytes as UTF-8. Counted only where the length leaves it
 * open: a UTF-16 unit is one to three bytes, and each half of a pair two.
 */
export function exceedsBytes(text: string, limit: number): boolean {
  if (text.length > limit) return true;
  if (text.length * 3 <= limit) return false;
  let bytes = 0;
  for (let at = 0; at < text.length; at += 1) {
    const unit = text.charCodeAt(at);
    bytes += unit < 0x80 ? 1 : unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff) ? 2 : 3;
  }
  return bytes > limit;
}

/** a text of the backend, and what the backend tells it about its file */
export interface DocumentText<Uri> extends BackendText {
  /** the watcher's word, or VS Code's, about the file of this text */
  file(event: FileEvent): void;
  /** the repository root is another one: the path names this file now, or none */
  moved(uri: Uri | undefined): void;
}

interface Opened {
  readonly document: TextDocumentLike;
  readonly readOnly: boolean;
}

/**
 * The document of a file a board may open, or the reason it may not, as a node shows it. What
 * the path's text cannot say is checked here: that no folder on the way is a link and that the
 * file is none (a link may lead out of the repository), that there is a file, and its size,
 * before VS Code reads it. The way comes first: behind a link nothing is asked about a file.
 */
async function openChecked<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  uri: Uri,
): Promise<Opened> {
  if (await behindLink(vscode, uri, path)) {
    throw new Error(`${path} is behind a link, and a board opens no link`);
  }
  const stat = await Promise.resolve(vscode.workspace.fs.stat(uri)).catch(() => undefined);
  if (!stat) throw new Error(`${path} does not exist`);
  if ((stat.type & SYMBOLIC_LINK) !== 0) {
    throw new Error(`${path} is a link, and a board opens no link`);
  }
  if ((stat.type & FILE) === 0) throw new Error(`${path} is no file`);
  if (stat.size > TEXT_LIMIT_BYTES) {
    throw new Error(
      `${path} is larger than ${TEXT_LIMIT_BYTES / 1024 / 1024} MiB, too large for a board`,
    );
  }
  const document = await Promise.resolve(vscode.workspace.openTextDocument(uri)).catch(
    () => undefined,
  );
  if (!document) throw new Error(`${path} cannot be read as a text`);
  return { document, readOnly: ((stat.permissions ?? 0) & READONLY) !== 0 };
}

/** the state of one open text; a function of its own for each thing that happens to it */
interface Held<Uri> {
  /** the file the path names under the root of the moment; none without a root */
  place: Uri | undefined;
  /**
   * The document's own URI as a text, which is how its events are told from another file's. VS
   * Code names a file in one way where the disk folds case, and that need not be the way the
   * board's path spells it: `place` until a document says otherwise.
   */
  key: string;
  /** counts the places: what was asked of an earlier one is dropped when it answers */
  home: number;
  /** undefined from the document's close event until it is opened again */
  document: TextDocumentLike | undefined;
  /** the writer of `document`: a new document gets a new one, it diffs against its lines */
  writer: DocumentWriter | undefined;
  /** the text of the document when it was last seen: at hand while VS Code has it closed */
  last: string;
  /** the text the page has: the last one the server was handed, or the last one it wrote here */
  told: string;
  gone: boolean;
  closed: boolean;
  loading: Promise<TextDocumentLike> | undefined;
  readonly change: Set<(text: string) => void>;
  readonly went: Set<() => void>;
}

function adopt<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  held: Held<Uri>,
  document: TextDocumentLike,
): void {
  held.last = document.getText();
  if (held.document === document) return;
  held.document = document;
  held.key = document.uri.toString();
  held.writer = createDocumentWriter(vscode, document);
}

function tellChange<Uri>(held: Held<Uri>, text: string): void {
  held.told = text;
  for (const listener of [...held.change]) listener(text);
}

function tellGone<Uri>(held: Held<Uri>): void {
  if (held.gone) return;
  held.gone = true;
  for (const listener of [...held.went]) listener();
}

/** the document read anew, with every check of the first open; one read at a time */
function load<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  held: Held<Uri>,
): Promise<TextDocumentLike> {
  const { place, home } = held;
  if (!place) return Promise.reject(new Error(`${path} has no repository to be in`));
  if (held.loading) return held.loading;
  const loading: Promise<TextDocumentLike> = openChecked(vscode, path, place)
    .then(({ document }) => {
      if (held.closed || held.home !== home) throw new Error(`${path} was let go of`);
      adopt(vscode, held, document);
      return document;
    })
    .finally(() => {
      // a text that moved meanwhile reads its new file, and that read is not this one's to end
      if (held.loading === loading) held.loading = undefined;
    });
  held.loading = loading;
  return loading;
}

/** the file is back, or is another one under a new root: its text is told, whatever it is */
async function comeBack<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  held: Held<Uri>,
): Promise<void> {
  const document = await load(vscode, path, held).catch(() => undefined);
  // not there after all, or no file a board opens: the text stays gone
  if (!document || held.closed || !held.gone) return;
  held.gone = false;
  tellChange(held, document.getText());
}

/** the file changed while VS Code had no document of it: read again, told when it is news */
async function readAgain<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  held: Held<Uri>,
): Promise<void> {
  const document = await load(vscode, path, held).catch(() => undefined);
  if (!document || held.closed || held.gone) return;
  const text = document.getText();
  if (text !== held.told) tellChange(held, text);
}

async function write<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  held: Held<Uri>,
  text: string,
  base: string,
): Promise<boolean> {
  if (held.closed || held.gone) return false;
  // A board opens no model above the limit, so it writes none: saved, the file would open on no
  // board again. Refused like any write, and the page is then told the text the document has.
  if (exceedsBytes(text, TEXT_LIMIT_BYTES)) return false;
  const document = held.document ?? (await load(vscode, path, held).catch(() => undefined));
  const { writer } = held;
  if (!document || !writer || held.document !== document) return false;
  // Asked in the task that hands VS Code the edit: a document that has another text than the one
  // this write was made on holds a change nobody was told of, and the write would replace it.
  let made = true;
  const applied = await writer.write(
    (current) => {
      made = current === base;
      return made ? text : undefined;
    },
    { suppressEcho: true },
  );
  if (!made || !applied) return false;
  // the page has this text now: it wrote it
  held.told = held.document === document ? document.getText() : held.last;
  return true;
}

function listen<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  held: Held<Uri>,
): DisposableLike[] {
  return [
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (held.key === "" || event.document.uri.toString() !== held.key) return;
      // a save or a change of the dirty state: the text is the one it was
      if (event.contentChanges.length === 0) return;
      // whoever opened the document again, this is the one that lives
      adopt(vscode, held, event.document);
      // The echo of an own write is no news: told, it would be a new version of the text, and
      // the page's next edit, made before it heard, would be dropped.
      if (held.writer?.consumeEcho()) return;
      // a document without a file is written by somebody else; the file's return tells its text
      if (!held.gone) tellChange(held, held.last);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document !== held.document) return;
      held.document = undefined;
      held.writer = undefined;
    }),
  ];
}

/**
 * Opens the text of `path`, the file at `uri`. Rejects with a message a node can show for a
 * file that is behind a link or is one, is not there, is no file, is too large or is no text.
 */
export async function openDocumentText<Uri extends BoardUriLike>(
  vscode: DocumentsVsCodeLike<Uri>,
  path: string,
  uri: Uri,
): Promise<DocumentText<Uri>> {
  const first = await openChecked(vscode, path, uri);
  const text = first.document.getText();
  const held: Held<Uri> = {
    place: uri,
    key: uri.toString(),
    home: 0,
    document: undefined,
    writer: undefined,
    last: text,
    told: text,
    gone: false,
    closed: false,
    loading: undefined,
    change: new Set(),
    went: new Set(),
  };
  adopt(vscode, held, first.document);
  const subscriptions = listen(vscode, held);
  return {
    readOnly: first.readOnly,
    text() {
      held.told = held.document ? held.document.getText() : held.last;
      return held.told;
    },
    write: (next, base) => write(vscode, path, held, next, base),
    onChange(listener) {
      held.change.add(listener);
      return () => void held.change.delete(listener);
    },
    onGone(listener) {
      held.went.add(listener);
      return () => void held.went.delete(listener);
    },
    close() {
      held.closed = true;
      for (const subscription of subscriptions.splice(0)) subscription.dispose();
      held.document = undefined;
      held.writer = undefined;
      held.change.clear();
      held.went.clear();
    },
    file(event) {
      if (held.closed) return;
      if (event === "deleted") tellGone(held);
      else if (held.gone) void comeBack(vscode, path, held);
      // An open document is the text: VS Code reads a clean one again itself and says so, and a
      // dirty one keeps what the person has not saved.
      else if (!held.document) void readAgain(vscode, path, held);
    },
    moved(next) {
      if (held.closed || next?.toString() === held.place?.toString()) return;
      held.home += 1;
      held.place = next;
      held.key = next?.toString() ?? "";
      held.document = undefined;
      held.writer = undefined;
      held.loading = undefined;
      tellGone(held);
      if (next) void comeBack(vscode, path, held);
    },
  };
}
