/**
 * The host's side of the protocol: a backend, the place that keeps the files, behind a channel.
 * The server checks every path a page sends before the backend sees it, and what a message
 * holds before it reads it: the page is the side that is not trusted. A path is checked as a
 * text (`paths.ts` says what that leaves to a backend).
 */
import { isNewAssetPath, NEW_FILE_LIMIT_BYTES, repoPath } from "./paths.js";
import type { FileMove } from "./port.js";
import {
  fromBase64,
  isBoardMessage,
  PROTOCOL,
  toBase64,
  type Channel,
  type ClientMessage,
  type HostMessage,
} from "./protocol.js";

/** one text file as the place that keeps it has it */
export interface BackendText {
  readonly readOnly: boolean;
  text(): string;
  /**
   * Resolves false when the place refused the write, and a rejection counts the same: the server
   * then sends the page the text again. Never called on a read-only text, and never before the
   * write before it settled: a place gets the page's writes one at a time, in the page's order.
   */
  write(text: string): Promise<boolean>;
  /** every change `write` did not make, the text of a file that is back after it went among them */
  onChange(listener: (text: string) => void): () => void;
  /** the file went away; the text stays open, and `onChange` says when the file is back */
  onGone(listener: () => void): () => void;
  /** after the last write settled, also when the page went in the middle of one */
  close(): void;
}

/**
 * What an extension host, a plugin worker or a server implements: the files, with its own API.
 * Every path it is handed went through `repoPath`.
 */
export interface FilesBackend {
  /** every path the page is offered */
  list(): readonly string[];
  onListChanged(listener: () => void): () => void;
  /** rejects for a file that is not there or is no text; the page is told the message */
  openText(path: string): Promise<BackendText>;
  /** undefined where there is no such file; a rejection is told the page as a failure */
  readBytes(path: string): Promise<{ bytes: Uint8Array; mime: string } | undefined>;
  /** stores a NEW file, always `assets/<name>`, and rejects when the path is in use */
  createFile(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  onBytesChanged(listener: (paths: readonly string[]) => void): () => void;
  onMoved(listener: (moves: readonly FileMove[]) => void): () => void;
}

const NO_HELLO = "the page has not said hello";
const OUTSIDE = "this path is outside the repository";
const NO_ASSET = "a new file goes into assets/";
const NO_NAME = "a new file cannot have this name";
const NO_BYTES = "the bytes of the new file are no base64 text";
const TOO_LARGE = `a new file may have up to ${NEW_FILE_LIMIT_BYTES / 1024 / 1024} MiB`;
/** base64 writes three bytes as four characters */
const BASE64_LIMIT = Math.ceil(NEW_FILE_LIMIT_BYTES / 3) * 4;

/** a text the page has open: one subscription, however many of the page's sessions read it */
interface Served {
  readonly text: BackendText;
  /** the place said that the file went away, and not yet that it is back */
  gone: boolean;
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
  /** the write that settled last was refused */
  refused: boolean;
}

/** what the server keeps: one object, so that the answer to each message is a function of its own */
interface Serving {
  readonly channel: Channel<HostMessage, ClientMessage>;
  readonly backend: FilesBackend;
  /** by path: a second open of a path waits for the first and opens nothing */
  readonly texts: Map<string, Asked>;
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

function checked(serving: Serving, path: unknown, requestId: number): string | undefined {
  const safe = repoPath(path);
  if (safe === undefined) fail(serving, requestId, OUTSIDE);
  return safe;
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
}

function greet(serving: Serving, protocol: unknown): void {
  // whatever the page before this hello had open is closed with it
  endLife(serving);
  if (protocol !== PROTOCOL) {
    serving.refusal = `this host speaks protocol ${PROTOCOL}, the page said ${String(protocol)}`;
    return;
  }
  serving.refusal = undefined;
  const { backend, channel } = serving;
  const sendPaths = (): void => channel.post({ type: "board.paths", paths: [...backend.list()] });
  serving.stops = [
    backend.onListChanged(sendPaths),
    backend.onBytesChanged((paths) =>
      channel.post({ type: "board.bytes.changed", paths: [...paths] }),
    ),
    backend.onMoved((moves) => channel.post({ type: "board.moved", moves: [...moves] })),
  ];
  sendPaths();
}

async function subscribe(serving: Serving, path: string): Promise<Served> {
  const text = await serving.backend.openText(path);
  const served: Served = { text, gone: false, stop: [] };
  served.stop.push(
    text.onChange((changed) => {
      served.gone = false;
      serving.channel.post({ type: "board.text.update", path, text: changed });
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
    refused: false,
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
  const path = checked(serving, message.path, requestId);
  if (path === undefined) return;
  const asked = serving.texts.get(path) ?? ask(serving, path);
  let served: Served;
  try {
    served = await asked.pending;
  } catch (error) {
    if (serving.texts.get(path) === asked) serving.texts.delete(path);
    if (life === serving.life) fail(serving, requestId, reasonOf(error));
    return;
  }
  if (life !== serving.life) return;
  if (serving.texts.get(path) !== asked) {
    fail(serving, requestId, `${path} was closed before it was open`);
    return;
  }
  if (served.gone) {
    fail(serving, requestId, `${path} is gone`);
    return;
  }
  const { text } = served;
  serving.channel.post({
    type: "board.text.opened",
    requestId,
    path,
    text: text.text(),
    readOnly: text.readOnly,
  });
}

/** a write that throws or rejects was refused, like one that says so: this never rejects */
async function written(text: BackendText, value: string): Promise<boolean> {
  try {
    return text.readOnly ? false : await text.write(value);
  } catch {
    return false;
  }
}

/**
 * The page shows its last write. Only when that one settled is it known whether the place has
 * another text: a refused write with one the place took behind it needs no answer, and an
 * answer in between would show the page a text the place is about to leave.
 */
function tellRefused(serving: Serving, path: string, asked: Asked): void {
  const { served } = asked;
  if (asked.waiting > 0 || !asked.refused || served === undefined) return;
  // closed meanwhile, or the page is another one: nobody is left who wrote this
  if (serving.texts.get(path) !== asked) return;
  // a file that went away has no text to show, and the page was told that it went
  if (served.gone) return;
  serving.channel.post({ type: "board.text.update", path, text: served.text.text() });
}

function editText(serving: Serving, message: MessageOf<"board.text.edit">): void {
  // only a path that was opened, and so checked, has an entry
  const { path, text } = message;
  const asked = serving.texts.get(path);
  if (asked === undefined || typeof text !== "string") return;
  asked.waiting += 1;
  // No step of this chain rejects, so no write is ever skipped. The answer is not a step of
  // it: a channel that throws for a page that is gone must not cost the place the next write.
  asked.writing = asked.writing.then(async () => {
    const { served } = asked;
    asked.refused = served === undefined || !(await written(served.text, text));
    asked.waiting -= 1;
  });
  void asked.writing.then(() => tellRefused(serving, path, asked));
}

function closeText(serving: Serving, message: MessageOf<"board.text.close">): void {
  const asked = serving.texts.get(message.path);
  if (!asked) return;
  serving.texts.delete(message.path);
  closeAsked(asked);
}

async function readBytes(
  serving: Serving,
  message: MessageOf<"board.bytes.read">,
  life: number,
): Promise<void> {
  const { requestId } = message;
  const path = checked(serving, message.path, requestId);
  if (path === undefined) return;
  let found: { bytes: Uint8Array; mime: string } | undefined;
  try {
    found = await serving.backend.readBytes(path);
  } catch (error) {
    if (life === serving.life) fail(serving, requestId, reasonOf(error));
    return;
  }
  if (life !== serving.life) return;
  serving.channel.post({
    type: "board.bytes",
    requestId,
    path,
    base64: found ? toBase64(found.bytes) : null,
    mime: found?.mime ?? "",
  });
}

/**
 * The bytes of a new file, or why there are none. `atob` takes anything for a text first: null
 * is the four letters of its name to it, which are base64 for three bytes.
 */
function newBytes(base64: unknown): Uint8Array<ArrayBuffer> | string {
  if (typeof base64 !== "string") return NO_BYTES;
  if (base64.length > BASE64_LIMIT) return TOO_LARGE;
  try {
    return fromBase64(base64);
  } catch {
    return NO_BYTES;
  }
}

async function createFile(
  serving: Serving,
  message: MessageOf<"board.file.create">,
  life: number,
): Promise<void> {
  const { requestId } = message;
  const path = checked(serving, message.path, requestId);
  if (path === undefined) return;
  if (!isNewAssetPath(path)) {
    // in the right folder, so it is the name: one the board can make of a picture called aux.png
    fail(serving, requestId, /^assets\/[^/]+$/.test(path) ? NO_NAME : NO_ASSET);
    return;
  }
  const bytes = newBytes(message.base64);
  if (typeof bytes === "string") {
    fail(serving, requestId, bytes);
    return;
  }
  try {
    const mime = typeof message.mime === "string" ? message.mime : "";
    await serving.backend.createFile(path, bytes, mime);
  } catch (error) {
    if (life === serving.life) fail(serving, requestId, reasonOf(error));
    return;
  }
  if (life === serving.life) serving.channel.post({ type: "board.done", requestId });
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
    case "board.bytes.read":
      void readBytes(serving, message, serving.life);
      return;
    case "board.file.create":
      void createFile(serving, message, serving.life);
      return;
    default:
      fail(serving, requestId, `unknown request ${received.type}`);
  }
}

/**
 * Serves one page over one channel. Nothing is pushed before the page's hello, and every
 * request ends in its answer or in `board.failed`. `dispose()` ends every subscription at once
 * and closes every text, one that is being written after its last write.
 */
export function serveFiles(
  channel: Channel<HostMessage, ClientMessage>,
  backend: FilesBackend,
): { dispose(): void } {
  const serving: Serving = {
    channel,
    backend,
    texts: new Map(),
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
