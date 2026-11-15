/**
 * The page's side of the protocol: the port over a channel to the host that keeps the files.
 */
import type { BoardFiles, FileMove, TextSession } from "./port.js";
import {
  fromBase64,
  PROTOCOL,
  toBase64,
  type Channel,
  type ClientMessage,
  type HostMessage,
} from "./protocol.js";

/** one session's ears */
interface Reader {
  replace(text: string): void;
  available(value: boolean): void;
}

/** one path the page has open, however many sessions read it: the host hears of it once */
interface OpenPath {
  text: string;
  readOnly: boolean;
  available: boolean;
  readonly sessions: Set<Reader>;
  /** callers of `openText` that wait for the host's answer and have no session yet */
  joining: number;
  /** settles with the host's answer to the one `board.text.open` of this path */
  readonly opened: Promise<void>;
}

/** what the client keeps: one object, so that its parts are functions of their own */
interface ClientState {
  readonly channel: Channel<ClientMessage, HostMessage>;
  paths: readonly string[];
  readonly pathListeners: Set<() => void>;
  readonly bytesListeners: Set<(paths: readonly string[]) => void>;
  readonly moveListeners: Set<(moves: readonly FileMove[]) => void>;
  readonly waiting: Map<
    number,
    { resolve(message: HostMessage): void; reject(error: Error): void }
  >;
  readonly open: Map<string, OpenPath>;
  nextRequest: number;
  disposed: boolean;
}

const CLOSED = "the files were closed";

function request(
  state: ClientState,
  build: (requestId: number) => ClientMessage,
): Promise<HostMessage> {
  if (state.disposed) return Promise.reject(new Error(CLOSED));
  return new Promise((resolve, reject) => {
    const requestId = state.nextRequest++;
    state.waiting.set(requestId, { resolve, reject });
    state.channel.post(build(requestId));
  });
}

/** the sessions of a path, less one that closed while the others were told */
function tellReaders(entry: OpenPath, tell: (reader: Reader) => void, except?: Reader): void {
  for (const reader of [...entry.sessions]) {
    if (reader !== except && entry.sessions.has(reader)) tell(reader);
  }
}

function receive(state: ClientState, message: HostMessage): void {
  if (state.disposed) return;
  switch (message.type) {
    case "board.paths":
      state.paths = Object.freeze([...message.paths]);
      for (const listener of [...state.pathListeners]) listener();
      return;
    case "board.text.update": {
      const entry = state.open.get(message.path);
      if (!entry) return;
      entry.text = message.text;
      const cameBack = !entry.available;
      entry.available = true;
      tellReaders(entry, (reader) => {
        if (cameBack) reader.available(true);
        reader.replace(message.text);
      });
      return;
    }
    case "board.text.gone": {
      const entry = state.open.get(message.path);
      if (!entry || !entry.available) return;
      entry.available = false;
      tellReaders(entry, (reader) => reader.available(false));
      return;
    }
    case "board.moved":
      for (const listener of [...state.moveListeners]) listener(message.moves);
      return;
    case "board.bytes.changed":
      for (const listener of [...state.bytesListeners]) listener(message.paths);
      return;
    case "board.failed":
      state.waiting.get(message.requestId)?.reject(new Error(message.message));
      state.waiting.delete(message.requestId);
      return;
    case "board.text.opened":
    case "board.bytes":
    case "board.done":
      state.waiting.get(message.requestId)?.resolve(message);
      state.waiting.delete(message.requestId);
      return;
  }
}

/** the path's entry, asked of the host by the first caller and shared by every later one */
function entryOf(state: ClientState, path: string): OpenPath {
  const known = state.open.get(path);
  if (known) return known;
  const asked = request(state, (requestId) => ({ type: "board.text.open", requestId, path }));
  const entry: OpenPath = {
    text: "",
    readOnly: false,
    available: true,
    sessions: new Set(),
    joining: 0,
    opened: asked.then((answer) => {
      if (answer.type !== "board.text.opened") throw new Error(`${path}: unexpected answer`);
      entry.text = answer.text;
      entry.readOnly = answer.readOnly;
    }),
  };
  state.open.set(path, entry);
  // a path the host refused is asked anew by the next caller
  entry.opened.catch(() => {
    if (state.open.get(path) === entry) state.open.delete(path);
  });
  return entry;
}

/** the host is told once nobody reads the path and nobody waits for it */
function closeUnread(state: ClientState, path: string, entry: OpenPath): void {
  if (entry.sessions.size > 0 || entry.joining > 0 || state.open.get(path) !== entry) return;
  state.open.delete(path);
  if (!state.disposed) state.channel.post({ type: "board.text.close", path });
}

function sessionOf(state: ClientState, path: string, entry: OpenPath): TextSession {
  const replaceListeners = new Set<(text: string) => void>();
  const availableListeners = new Set<(available: boolean) => void>();
  const own: Reader = {
    replace: (text) => {
      for (const listener of [...replaceListeners]) listener(text);
    },
    available: (value) => {
      for (const listener of [...availableListeners]) listener(value);
    },
  };
  entry.sessions.add(own);
  let closed = false;
  return {
    path,
    readOnly: entry.readOnly,
    text: () => entry.text,
    write(text) {
      if (closed || state.disposed || entry.readOnly || !entry.available) return;
      if (text === entry.text) return;
      // Posted before the other readers hear of it: a reader that answers with a write of its
      // own is then behind this one on the channel, and the host ends with the text the page has.
      state.channel.post({ type: "board.text.edit", path, text });
      entry.text = text;
      // the host never echoes this client's edit: the other readers of the path hear it here
      tellReaders(entry, (reader) => reader.replace(text), own);
    },
    onReplace(listener) {
      replaceListeners.add(listener);
      return () => void replaceListeners.delete(listener);
    },
    onAvailable(listener) {
      availableListeners.add(listener);
      return () => void availableListeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      entry.sessions.delete(own);
      closeUnread(state, path, entry);
    },
  };
}

async function openText(state: ClientState, path: string): Promise<TextSession> {
  const entry = entryOf(state, path);
  // Counted before the answer is there: a session that closes while this caller waits must not
  // close the path under it.
  entry.joining += 1;
  try {
    await entry.opened;
  } finally {
    entry.joining -= 1;
  }
  if (state.disposed) throw new Error(CLOSED);
  // No session says that its file is gone to a reader that comes later: such a reader is told
  // what the host itself answers for a file that is not there.
  if (!entry.available) {
    closeUnread(state, path, entry);
    throw new Error(`${path} is gone`);
  }
  return sessionOf(state, path, entry);
}

export function createFilesClient(channel: Channel<ClientMessage, HostMessage>): BoardFiles {
  const state: ClientState = {
    channel,
    paths: Object.freeze([]),
    pathListeners: new Set(),
    bytesListeners: new Set(),
    moveListeners: new Set(),
    waiting: new Map(),
    open: new Map(),
    nextRequest: 1,
    disposed: false,
  };
  const off = channel.onMessage((message) => receive(state, message));
  channel.post({ type: "board.hello", protocol: PROTOCOL });

  return {
    paths: () => state.paths,
    onPaths(listener) {
      state.pathListeners.add(listener);
      return () => void state.pathListeners.delete(listener);
    },
    openText: (path) => openText(state, path),
    async readBytes(path) {
      const answer = await request(state, (requestId) => ({
        type: "board.bytes.read",
        requestId,
        path,
      }));
      if (answer.type !== "board.bytes" || answer.base64 === null) return undefined;
      return new Blob([fromBase64(answer.base64)], { type: answer.mime });
    },
    async createFile(path, bytes) {
      const base64 = toBase64(new Uint8Array(await bytes.arrayBuffer()));
      const mime = bytes.type;
      await request(state, (requestId) => ({
        type: "board.file.create",
        requestId,
        path,
        base64,
        mime,
      }));
    },
    onBytesChanged(listener) {
      state.bytesListeners.add(listener);
      return () => void state.bytesListeners.delete(listener);
    },
    onMoved(listener) {
      state.moveListeners.add(listener);
      return () => void state.moveListeners.delete(listener);
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      off();
      for (const [, one] of state.waiting) one.reject(new Error(CLOSED));
      state.waiting.clear();
    },
  };
}
