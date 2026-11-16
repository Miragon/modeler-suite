/**
 * The host's side of the protocol: a backend, the place that keeps the files, behind a channel.
 * The server checks every path a page sends before the backend sees it, first as a path and then
 * against the host's rule of what a board may reach, and what a message holds before it reads
 * it: the page is the side that is not trusted. A path is checked as a text (`paths.ts` says
 * what that leaves to a backend).
 */
import { isNewAssetPath, NEW_FILE_LIMIT_BYTES, pathProblem, type FilesRule } from "./paths.js";
import type { DropReason, FileMove } from "./port.js";
import {
  fromBase64,
  isBoardMessage,
  PROTOCOL,
  toBase64,
  type Channel,
  type ClientMessage,
  type HostMessage,
} from "./protocol.js";

/**
 * A rejection of `BackendText.write` that says why the place took nothing, so that the page can
 * say it in words: `too-large` for a text larger than the place takes.
 */
export class WriteRefusal extends Error {
  readonly reason: DropReason;

  constructor(reason: DropReason, message = `the write was refused (${reason})`) {
    super(message);
    this.name = "WriteRefusal";
    this.reason = reason;
  }
}

/** one text file as the place that keeps it has it */
export interface BackendText {
  readonly readOnly: boolean;
  text(): string;
  /**
   * Resolves true when the place took the write. Resolves false when the place has another text
   * than `base`, a change nobody was told of that the write would replace: the page is told
   * `crossed`. Rejects when the place took nothing for another reason: with a `WriteRefusal`
   * where it can say which, and any other rejection or throw is `refused`, a write the place did
   * not take without saying why. In each of these the server sends the page the text again where
   * it does not have it, and says once why its edit is not in the place. Never called on a
   * read-only text, and never before the write before it settled: a place gets the page's writes
   * one at a time, in the page's order.
   *
   * `base` is the text the write was made on: what `text()` answered or `onChange` told last,
   * whichever the server heard later.
   */
  write(text: string, base: string): Promise<boolean>;
  /**
   * Every change `write` did not make, the text of a file that is back after it went among
   * them, and never the echo of a write: each call is a new version of the text for the page,
   * and what the page wrote on the version before is dropped.
   */
  onChange(listener: (text: string) => void): () => void;
  /** the file went away; the text stays open, and `onChange` says when the file is back */
  onGone(listener: () => void): () => void;
  /** after the last write settled, also when the page went in the middle of one */
  close(): void;
}

/**
 * What an extension host, a plugin worker or a server implements: the files, with its own API.
 * Every path it is handed went through `repoPath`, and all but `showFile`'s through the host's
 * rule as well: `openText` gets models only, `readBytes` and `createFile` pictures only.
 */
export interface FilesBackend {
  /** every path the place has for a board; the page is told those the rule lets it reach */
  list(): readonly string[];
  onListChanged(listener: () => void): () => void;
  /** rejects for a file that is not there or is no text; the page is told the message */
  openText(path: string): Promise<BackendText>;
  /**
   * Undefined where there is no such file; a rejection is told the page as a failure. At most
   * `READS_AT_ONCE` calls are on their way at one time, and never two for one path unless the
   * place said in between that the path's bytes changed.
   */
  readBytes(path: string): Promise<{ bytes: Uint8Array; mime: string } | undefined>;
  /**
   * Stores a NEW file, always `assets/<name>`, and rejects when the path is in use. One call at
   * a time: the next comes when this one settled.
   */
  createFile(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  /**
   * Shows the file at `path` in an editor of the place's own, as the place opens any file, and
   * resolves once it is shown. The page gets nothing of the file. The path is any path inside
   * the root and outside its dot folders, whatever the host's rule says of it: a file no board
   * shows is what a page asks to have shown. What a path's text cannot say is the backend's to
   * check, as for a text: that there is such a file, and that no link is on the way to it. A
   * rejection is told the page as a failure, with the message. One call at a time. Absent where
   * the place has no editor to show a file in: the page is told so in the welcome and offers no
   * way to ask.
   */
  showFile?: ((path: string) => Promise<void>) | undefined;
  /**
   * Bytes that are new: a file that was created, changed, went or came. Told before the page
   * can ask for them again: a read that was on its way when this came is not joined by a later
   * one.
   */
  onBytesChanged(listener: (paths: readonly string[]) => void): () => void;
  /**
   * Files that have a new path, one move per file: a moved folder is told as the moves of the
   * files in it, in one call. The page is told the moves whose two paths the rule lets a board
   * reach. Tell a move before the old path's text says that its file is gone: a reader that
   * follows the move is then on the new path before it could show that.
   */
  onMoved(listener: (moves: readonly FileMove[]) => void): () => void;
}

/** reads the backend is asked at once; those behind them wait in the order they came */
export const READS_AT_ONCE = 4;

/**
 * Requests of one page that may wait for their answer at one time, of every kind together. One
 * more is failed at once, so a page cannot make the server keep more than this.
 */
export const WAITING_LIMIT = 4096;

const NO_HELLO = "the page has not said hello";
const OUTSIDE = "this path is outside the repository";
const HIDDEN = "a board reaches no dot file and no file in a dot folder";
const noModel = (path: string): string => `${path} is no model a board shows here`;
const noPicture = (path: string): string => `${path} is no picture a board shows here`;
const NO_ASSET = "a new file goes into assets/";
const NO_NAME = "a new file cannot have this name";
const NO_BYTES = "the bytes of the new file are no base64 text";
const TOO_LARGE = `a new file may have up to ${NEW_FILE_LIMIT_BYTES / 1024 / 1024} MiB`;
const NO_SHOW = "this host cannot show a file";
const BUSY = "too many requests are waiting for this host";
const BUSY_FILES = "too many new files are waiting to be stored";
const BUSY_SHOWS = "another file is being shown, try again in a moment";
/** base64 writes three bytes as four characters */
const BASE64_LIMIT = Math.ceil(NEW_FILE_LIMIT_BYTES / 3) * 4;
/** the base64 text the new files that wait for their turn may hold together: two of the largest */
export const HELD_FILES_LIMIT = 2 * BASE64_LIMIT;
/** the characters the edits that wait for their turn may hold together */
export const HELD_EDITS_LIMIT = 32 * 1024 * 1024;
/**
 * The edits of one page that may wait for their turn at one time, of every path together. One
 * more is not kept, neither its text nor a place in the line: when the writes of its path
 * settled it is an edit the place did not take.
 */
export const WAITING_EDITS_LIMIT = 4096;
/** files that may wait to be shown behind the one that is being shown */
export const SHOWS_WAITING = 1;

/** a text the page has open: one subscription, however many of the page's sessions read it */
interface Served {
  readonly text: BackendText;
  /** the place said that the file went away, and not yet that it is back */
  gone: boolean;
  /**
   * Counts what the page was told of this text: 1 with the opened text, one more with every
   * update. The page's edits do not count; each says which of these it was made on.
   */
  version: number;
  /** the text the place handed out last: what the next write is made on */
  known: string;
  readonly stop: Array<() => void>;
}

/** a path the page asked for: the place may still be opening it */
interface Asked {
  readonly pending: Promise<Served>;
  /** the text once the place opened it, so that a close can end it at once */
  served: Served | undefined;
  /** the page's writes of this path, one after the other and behind the open: the last of them */
  writing: Promise<void>;
  /** writes that came and have not settled */
  waiting: number;
  /** the version the write that settled last was made on, where the place refused that write */
  refusedOn: number | undefined;
  /**
   * An edit that is not in the place and that no later write made good, with the version a
   * refused one was made on: told to the page once the writes of the path settled.
   */
  lost: { reason: DropReason; on: number | undefined } | undefined;
  /** counts the edits of this path as they come: which of two came later */
  edits: number;
  /**
   * The last edit that got no place in the line because too many waited, with the version it
   * was made on. Undefined once an edit that came after it is in the place: the page made that
   * one from this one's text.
   */
  overflowed: { turn: number; version: unknown } | undefined;
}

/** one read of the backend, for every request that asked for the path while it was on its way */
interface Reading {
  readonly path: string;
  readonly askers: Array<{ requestId: number; life: number }>;
  /** handed to the backend: bytes that change from now on are not in its answer for certain */
  running: boolean;
}

interface Reads {
  /** the read a new request for its path joins; a running one whose bytes changed is not here */
  readonly joinable: Map<string, Reading>;
  /** not handed to the backend yet, oldest first */
  readonly waiting: Reading[];
  running: number;
}

/** a new file that waits for its turn, with its bytes as they came */
interface NewFile {
  readonly requestId: number;
  readonly life: number;
  readonly path: string;
  readonly base64: string;
  readonly mime: string;
}

interface Creates {
  readonly waiting: NewFile[];
  /** the base64 characters the waiting ones hold */
  held: number;
  running: boolean;
}

interface Shows {
  readonly waiting: Array<{ requestId: number; life: number; path: string }>;
  running: boolean;
}

/** what the server keeps: one object, so that the answer to each message is a function of its own */
interface Serving {
  readonly channel: Channel<HostMessage, ClientMessage>;
  readonly backend: FilesBackend;
  readonly rule: FilesRule;
  /** by path: a second open of a path waits for the first and opens nothing */
  readonly texts: Map<string, Asked>;
  /** settles once every write that came so far is dealt with, those of a closed text too */
  writes: Promise<void>;
  /** the characters of the edits that wait for their turn or are being written */
  heldEdits: number;
  /** the edits that wait for their turn or are being written, those of an earlier page included */
  waitingEdits: number;
  readonly reads: Reads;
  readonly creates: Creates;
  readonly shows: Shows;
  /** the requests of this life that wait for their answer */
  waiting: number;
  /** ends what a hello subscribed: the list, the bytes and the moves */
  stops: Array<() => void>;
  /**
   * Counts the lives of the page. A hello starts one, since a webview that was reloaded says
   * hello again, and `dispose` ends the last. An answer that was awaited across the end of its
   * life is never sent: the page that asked is gone, and the next one counts its requests from 1.
   */
  life: number;
  /** why no request is served: no hello yet, or one of another protocol; undefined once greeted */
  refusal: string | undefined;
  ended: boolean;
}

type MessageOf<Type extends ClientMessage["type"]> = Extract<ClientMessage, { type: Type }>;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const ignore = (): void => {};

const fail = (serving: Serving, requestId: number, message: string): void =>
  serving.channel.post({ type: "board.failed", requestId, message });

/**
 * Takes one more request to wait for its answer, or fails it where too many wait already. What
 * the server keeps of a page is bounded by this count.
 */
function admit(serving: Serving, requestId: number): boolean {
  if (serving.waiting >= WAITING_LIMIT) {
    fail(serving, requestId, BUSY);
    return false;
  }
  serving.waiting += 1;
  return true;
}

/** the request has its answer; one of a page that is gone was forgotten with that page */
function leave(serving: Serving, life: number): void {
  if (life === serving.life) serving.waiting -= 1;
}

/**
 * The path as a path of the repository, or undefined once the request was failed: for what is
 * no such path, and for a dot file or a dot folder.
 */
function inRepository(serving: Serving, path: unknown, requestId: number): string | undefined {
  const problem = pathProblem(path);
  if (problem === undefined) return path as string;
  fail(serving, requestId, problem === "hidden" ? HIDDEN : OUTSIDE);
  return undefined;
}

/**
 * The path as the backend may see it, or undefined once the request was failed: for what is no
 * path of the repository, for a dot file or a dot folder, and for a file the host's rule does
 * not let a board reach in this way.
 */
function checked(
  serving: Serving,
  path: unknown,
  requestId: number,
  as: "model" | "picture",
): string | undefined {
  const safe = inRepository(serving, path, requestId);
  if (safe === undefined) return undefined;
  if (as === "model" ? serving.rule.model(safe) : serving.rule.picture(safe)) return safe;
  fail(serving, requestId, as === "model" ? noModel(safe) : noPicture(safe));
  return undefined;
}

/** a path the page may be told of: one a board reaches, as a model or as a picture */
function reached(serving: Serving, path: string): boolean {
  const { rule } = serving;
  return pathProblem(path) === undefined && (rule.model(path) || rule.picture(path));
}

function release(served: Served): void {
  for (const stop of served.stop) stop();
  served.text.close();
}

/**
 * At once for an open text nobody writes. A text the place still opens is closed when it
 * arrives, and one with writes on their way after the last of them: what the page wrote before
 * it closed, or went, still lands.
 */
function closeAsked(asked: Asked): void {
  if (asked.served !== undefined && asked.waiting === 0) {
    release(asked.served);
    return;
  }
  void asked.writing.then(() => {
    if (asked.served !== undefined) release(asked.served);
  });
}

function endLife(serving: Serving): void {
  serving.life += 1;
  for (const stop of serving.stops) stop();
  serving.stops = [];
  for (const [, asked] of serving.texts) closeAsked(asked);
  serving.texts.clear();
  // What waited for its turn has nobody left to answer: a read is not made, a file is not shown,
  // and a new file is not stored, since no node will ever name it. What the backend already
  // works on runs to its end and is answered to nobody: the next page's read of such a path is
  // a read of its own, since nothing tells the server of bytes that change between two pages.
  const { reads, creates, shows } = serving;
  reads.joinable.clear();
  reads.waiting.length = 0;
  creates.waiting.length = 0;
  creates.held = 0;
  shows.waiting.length = 0;
  serving.waiting = 0;
}

function greet(serving: Serving, protocol: unknown): void {
  // whatever the page before this hello had open is closed with it
  endLife(serving);
  if (protocol !== PROTOCOL) {
    serving.refusal = `this host speaks protocol ${PROTOCOL}, the page said ${String(protocol)}`;
    return;
  }
  serving.refusal = undefined;
  const { backend, channel, reads } = serving;
  channel.post({ type: "board.welcome", shows: backend.showFile !== undefined });
  // The backend's word as the page may have it: no path a board does not reach is named to it.
  const told = (path: string): boolean => reached(serving, path);
  const sendPaths = (): void =>
    channel.post({ type: "board.paths", paths: backend.list().filter(told) });
  serving.stops = [
    backend.onListChanged(sendPaths),
    backend.onBytesChanged((changed) => {
      // A read that is with the backend may bring the bytes of before: a request that comes
      // from now on gets a read of its own.
      for (const path of changed) {
        if (reads.joinable.get(path)?.running === true) reads.joinable.delete(path);
      }
      const paths = changed.filter(told);
      if (paths.length > 0) channel.post({ type: "board.bytes.changed", paths });
    }),
    // a file that moved out of a board's reach is gone for the page, and its text says so
    backend.onMoved((moved) => {
      const moves = moved.filter((move) => told(move.from) && told(move.to));
      if (moves.length > 0) channel.post({ type: "board.moved", moves });
    }),
  ];
  sendPaths();
}

/**
 * A text of the place that the page did not write, or wrote in vain. It is the next version:
 * whatever the page writes before it hears of this one is made on a text the place has left.
 */
function tell(serving: Serving, path: string, served: Served, text: string): void {
  served.known = text;
  served.version += 1;
  serving.channel.post({ type: "board.text.update", path, text, version: served.version });
}

async function subscribe(serving: Serving, path: string): Promise<Served> {
  const text = await serving.backend.openText(path);
  const served: Served = { text, gone: false, version: 1, known: text.text(), stop: [] };
  served.stop.push(
    text.onChange((changed) => {
      // The place's word of a text it handed out already, as after a save: no new version, or
      // what the page wrote on that text meanwhile would be dropped for nothing.
      if (!served.gone && changed === served.known) return;
      served.gone = false;
      tell(serving, path, served, changed);
    }),
    text.onGone(() => {
      served.gone = true;
      serving.channel.post({ type: "board.text.gone", path });
    }),
  );
  return served;
}

function ask(serving: Serving, path: string): Asked {
  const pending = subscribe(serving, path);
  const asked: Asked = {
    pending,
    served: undefined,
    writing: Promise.resolve(),
    waiting: 0,
    refusedOn: undefined,
    lost: undefined,
    edits: 0,
    overflowed: undefined,
  };
  asked.writing = pending.then((opened) => void (asked.served = opened), ignore);
  serving.texts.set(path, asked);
  return asked;
}

async function openText(
  serving: Serving,
  message: MessageOf<"board.text.open">,
  life: number,
): Promise<void> {
  const { requestId } = message;
  const path = checked(serving, message.path, requestId, "model");
  if (path === undefined || !admit(serving, requestId)) return;
  const asked = serving.texts.get(path) ?? ask(serving, path);
  let served: Served;
  try {
    served = await asked.pending;
  } catch (error) {
    leave(serving, life);
    if (serving.texts.get(path) === asked) serving.texts.delete(path);
    if (life === serving.life) fail(serving, requestId, reasonOf(error));
    return;
  }
  leave(serving, life);
  if (life !== serving.life) return;
  if (serving.texts.get(path) !== asked) {
    fail(serving, requestId, `${path} was closed before it was open`);
    return;
  }
  if (served.gone) {
    fail(serving, requestId, `${path} is gone`);
    return;
  }
  // the text the place handed out last, which is the one the page's next write is made on
  serving.channel.post({
    type: "board.text.opened",
    requestId,
    path,
    text: served.known,
    readOnly: served.text.readOnly,
    version: served.version,
  });
}

/**
 * Why the place did not take a write, undefined when it took it. A write that throws or rejects
 * was refused, like one that says so: this never rejects.
 */
async function refusalOf(served: Served, value: string): Promise<DropReason | undefined> {
  const { text } = served;
  try {
    if (text.readOnly) return "refused";
    // false: the place has another text than the one this write was made on
    if (!(await text.write(value, served.known))) return "crossed";
    // read again and not taken from the page: a place may make its own text of a write
    served.known = text.text();
    return undefined;
  } catch (error) {
    return error instanceof WriteRefusal ? error.reason : "refused";
  }
}

/**
 * The page shows its last write. Only when that one settled is it known whether the place has
 * another text: a refused write with one the place took behind it needs no answer, and an
 * answer in between would show the page a text the place is about to leave. The same moment
 * says whether an edit of the page is lost for good, and that is told once, with its reason.
 */
function afterWrites(serving: Serving, path: string, asked: Asked): void {
  const { served } = asked;
  if (asked.waiting > 0 || served === undefined) return;
  // an edit that got no place in the line has its turn here, behind every edit that had one
  const { overflowed } = asked;
  asked.overflowed = undefined;
  if (overflowed !== undefined) notTaken(asked, served, overflowed.version);
  const { lost } = asked;
  asked.lost = undefined;
  // closed meanwhile, or the page is another one: nobody is left who wrote this
  if (serving.texts.get(path) !== asked) return;
  // a file that went away has no text to show, and the page was told that it went
  if (served.gone) return;
  // Not where nothing was refused, and not where the page was told a text since it made that
  // write: it shows the place's text already, and a second word of it would only cost the page
  // what it wrote since.
  if (asked.refusedOn === served.version) tell(serving, path, served, served.text.text());
  if (lost !== undefined) {
    serving.channel.post({ type: "board.text.dropped", path, reason: lost.reason });
  }
}

/**
 * An edit the server did not keep, when its turn comes: one the place did not take, unless it
 * was made on an older version, which no place would have got either.
 */
function notTaken(asked: Asked, served: Served, version: unknown): void {
  if (version !== served.version) {
    asked.lost ??= { reason: "crossed", on: undefined };
    return;
  }
  asked.refusedOn = served.version;
  asked.lost ??= { reason: "refused", on: served.version };
}

/**
 * One edit when its turn comes. `kept` is its text, undefined for one the server did not keep.
 * Asked now and not when it came: the write before it may have been answered. An edit made on
 * an older version crossed a text the page had not heard of. That text is on its way to the
 * page and takes the edit's place there, so the place never gets it.
 */
async function writeEdit(
  asked: Asked,
  kept: string | undefined,
  version: unknown,
  turn: number,
): Promise<void> {
  const { served } = asked;
  if (served === undefined) return;
  if (kept === undefined || version !== served.version) {
    notTaken(asked, served, version);
    return;
  }
  // the version the edit was made on: the place may tell another text while it writes
  const on = served.version;
  const refusal = await refusalOf(served, kept);
  if (refusal !== undefined) {
    asked.refusedOn = on;
    asked.lost ??= { reason: refusal, on };
    return;
  }
  // The page made this text from the one the place refused, so the place has both now: nothing
  // of that edit is lost. The same for an earlier edit that got no place in the line.
  if (asked.lost?.on === on) asked.lost = undefined;
  if (asked.overflowed !== undefined && asked.overflowed.turn < turn) asked.overflowed = undefined;
  asked.refusedOn = undefined;
}

function editText(serving: Serving, message: MessageOf<"board.text.edit">): void {
  // only a path that was opened, and so checked, has an entry
  const { path, version } = message;
  const asked = serving.texts.get(path);
  if (asked === undefined || typeof message.text !== "string") return;
  const turn = ++asked.edits;
  // How many edits wait has a limit, whatever their size: each one that waits is a step of its
  // path's line. One beyond it is not kept. Behind edits of its own path it gets no step
  // either, and is dealt with when they settled; with none of them waiting it is a step
  // without a text, the one such step its path can have at a time, which is counted too.
  const full = serving.waitingEdits >= WAITING_EDITS_LIMIT;
  if (full && asked.waiting > 0) {
    asked.overflowed = { turn, version };
    return;
  }
  // An edit waits with its whole text. What the waiting ones may hold together has a limit, and
  // one beyond it is not kept: when its turn comes it is a write the place did not take.
  const fits = !full && serving.heldEdits + message.text.length <= HELD_EDITS_LIMIT;
  const kept = fits ? message.text : undefined;
  const held = kept?.length ?? 0;
  serving.heldEdits += held;
  serving.waitingEdits += 1;
  asked.waiting += 1;
  // No step of this chain rejects, so no write is ever skipped. The answer is not a step of
  // it: a channel that throws for a page that is gone must not cost the place the next write.
  asked.writing = asked.writing.then(async () => {
    await writeEdit(asked, kept, version, turn);
    asked.waiting -= 1;
    serving.heldEdits -= held;
    serving.waitingEdits -= 1;
  });
  const { writing } = asked;
  serving.writes = Promise.all([serving.writes, writing]).then(ignore);
  void writing.then(() => afterWrites(serving, path, asked));
}

/** answered once every edit that came before it is in the place, was refused or was dropped */
async function settle(serving: Serving, requestId: number, life: number): Promise<void> {
  if (!admit(serving, requestId)) return;
  await serving.writes;
  leave(serving, life);
  if (life === serving.life) serving.channel.post({ type: "board.done", requestId });
}

function closeText(serving: Serving, message: MessageOf<"board.text.close">): void {
  const asked = serving.texts.get(message.path);
  if (!asked) return;
  serving.texts.delete(message.path);
  closeAsked(asked);
}

/** the one answer to every request of a read that is still there to hear it */
function answerRead(
  serving: Serving,
  reading: Reading,
  found: { bytes: Uint8Array; mime: string } | undefined,
  failure: string | undefined,
): void {
  // the page that asked may be gone, and the one that is there now may have joined
  const ids = reading.askers
    .filter((asker) => asker.life === serving.life)
    .map((asker) => asker.requestId);
  serving.waiting -= ids.length;
  const [requestId, ...alsoFor] = ids;
  if (requestId === undefined) return;
  if (failure !== undefined) {
    for (const id of ids) fail(serving, id, failure);
    return;
  }
  serving.channel.post({
    type: "board.bytes",
    requestId,
    path: reading.path,
    base64: found ? toBase64(found.bytes) : null,
    mime: found?.mime ?? "",
    // one message for all of them: the bytes cross the channel once
    ...(alsoFor.length > 0 ? { alsoFor } : {}),
  });
}

async function read(serving: Serving, reading: Reading): Promise<void> {
  const { reads } = serving;
  let found: { bytes: Uint8Array; mime: string } | undefined;
  let failure: string | undefined;
  try {
    found = await serving.backend.readBytes(reading.path);
  } catch (error) {
    failure = reasonOf(error);
  }
  reads.running -= 1;
  if (reads.joinable.get(reading.path) === reading) reads.joinable.delete(reading.path);
  answerRead(serving, reading, found, failure);
}

/** hands the backend the reads that waited longest, while fewer than `READS_AT_ONCE` run */
function nextReads(serving: Serving): void {
  const { reads } = serving;
  while (reads.running < READS_AT_ONCE) {
    const reading = reads.waiting.shift();
    if (reading === undefined) return;
    reads.running += 1;
    reading.running = true;
    // also after an answer the channel threw for: a page that is gone must not hold up the rest
    const next = (): void => nextReads(serving);
    void read(serving, reading).then(next, next);
  }
}

/**
 * A read of a path that is on its way already asks the backend nothing: it joins that read and
 * is answered with it.
 */
function readBytes(serving: Serving, message: MessageOf<"board.bytes.read">, life: number): void {
  const { requestId } = message;
  const path = checked(serving, message.path, requestId, "picture");
  if (path === undefined || !admit(serving, requestId)) return;
  const { reads } = serving;
  let reading = reads.joinable.get(path);
  if (reading === undefined) {
    reading = { path, askers: [], running: false };
    reads.joinable.set(path, reading);
    reads.waiting.push(reading);
  }
  reading.askers.push({ requestId, life });
  nextReads(serving);
}

/** the bytes of a base64 text, undefined for a text that is none */
function decoded(base64: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    return fromBase64(base64);
  } catch {
    return undefined;
  }
}

async function store(serving: Serving, file: NewFile): Promise<void> {
  const { requestId, life } = file;
  // decoded only now: while it waited, the file was held once and not twice
  const bytes = decoded(file.base64);
  let failure = bytes === undefined ? NO_BYTES : undefined;
  if (bytes !== undefined) {
    try {
      await serving.backend.createFile(file.path, bytes, file.mime);
    } catch (error) {
      failure = reasonOf(error);
    }
  }
  leave(serving, life);
  if (life !== serving.life) return;
  if (failure === undefined) serving.channel.post({ type: "board.done", requestId });
  else fail(serving, requestId, failure);
}

/** the new file that waited longest, once the one before it is stored or was refused */
function nextCreate(serving: Serving): void {
  const { creates } = serving;
  if (creates.running) return;
  const next = creates.waiting.shift();
  if (next === undefined) return;
  creates.held -= next.base64.length;
  creates.running = true;
  const done = (): void => {
    creates.running = false;
    nextCreate(serving);
  };
  void store(serving, next).then(done, done);
}

/**
 * What is checked of a new file before it may wait: its path, its name, the host's rule and
 * that its bytes are a base64 text of no more than the limit. `atob` takes anything for a text
 * first: null is the four letters of its name to it, which are base64 for three bytes.
 */
function newFile(
  serving: Serving,
  message: MessageOf<"board.file.create">,
  life: number,
): NewFile | undefined {
  const { requestId, path } = message;
  const problem = pathProblem(path);
  const base64: unknown = message.base64;
  let failure: string | undefined;
  if (problem === "outside") failure = OUTSIDE;
  else if (!isNewAssetPath(path)) {
    // in the right folder, so it is the name: one the board can make of a picture called aux.png
    const named = /^assets\/[^/]+$/.test(path);
    failure = named ? NO_NAME : problem === "hidden" ? HIDDEN : NO_ASSET;
  } else if (!serving.rule.picture(path)) failure = noPicture(path);
  else if (typeof base64 !== "string") failure = NO_BYTES;
  else if (base64.length > BASE64_LIMIT) failure = TOO_LARGE;
  if (failure !== undefined || typeof base64 !== "string") {
    fail(serving, requestId, failure ?? NO_BYTES);
    return undefined;
  }
  const mime = typeof message.mime === "string" ? message.mime : "";
  return { requestId, life, path, base64, mime };
}

function createFile(serving: Serving, message: MessageOf<"board.file.create">, life: number): void {
  const file = newFile(serving, message, life);
  if (file === undefined) return;
  const { creates } = serving;
  // One file is stored at a time, and those behind it wait with their bytes. What they hold
  // together has a limit, so a page cannot make the server keep more. Nothing waits while
  // nothing is stored, so the first file is always taken.
  if (creates.held + file.base64.length > HELD_FILES_LIMIT) {
    fail(serving, file.requestId, BUSY_FILES);
    return;
  }
  if (!admit(serving, file.requestId)) return;
  creates.held += file.base64.length;
  creates.waiting.push(file);
  nextCreate(serving);
}

async function show(
  serving: Serving,
  asked: { requestId: number; life: number; path: string },
): Promise<void> {
  const { requestId, life } = asked;
  let failure: string | undefined;
  try {
    await serving.backend.showFile?.(asked.path);
  } catch (error) {
    failure = reasonOf(error);
  }
  leave(serving, life);
  if (life !== serving.life) return;
  if (failure === undefined) serving.channel.post({ type: "board.done", requestId });
  else fail(serving, requestId, failure);
}

function nextShow(serving: Serving): void {
  const { shows } = serving;
  if (shows.running) return;
  const next = shows.waiting.shift();
  if (next === undefined) return;
  shows.running = true;
  const done = (): void => {
    shows.running = false;
    nextShow(serving);
  };
  void show(serving, next).then(done, done);
}

/**
 * The host shows a file and hands the page nothing of it. The path is checked as a path and not
 * against the host's rule: what a page asks to have shown is a file no board shows. One file is
 * shown at a time and `SHOWS_WAITING` wait behind it: a person presses one card at a time, and
 * every file that is shown takes the place's front, so a page that asks for more is told that
 * the host is busy.
 */
function showFile(serving: Serving, message: MessageOf<"board.file.show">, life: number): void {
  const { requestId } = message;
  const path = inRepository(serving, message.path, requestId);
  if (path === undefined) return;
  if (serving.backend.showFile === undefined) {
    fail(serving, requestId, NO_SHOW);
    return;
  }
  if (serving.shows.waiting.length >= SHOWS_WAITING) {
    fail(serving, requestId, BUSY_SHOWS);
    return;
  }
  if (!admit(serving, requestId)) return;
  serving.shows.waiting.push({ requestId, life, path });
  nextShow(serving);
}

function answer(serving: Serving, received: unknown): void {
  if (serving.ended || !isBoardMessage(received)) return;
  const message = received as ClientMessage;
  if (message.type === "board.hello") {
    greet(serving, message.protocol);
    return;
  }
  // The client counts its requests from 1. NaN is a number too, and an answer under it reaches
  // the page as null, which no request waits for.
  const requestId = Number.isSafeInteger(received.requestId)
    ? (received.requestId as number)
    : undefined;
  if (serving.refusal !== undefined) {
    // nothing reaches the backend before the hello; a page that waits is told why
    if (requestId !== undefined) fail(serving, requestId, serving.refusal);
    return;
  }
  if (message.type === "board.text.edit") {
    editText(serving, message);
    return;
  }
  if (message.type === "board.text.close") {
    closeText(serving, message);
    return;
  }
  // whatever else there is waits for an answer, and without an id none can be given
  if (requestId === undefined) return;
  switch (message.type) {
    case "board.text.open":
      void openText(serving, message, serving.life);
      return;
    case "board.text.settle":
      void settle(serving, requestId, serving.life);
      return;
    case "board.bytes.read":
      readBytes(serving, message, serving.life);
      return;
    case "board.file.create":
      createFile(serving, message, serving.life);
      return;
    case "board.file.show":
      showFile(serving, message, serving.life);
      return;
    default:
      fail(serving, requestId, `unknown request ${received.type}`);
  }
}

/**
 * Serves one page over one channel. Nothing is pushed before the page's hello, and every
 * request ends in its answer or in `board.failed`. `rule` is the host's word of what a board
 * may reach: a text is opened only for a path it calls a model, bytes are read and a file is
 * created only for one it calls a picture, and the page is told no other path of the list.
 * `dispose()` ends every subscription at once and closes every text, one that is being written
 * after its last write: what reached the server before its page went still lands.
 *
 * What a page can make the server keep is bounded. At most `WAITING_LIMIT` requests wait for
 * their answer. Of the reads `READS_AT_ONCE` are with the backend, one per path, and every
 * request for a path is answered by the one read of it. One new file is stored at a time, and
 * those that wait hold at most `HELD_FILES_LIMIT` characters of base64 together. One file is
 * shown at a time, and `SHOWS_WAITING` wait behind it. Of the edits at most
 * `WAITING_EDITS_LIMIT` wait for their turn, and they hold at most `HELD_EDITS_LIMIT`
 * characters together. What a channel holds of the answers it was handed is not the server's
 * to see.
 */
export function serveFiles(
  channel: Channel<HostMessage, ClientMessage>,
  backend: FilesBackend,
  rule: FilesRule,
): { dispose(): void } {
  const serving: Serving = {
    channel,
    backend,
    rule,
    texts: new Map(),
    writes: Promise.resolve(),
    heldEdits: 0,
    waitingEdits: 0,
    reads: { joinable: new Map(), waiting: [], running: 0 },
    creates: { waiting: [], held: 0, running: false },
    shows: { waiting: [], running: false },
    waiting: 0,
    stops: [],
    life: 0,
    refusal: NO_HELLO,
    ended: false,
  };
  const off = channel.onMessage((message) => answer(serving, message));
  return {
    dispose() {
      if (serving.ended) return;
      serving.ended = true;
      off();
      endLife(serving);
    },
  };
}
