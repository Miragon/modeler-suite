/**
 * A channel in memory for the tests of the protocol: two ends, every message copied and
 * delivered later and in order, as a webview's channel does it, and a log of what crossed.
 */
import {
  createMemoryBackend,
  type BackendText,
  type Channel,
  type ClientMessage,
  type HostMessage,
  type MemoryBackend,
  type MemoryFile,
} from "../../src/index.js";

export interface Wire {
  /** the page's end */
  readonly page: Channel<ClientMessage, HostMessage>;
  /** the host's end */
  readonly host: Channel<HostMessage, ClientMessage>;
  /** the type of every message in the order it was posted: "page> board.hello" */
  readonly log: string[];
  /** what the host posted, whole and in order */
  readonly fromHost: HostMessage[];
  /** what the page posted, whole and in order */
  readonly fromPage: ClientMessage[];
  /** a message of any shape from the page's end: what a page that is not the client could send */
  send(message: unknown): void;
}

export function createWire(): Wire {
  const log: string[] = [];
  const fromHost: HostMessage[] = [];
  const fromPage: ClientMessage[] = [];
  const atPage = new Set<(message: HostMessage) => void>();
  const atHost = new Set<(message: ClientMessage) => void>();
  const end = <Out, In>(
    side: string,
    sent: Out[],
    own: Set<(message: In) => void>,
    other: Set<(message: Out) => void>,
  ): Channel<Out, In> => ({
    post(message) {
      const copy = structuredClone(message);
      log.push(`${side}> ${(copy as { type?: unknown } | null)?.type as string}`);
      sent.push(copy);
      queueMicrotask(() => {
        for (const listener of [...other]) listener(copy);
      });
    },
    onMessage(listener) {
      own.add(listener);
      return () => void own.delete(listener);
    },
  });
  const page = end<ClientMessage, HostMessage>("page", fromPage, atPage, atHost);
  return {
    page,
    host: end<HostMessage, ClientMessage>("host", fromHost, atHost, atPage),
    log,
    fromHost,
    fromPage,
    send: (message) => page.post(message as ClientMessage),
  };
}

/**
 * Resolves once nothing is on its way. The wire delivers in microtasks and the memory backend
 * answers in microtasks, so one task later every chain a test started has run to its end.
 */
export const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface CountingBackend extends MemoryBackend {
  /** what the server asked of the backend: the path of every call */
  readonly calls: { openText: string[]; readBytes: string[]; createFile: string[] };
  /** the texts that are open now */
  openTexts(): number;
  /** writes that were handed to a text after it was closed, or while another was on its way */
  wrongWrites(): number;
  /** the listeners on the list, the bytes and the moves that are subscribed now */
  subscriptions(): number;
  /** replaces what the backend answers to a write; undefined is the backend's own answer */
  onWrite: ((path: string, text: string) => Promise<boolean>) | undefined;
  /** every text is read-only while this is true at the time it is opened */
  readOnly: boolean;
}

/** a memory backend that counts what a server holds of it and can refuse a write */
export function createCountingBackend(files: Record<string, MemoryFile>): CountingBackend {
  const memory = createMemoryBackend(files);
  const calls: CountingBackend["calls"] = { openText: [], readBytes: [], createFile: [] };
  let open = 0;
  let subscribed = 0;
  let wrong = 0;
  const counted =
    <Listener>(subscribe: (listener: Listener) => () => void) =>
    (listener: Listener): (() => void) => {
      const off = subscribe(listener);
      subscribed += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        subscribed -= 1;
        off();
      };
    };
  const backend: CountingBackend = {
    ...memory,
    calls,
    openTexts: () => open,
    wrongWrites: () => wrong,
    subscriptions: () => subscribed,
    onWrite: undefined,
    readOnly: false,
    onListChanged: counted(memory.onListChanged),
    onBytesChanged: counted(memory.onBytesChanged),
    onMoved: counted(memory.onMoved),
    async openText(path): Promise<BackendText> {
      calls.openText.push(path);
      const text = await memory.openText(path);
      open += 1;
      let closed = false;
      let writing = 0;
      return {
        ...text,
        readOnly: backend.readOnly,
        async write(value) {
          if (closed || writing > 0) wrong += 1;
          writing += 1;
          try {
            return await (backend.onWrite?.(path, value) ?? text.write(value));
          } finally {
            writing -= 1;
          }
        },
        close() {
          if (closed) throw new Error(`${path} was closed twice`);
          closed = true;
          open -= 1;
          text.close();
        },
      };
    },
    readBytes(path) {
      calls.readBytes.push(path);
      return memory.readBytes(path);
    },
    createFile(path, bytes, mime) {
      calls.createFile.push(path);
      return memory.createFile(path, bytes, mime);
    },
  };
  return backend;
}

/** a promise a test settles by hand, for a backend that takes its time */
export function deferred<Value>(): {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: Error): void;
} {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
