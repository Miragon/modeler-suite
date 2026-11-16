/**
 * What a page cannot make a host do or keep: reads of one path answered together, a few reads
 * at once, new files stored and files shown one at a time, and a bound on what waits.
 */
import { describe, expect, test } from "vitest";
import {
  fromBase64,
  NEW_FILE_LIMIT_BYTES,
  PROTOCOL,
  READS_AT_ONCE,
  serveFiles,
  toBase64,
  WAITING_LIMIT,
  type HostMessage,
} from "../src/index.js";
import {
  HELD_EDITS_LIMIT,
  HELD_FILES_LIMIT,
  SHOWS_WAITING,
  WAITING_EDITS_LIMIT,
} from "../src/server.js";
import {
  createCountingBackend,
  createWire,
  deferred,
  PNG_BASE64,
  RULE,
  settled,
  type CountingBackend,
  type Wire,
} from "./support/wire.js";

const PNG = fromBase64(PNG_BASE64);
const TEA = "title Tea\n";
const BUSY = "too many requests are waiting for this host";
const BUSY_SHOWS = "another file is being shown, try again in a moment";

type Bytes = { bytes: Uint8Array; mime: string } | undefined;

interface Bench {
  readonly wire: Wire;
  readonly backend: CountingBackend;
  /** the reads the backend was handed and has not answered, oldest first */
  readonly reads: Array<{ path: string; answer(found: Bytes): void; fail(error: Error): void }>;
  /** the new files the backend was handed and has not stored, oldest first */
  readonly creates: Array<{ path: string; store(): void; refuse(error: Error): void }>;
  /** the files the backend was asked to show and has not shown, oldest first */
  readonly shows: Array<{ path: string; shown(): void; refuse(error: Error): void }>;
  /** what the host posted since the test last looked */
  taken(): HostMessage[];
}

/**
 * A server whose backend answers a read, a create and a show only when the test says so, or,
 * with `atOnce`, in the moment it is asked.
 */
async function bench(atOnce = false): Promise<Bench> {
  const wire = createWire();
  const backend = createCountingBackend({
    "models/tea.owm": TEA,
    "assets/a.png": { bytes: PNG, mime: "image/png" },
  });
  const reads: Bench["reads"] = [];
  const creates: Bench["creates"] = [];
  const shows: Bench["shows"] = [];
  backend.readBytes = (path) => {
    backend.calls.readBytes.push(path);
    const gate = deferred<Bytes>();
    reads.push({ path, answer: gate.resolve, fail: gate.reject });
    if (atOnce) gate.resolve(undefined);
    return gate.promise;
  };
  backend.createFile = (path) => {
    backend.calls.createFile.push(path);
    const gate = deferred<void>();
    creates.push({ path, store: () => gate.resolve(), refuse: gate.reject });
    if (atOnce) gate.resolve();
    return gate.promise;
  };
  // the members are read when they are called: a test may replace one of the backend's
  serveFiles(
    wire.host,
    {
      list: () => backend.list(),
      onListChanged: (listener) => backend.onListChanged(listener),
      openText: (path) => backend.openText(path),
      readBytes: (path) => backend.readBytes(path),
      createFile: (path, bytes, mime) => backend.createFile(path, bytes, mime),
      showFile(path) {
        const gate = deferred<void>();
        shows.push({ path, shown: () => gate.resolve(), refuse: gate.reject });
        if (atOnce) gate.resolve();
        return gate.promise;
      },
      onBytesChanged: (listener) => backend.onBytesChanged(listener),
      onMoved: (listener) => backend.onMoved(listener),
    },
    RULE,
  );
  wire.send({ type: "board.hello", protocol: PROTOCOL });
  await settled();
  wire.fromHost.length = 0;
  return { wire, backend, reads, creates, shows, taken: () => wire.fromHost.splice(0) };
}

const read = (requestId: number, path: string) => ({ type: "board.bytes.read", requestId, path });
const create = (requestId: number, path: string, base64 = PNG_BASE64) => ({
  type: "board.file.create",
  requestId,
  path,
  base64,
  mime: "image/png",
});
const show = (requestId: number, path: string) => ({ type: "board.file.show", requestId, path });
const bytes = (requestId: number, path: string, more: Partial<HostMessage> = {}) => ({
  type: "board.bytes",
  requestId,
  path,
  base64: PNG_BASE64,
  mime: "image/png",
  ...more,
});
const png = { bytes: PNG, mime: "image/png" };

describe("reads of one path that are on their way", () => {
  test("ask the backend once and are answered together, by one message that names each", async () => {
    const { wire, backend, reads, taken } = await bench();
    for (const requestId of [1, 2, 3]) wire.send(read(requestId, "assets/a.png"));
    await settled();
    expect(backend.calls.readBytes).toEqual(["assets/a.png"]);
    expect(taken()).toEqual([]);

    reads[0]?.answer(png);
    await settled();
    // the bytes cross the channel once, whoever asked
    expect(taken()).toEqual([bytes(1, "assets/a.png", { alsoFor: [2, 3] })]);
  });

  test("a read alone is answered without the list of the others", async () => {
    const { wire, reads, taken } = await bench();
    wire.send(read(7, "assets/a.png"));
    await settled();
    reads[0]?.answer(png);
    await settled();
    const [answer] = taken();
    expect(answer).toEqual(bytes(7, "assets/a.png"));
    expect(answer && "alsoFor" in answer).toBe(false);
  });

  test("a read that comes after the answer asks the backend again", async () => {
    const { wire, backend, reads, taken } = await bench();
    wire.send(read(1, "assets/a.png"));
    await settled();
    reads[0]?.answer(png);
    await settled();
    wire.send(read(2, "assets/a.png"));
    await settled();
    expect(backend.calls.readBytes).toEqual(["assets/a.png", "assets/a.png"]);
    reads[1]?.answer(undefined);
    await settled();
    expect(taken()).toEqual([
      bytes(1, "assets/a.png"),
      { type: "board.bytes", requestId: 2, path: "assets/a.png", base64: null, mime: "" },
    ]);
  });

  test("fail together where the backend could not read, each with the message", async () => {
    const { wire, reads, taken } = await bench();
    wire.send(read(1, "assets/a.png"));
    wire.send(read(2, "assets/a.png"));
    await settled();
    reads[0]?.fail(new Error("the disk is gone"));
    await settled();
    expect(taken()).toEqual([
      { type: "board.failed", requestId: 1, message: "the disk is gone" },
      { type: "board.failed", requestId: 2, message: "the disk is gone" },
    ]);
  });

  test("a read that comes after the bytes changed is not answered with the bytes of before", async () => {
    const { wire, backend, reads, taken } = await bench();
    wire.send(read(1, "assets/a.png"));
    await settled();
    // the place says that the file changed while the first read is with it
    await backend.memory.createFile("assets/b.png", PNG, "image/png");
    backend.memory.move("assets/b.png", "assets/a.png");
    await settled();
    taken();
    wire.send(read(2, "assets/a.png"));
    await settled();
    expect(backend.calls.readBytes).toEqual(["assets/a.png", "assets/a.png"]);

    const fresh = { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" };
    reads[1]?.answer(fresh);
    reads[0]?.answer(png);
    await settled();
    expect(taken()).toEqual([
      { ...bytes(2, "assets/a.png"), base64: toBase64(fresh.bytes) },
      bytes(1, "assets/a.png"),
    ]);
  });

  test("a read that waits for its turn is joined though the bytes changed: it has read nothing yet", async () => {
    const { wire, backend, reads, taken } = await bench();
    for (let index = 0; index < READS_AT_ONCE; index++)
      wire.send(read(index, `assets/${index}.png`));
    wire.send(read(10, "assets/a.png"));
    await settled();
    await backend.memory.createFile("assets/b.png", PNG, "image/png");
    backend.memory.move("assets/b.png", "assets/a.png");
    wire.send(read(11, "assets/a.png"));
    await settled();
    taken();
    reads[0]?.answer(undefined);
    await settled();
    expect(backend.calls.readBytes.filter((path) => path === "assets/a.png")).toHaveLength(1);
    reads.at(-1)?.answer(png);
    await settled();
    expect(taken().at(-1)).toEqual(bytes(10, "assets/a.png", { alsoFor: [11] }));
  });
});

describe("the reads a backend has at one time", () => {
  test("are a few: the others wait, and go to the backend in the order they came", async () => {
    const { wire, backend, reads, taken } = await bench();
    const paths = Array.from({ length: READS_AT_ONCE + 3 }, (_, index) => `assets/${index}.png`);
    paths.forEach((path, index) => wire.send(read(index + 1, path)));
    await settled();
    expect(READS_AT_ONCE).toBe(4);
    expect(backend.calls.readBytes).toEqual(paths.slice(0, READS_AT_ONCE));

    // one answer makes room for one more, the one that waited longest
    reads[2]?.answer(png);
    await settled();
    expect(backend.calls.readBytes).toEqual(paths.slice(0, READS_AT_ONCE + 1));
    expect(taken()).toEqual([bytes(3, "assets/2.png")]);

    reads[0]?.fail(new Error("unreadable"));
    reads[1]?.answer(undefined);
    await settled();
    expect(backend.calls.readBytes).toEqual(paths);
    for (const waiting of reads.slice(3)) waiting.answer(png);
    await settled();
    expect(taken().map((message) => "requestId" in message && message.requestId)).toEqual([
      1, 2, 4, 5, 6, 7,
    ]);
    expect(reads).toHaveLength(paths.length);
  });

  test("a read that waited when its page said hello again is never made", async () => {
    const { wire, backend, reads, taken } = await bench();
    for (let index = 0; index < READS_AT_ONCE + 2; index++) {
      wire.send(read(index + 1, `assets/${index}.png`));
    }
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken();
    for (const running of [...reads]) running.answer(png);
    await settled();
    // the four that were with the backend ran to their end and are answered to nobody
    expect(backend.calls.readBytes).toHaveLength(READS_AT_ONCE);
    expect(taken()).toEqual([]);

    // and the next page's reads are served as ever
    wire.send(read(1, "assets/a.png"));
    await settled();
    reads.at(-1)?.answer(png);
    await settled();
    expect(taken()).toEqual([bytes(1, "assets/a.png")]);
  });

  test("a read the page before left with the backend is answered to nobody: the next page's read is one of its own", async () => {
    const { wire, backend, reads, taken } = await bench();
    wire.send(read(5, "assets/a.png"));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send(read(1, "assets/a.png"));
    await settled();
    taken();
    expect(backend.calls.readBytes).toEqual(["assets/a.png", "assets/a.png"]);

    reads[0]?.answer({ bytes: new Uint8Array([9]), mime: "image/png" });
    await settled();
    expect(taken()).toEqual([]);
    reads[1]?.answer(png);
    await settled();
    expect(taken()).toEqual([bytes(1, "assets/a.png")]);
  });

  test("the reads a page left with the backend still count: the next page gets no more than are left of the few", async () => {
    const { wire, backend, reads } = await bench();
    for (let index = 0; index < READS_AT_ONCE; index++)
      wire.send(read(index + 1, `assets/${index}.png`));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send(read(1, "assets/new.png"));
    await settled();
    expect(backend.calls.readBytes).not.toContain("assets/new.png");

    reads[0]?.answer(undefined);
    await settled();
    expect(backend.calls.readBytes.at(-1)).toBe("assets/new.png");
    expect(backend.calls.readBytes).toHaveLength(READS_AT_ONCE + 1);
  });
});

describe("a channel that throws for a page that is gone", () => {
  test("does not hold up the reads, the new files and the shows behind the answer it threw for", async () => {
    const { wire, backend, reads, creates, shows } = await bench();
    for (let index = 0; index < READS_AT_ONCE + 1; index++) {
      wire.send(read(index + 1, `assets/${index}.png`));
    }
    wire.send(create(20, "assets/one.png"));
    wire.send(create(21, "assets/two.png"));
    wire.send(show(30, "docs/one.md"));
    wire.send(show(31, "docs/two.md"));
    await settled();
    const post = wire.host.post;
    wire.host.post = () => {
      throw new Error("the webview is gone");
    };

    reads[0]?.answer(png);
    creates[0]?.store();
    shows[0]?.shown();
    await settled();
    wire.host.post = post;

    expect(backend.calls.readBytes).toHaveLength(READS_AT_ONCE + 1);
    expect(backend.calls.createFile).toEqual(["assets/one.png", "assets/two.png"]);
    expect(shows.map((one) => one.path)).toEqual(["docs/one.md", "docs/two.md"]);
  });
});

describe("new files", () => {
  test("are stored one at a time, in the order they came", async () => {
    const { wire, backend, creates, taken } = await bench();
    wire.send(create(1, "assets/one.png"));
    wire.send(create(2, "assets/two.png"));
    wire.send(create(3, "assets/three.png"));
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png"]);

    creates[0]?.store();
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png", "assets/two.png"]);
    expect(taken()).toEqual([{ type: "board.done", requestId: 1 }]);

    // a refusal ends its turn as a stored file does
    creates[1]?.refuse(new Error("assets/two.png exists already"));
    await settled();
    expect(backend.calls.createFile).toEqual([
      "assets/one.png",
      "assets/two.png",
      "assets/three.png",
    ]);
    creates[2]?.store();
    await settled();
    expect(taken()).toEqual([
      { type: "board.failed", requestId: 2, message: "assets/two.png exists already" },
      { type: "board.done", requestId: 3 },
    ]);
  });

  test("whose bytes are no base64 are failed in their turn and hold up nobody", async () => {
    const { wire, backend, creates, taken } = await bench();
    wire.send(create(1, "assets/one.png"));
    wire.send(create(2, "assets/two.png", "no base64 !"));
    wire.send(create(3, "assets/three.png"));
    await settled();
    creates[0]?.store();
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png", "assets/three.png"]);
    expect(taken()).toEqual([
      { type: "board.done", requestId: 1 },
      {
        type: "board.failed",
        requestId: 2,
        message: "the bytes of the new file are no base64 text",
      },
    ]);
  });

  test("that wait hold no more than two files of the limit together: one more is failed at once", async () => {
    const { wire, backend, creates, taken } = await bench();
    const largest = toBase64(new Uint8Array(NEW_FILE_LIMIT_BYTES));
    expect(HELD_FILES_LIMIT).toBe(2 * largest.length);
    wire.send(create(1, "assets/one.png"));
    wire.send(create(2, "assets/two.png", largest));
    wire.send(create(3, "assets/three.png", largest));
    // the two that wait hold the whole of it: not one byte more, and no small file either
    wire.send(create(4, "assets/four.png", largest));
    wire.send(create(5, "assets/five.png"));
    await settled();
    expect(taken()).toEqual([
      {
        type: "board.failed",
        requestId: 4,
        message: "too many new files are waiting to be stored",
      },
      {
        type: "board.failed",
        requestId: 5,
        message: "too many new files are waiting to be stored",
      },
    ]);

    // room again once the first of them had its turn
    creates[0]?.store();
    await settled();
    wire.send(create(6, "assets/six.png"));
    await settled();
    expect(taken()).toEqual([{ type: "board.done", requestId: 1 }]);
    creates[1]?.store();
    await settled();
    creates[2]?.store();
    await settled();
    creates[3]?.store();
    await settled();
    expect(backend.calls.createFile).toEqual([
      "assets/one.png",
      "assets/two.png",
      "assets/three.png",
      "assets/six.png",
    ]);
    expect(taken().map((message) => message.type)).toEqual([
      "board.done",
      "board.done",
      "board.done",
    ]);
  }, 30_000);

  test("of any size are taken while nothing is stored: the limit is for those that wait", async () => {
    const { wire, backend } = await bench();
    wire.send(create(1, "assets/one.png", toBase64(new Uint8Array(NEW_FILE_LIMIT_BYTES))));
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png"]);
  }, 30_000);

  test("that waited when their page said hello again leave their room to the next page's", async () => {
    const { wire, backend, creates, taken } = await bench();
    const largest = toBase64(new Uint8Array(NEW_FILE_LIMIT_BYTES));
    wire.send(create(1, "assets/one.png"));
    wire.send(create(2, "assets/two.png", largest));
    wire.send(create(3, "assets/three.png", largest));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken();

    // the first is still being stored: the next page's files wait, with the whole room for them
    wire.send(create(1, "assets/four.png", largest));
    wire.send(create(2, "assets/five.png", largest));
    wire.send(create(3, "assets/six.png"));
    await settled();
    expect(taken()).toEqual([
      {
        type: "board.failed",
        requestId: 3,
        message: "too many new files are waiting to be stored",
      },
    ]);
    creates[0]?.store();
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png", "assets/four.png"]);
  }, 30_000);

  test("that waited when their page said hello again are not stored: no node will name them", async () => {
    const { wire, backend, creates, taken } = await bench();
    wire.send(create(1, "assets/one.png"));
    wire.send(create(2, "assets/two.png"));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken();
    creates[0]?.store();
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png"]);
    expect(taken()).toEqual([]);

    // the next page's file is stored, and nothing of the page before it is in its way
    wire.send(create(1, "assets/three.png", toBase64(new Uint8Array(NEW_FILE_LIMIT_BYTES))));
    wire.send(create(2, "assets/four.png", toBase64(new Uint8Array(NEW_FILE_LIMIT_BYTES))));
    await settled();
    expect(backend.calls.createFile).toEqual(["assets/one.png", "assets/three.png"]);
    expect(taken()).toEqual([]);
  }, 30_000);
});

describe("files a page asks to have shown", () => {
  test("are shown one at a time, in the order they came", async () => {
    const { wire, shows, taken } = await bench();
    wire.send(show(1, "process/order.bpmn"));
    wire.send(show(2, "docs/readme.md"));
    await settled();
    expect(shows.map((one) => one.path)).toEqual(["process/order.bpmn"]);

    shows[0]?.shown();
    await settled();
    expect(shows.map((one) => one.path)).toEqual(["process/order.bpmn", "docs/readme.md"]);
    expect(taken()).toEqual([{ type: "board.done", requestId: 1 }]);

    // behind the one that is being shown there is room again
    wire.send(show(3, "process/order.bpmn"));
    await settled();
    shows[1]?.refuse(new Error("docs/readme.md does not exist"));
    await settled();
    shows[2]?.shown();
    await settled();
    expect(shows).toHaveLength(3);
    expect(taken()).toEqual([
      { type: "board.failed", requestId: 2, message: "docs/readme.md does not exist" },
      { type: "board.done", requestId: 3 },
    ]);
  });

  test("wait one at a time behind the one that is being shown: one more is told that the host is busy", async () => {
    const { wire, shows, taken } = await bench();
    expect(SHOWS_WAITING).toBe(1);
    // a page that asks for file after file would keep the front of the place for as long as it asks
    for (let requestId = 1; requestId <= 500; requestId++) {
      wire.send(show(requestId, `docs/page-${requestId}.md`));
    }
    await settled();
    expect(shows.map((one) => one.path)).toEqual(["docs/page-1.md"]);
    const refused = taken();
    expect(refused).toHaveLength(498);
    expect(refused[0]).toEqual({ type: "board.failed", requestId: 3, message: BUSY_SHOWS });
    expect(new Set(refused.map((answer) => "message" in answer && answer.message))).toEqual(
      new Set([BUSY_SHOWS]),
    );

    // the two that were taken are shown, and nothing of the others ever is
    shows[0]?.shown();
    await settled();
    shows[1]?.shown();
    await settled();
    expect(shows.map((one) => one.path)).toEqual(["docs/page-1.md", "docs/page-2.md"]);
    expect(taken()).toEqual([
      { type: "board.done", requestId: 1 },
      { type: "board.done", requestId: 2 },
    ]);
    // one that was refused took no room: a request still gets its answer
    wire.send(show(501, "docs/readme.md"));
    await settled();
    expect(shows).toHaveLength(3);
  });

  test("are not shown for a page that is gone, and one that is being shown is answered to nobody", async () => {
    const { wire, shows, taken } = await bench();
    wire.send(show(1, "process/order.bpmn"));
    wire.send(show(2, "docs/readme.md"));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken();
    shows[0]?.shown();
    await settled();
    expect(shows).toHaveLength(1);
    expect(taken()).toEqual([]);

    wire.send(show(1, "docs/readme.md"));
    await settled();
    shows[1]?.shown();
    await settled();
    expect(taken()).toEqual([{ type: "board.done", requestId: 1 }]);
  });
});

describe("the requests that wait for their answer", () => {
  test("are bounded: one more than the limit is failed at once, and room comes back with every answer", async () => {
    const { wire, backend, reads, taken } = await bench();
    expect(WAITING_LIMIT).toBe(4096);
    // of every kind together: reads of one path, a show, a new file, an open, a settle
    wire.send(show(1, "docs/readme.md"));
    wire.send(create(2, "assets/one.png"));
    for (let requestId = 3; requestId <= WAITING_LIMIT; requestId++) {
      wire.send(read(requestId, "assets/a.png"));
    }
    await settled();
    expect(taken()).toEqual([]);

    wire.send(read(9001, "assets/a.png"));
    wire.send(read(9002, "assets/other.png"));
    wire.send(show(9003, "docs/readme.md"));
    wire.send(create(9004, "assets/two.png"));
    wire.send({ type: "board.text.open", requestId: 9005, path: "models/tea.owm" });
    wire.send({ type: "board.text.settle", requestId: 9006 });
    await settled();
    expect(taken()).toEqual(
      [9001, 9002, 9003, 9004, 9005, 9006].map((requestId) => ({
        type: "board.failed",
        requestId,
        message: BUSY,
      })),
    );
    // nothing of them reached the backend
    expect(backend.calls).toEqual({
      openText: [],
      readBytes: ["assets/a.png"],
      createFile: ["assets/one.png"],
    });

    // one read answers every request that joined it: all of them make room
    reads[0]?.answer(undefined);
    await settled();
    const [answer] = taken();
    expect(answer && "alsoFor" in answer && answer.alsoFor).toHaveLength(WAITING_LIMIT - 3);
    wire.send({ type: "board.text.open", requestId: 9007, path: "models/tea.owm" });
    await settled();
    expect(taken().map((message) => message.type)).toEqual(["board.text.opened"]);
  });

  test("a request that is failed for its path waits for nothing and takes no room", async () => {
    const { wire, taken } = await bench();
    for (let requestId = 1; requestId <= WAITING_LIMIT + 10; requestId++) {
      wire.send(read(requestId, "../outside.png"));
    }
    await settled();
    expect(taken()).toHaveLength(WAITING_LIMIT + 10);
    wire.send({ type: "board.text.settle", requestId: 1 });
    await settled();
    expect(taken()).toEqual([{ type: "board.done", requestId: 1 }]);
  });

  test("give their room back with their answer, whatever was asked and however it ended", async () => {
    const { wire, backend, shows, taken } = await bench(true);
    const more = WAITING_LIMIT + 1;
    /** more requests than may wait at once, a few at a time, each answered before the next few */
    const inTurns = async (
      message: (requestId: number) => unknown,
      atATime = 64,
    ): Promise<number> => {
      for (let requestId = 1; requestId <= more; requestId++) {
        wire.send(message(requestId));
        if (requestId % atATime === 0) await settled();
      }
      await settled();
      const answers = taken();
      expect(answers).toHaveLength(more);
      const busy = [BUSY, BUSY_SHOWS];
      return answers.filter((answer) => "message" in answer && busy.includes(answer.message))
        .length;
    };

    expect(await inTurns((requestId) => ({ type: "board.text.settle", requestId }))).toBe(0);
    expect(
      await inTurns((requestId) => ({
        type: "board.text.open",
        requestId,
        path: "models/tea.owm",
      })),
    ).toBe(0);
    // an open the backend refuses
    expect(
      await inTurns((requestId) => ({
        type: "board.text.open",
        requestId,
        path: "models/missing.owm",
      })),
    ).toBe(0);
    expect(await inTurns((requestId) => create(requestId, `assets/new-${requestId}.png`))).toBe(0);
    expect(backend.calls.createFile).toHaveLength(more);
    // of the files to be shown one waits behind the one that is being shown
    expect(await inTurns((requestId) => show(requestId, "docs/readme.md"), 2)).toBe(0);
    expect(shows).toHaveLength(more);
    expect(await inTurns((requestId) => read(requestId, `assets/${requestId}.png`))).toBe(0);
  });

  test("of a page that is gone do not free room of the next one when their answer comes", async () => {
    const { wire, shows, creates, reads, taken } = await bench();
    // the page before left one of each kind with the backend
    wire.send(show(1, "docs/readme.md"));
    wire.send(create(2, "assets/one.png"));
    wire.send(read(3, "assets/a.png"));
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    for (let requestId = 1; requestId <= WAITING_LIMIT; requestId++) {
      wire.send(read(requestId, "assets/b.png"));
    }
    await settled();
    taken();

    shows[0]?.shown();
    creates[0]?.store();
    reads[0]?.answer(png);
    await settled();
    wire.send({ type: "board.text.settle", requestId: 9001 });
    await settled();

    // the room is the next page's own: full as it was
    expect(taken()).toEqual([{ type: "board.failed", requestId: 9001, message: BUSY }]);
  });

  test("of a page that is gone take no room from the next one", async () => {
    const { wire, reads, taken } = await bench();
    for (let requestId = 1; requestId <= WAITING_LIMIT; requestId++) {
      wire.send(read(requestId, "assets/a.png"));
    }
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken();
    for (let requestId = 1; requestId <= WAITING_LIMIT; requestId++) {
      wire.send(read(requestId, "assets/a.png"));
    }
    wire.send(read(9001, "assets/a.png"));
    await settled();
    expect(taken()).toEqual([{ type: "board.failed", requestId: 9001, message: BUSY }]);

    // the second page's own read answers its requests, and frees their room
    expect(reads).toHaveLength(2);
    reads[1]?.answer(png);
    await settled();
    expect(taken()).toHaveLength(1);
    wire.send(read(9002, "assets/a.png"));
    await settled();
    expect(taken()).toEqual([]);
    expect(reads).toHaveLength(3);
  });
});

describe("the edits that wait for their turn", () => {
  const PATH = "models/tea.owm";

  test("hold no more than the limit together: one beyond it is not kept, and is told as refused", async () => {
    const { wire, backend, taken } = await bench();
    const gate = deferred<boolean>();
    const handed: number[] = [];
    backend.onWrite = (_path, text) => {
      handed.push(text.length);
      return gate.promise;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: PATH });
    await settled();
    taken();
    expect(HELD_EDITS_LIMIT).toBe(32 * 1024 * 1024);
    const half = "x".repeat(HELD_EDITS_LIMIT / 2);
    wire.send({ type: "board.text.edit", path: PATH, text: half, version: 1 });
    wire.send({ type: "board.text.edit", path: PATH, text: `${half.slice(1)}y`, version: 1 });
    // one character is left of the limit
    wire.send({ type: "board.text.edit", path: PATH, text: "zz", version: 1 });
    await settled();
    expect(handed).toEqual([half.length]);

    gate.resolve(true);
    await settled();
    // the place was never handed the third; the page has its own text in its place again
    expect(handed).toEqual([half.length, half.length]);
    const [update, word] = taken();
    expect(update).toMatchObject({ type: "board.text.update", path: PATH, version: 2 });
    expect(word).toEqual({ type: "board.text.dropped", path: PATH, reason: "refused" });

    // what waited was let go of: the next edit is kept and written
    backend.onWrite = undefined;
    wire.send({ type: "board.text.edit", path: PATH, text: "small", version: 2 });
    await settled();
    expect(backend.textOf(PATH)).toBe("small");
    expect(taken()).toEqual([]);
  }, 30_000);

  /** a backend whose writes of `PATH` wait for the test, one gate per write */
  async function held(): Promise<{
    bench: Bench;
    /** the texts the place was handed, in order */
    handed: string[];
    /** lets the write the place holds land */
    land(): void;
    /** lets that write and every later one land */
    release(): void;
    edit(text: string, path?: string): void;
  }> {
    const made = await bench();
    const handed: string[] = [];
    const gates: Array<() => void> = [];
    let holding = true;
    made.backend.onWrite = (path, text, base, write) => {
      if (path !== PATH) return write(text, base);
      handed.push(text);
      if (!holding) return write(text, base);
      return new Promise<boolean>((resolve) => {
        gates.push(() => resolve(write(text, base)));
      });
    };
    made.wire.send({ type: "board.text.open", requestId: 1, path: PATH });
    await settled();
    made.taken();
    return {
      bench: made,
      handed,
      land: () => gates.shift()?.(),
      release() {
        holding = false;
        for (const gate of gates.splice(0)) gate();
      },
      edit: (text, path = PATH) =>
        made.wire.send({ type: "board.text.edit", path, text, version: 1 }),
    };
  }

  test("are no more than the limit, however small: one beyond it gets no place in the line, and is told as refused", async () => {
    const { bench: made, handed, release, edit } = await held();
    expect(WAITING_EDITS_LIMIT).toBe(4096);
    // a few characters each: far below what the waiting edits may hold together
    for (let count = 1; count <= WAITING_EDITS_LIMIT; count++) edit(`e${count}`);
    await settled();
    // What an edit beyond the limit must not cost is memory, which no answer shows: so the heap
    // is read. A step of a path's line per edit was measured at 1 KB, 300 MB for these.
    const before = process.memoryUsage().heapUsed;
    const beyond = 300_000;
    for (let count = 1; count <= beyond; count++) {
      edit(`b${count}`);
      if (count % 10_000 === 0) await settled();
    }
    await settled();
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(100 * 1024 * 1024);
    expect(handed).toEqual(["e1"]);

    release();
    await settled();
    // the place was handed the edits that had a place, each once, and none of the others
    expect(handed).toHaveLength(WAITING_EDITS_LIMIT);
    expect(handed.at(-1)).toBe(`e${WAITING_EDITS_LIMIT}`);
    expect(made.backend.textOf(PATH)).toBe(`e${WAITING_EDITS_LIMIT}`);
    // the page shows its own last text: it gets the place's again, and the word, once
    expect(made.taken()).toEqual([
      { type: "board.text.update", path: PATH, text: `e${WAITING_EDITS_LIMIT}`, version: 2 },
      { type: "board.text.dropped", path: PATH, reason: "refused" },
    ]);

    // room came back with every write: the next edit is written
    made.backend.onWrite = undefined;
    made.wire.send({ type: "board.text.edit", path: PATH, text: "after", version: 2 });
    await settled();
    expect(made.backend.textOf(PATH)).toBe("after");
    expect(made.taken()).toEqual([]);
  }, 30_000);

  test("say nothing of one that got no place where an edit that came after it is in the place", async () => {
    const { bench: made, handed, land, release, edit } = await held();
    for (let count = 1; count <= WAITING_EDITS_LIMIT; count++) edit(`e${count}`);
    edit("beyond");
    await settled();
    // one write lands and makes room for one edit: the page made it from the text that got none
    land();
    await settled();
    edit("made from beyond");
    await settled();
    release();
    await settled();

    expect(handed).toHaveLength(WAITING_EDITS_LIMIT + 1);
    expect(made.backend.textOf(PATH)).toBe("made from beyond");
    expect(made.taken()).toEqual([]);
  }, 30_000);

  test("of one path leave an edit of another path without a place: it is told as refused at once, and waits for nothing", async () => {
    const { bench: made, handed, edit } = await held();
    const OTHER = "models/chai.owm";
    made.backend.memory.outside(OTHER, "title Chai\n");
    made.wire.send({ type: "board.text.open", requestId: 2, path: OTHER });
    await settled();
    made.taken();
    for (let count = 1; count <= WAITING_EDITS_LIMIT; count++) edit(`e${count}`);
    await settled();

    edit("chai 1", OTHER);
    edit("chai 2", OTHER);
    await settled();

    // nothing of the other path reached the place, and its page was told so without a wait
    expect(handed).toEqual(["e1"]);
    expect(made.backend.textOf(OTHER)).toBe("title Chai\n");
    expect(made.taken()).toEqual([
      { type: "board.text.update", path: OTHER, text: "title Chai\n", version: 2 },
      { type: "board.text.dropped", path: OTHER, reason: "refused" },
    ]);
  }, 30_000);
});
