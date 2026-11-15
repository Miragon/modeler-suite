/**
 * Each side of the protocol alone, message by message: the server against a page that posts
 * whatever it likes, and the client against a host a test scripts.
 */
import { describe, expect, test } from "vitest";
import {
  createFilesClient,
  fromBase64,
  isBoardMessage,
  NEW_FILE_LIMIT_BYTES,
  PROTOCOL,
  serveFiles,
  toBase64,
  type ClientMessage,
  type HostMessage,
} from "../src/index.js";
import {
  createCountingBackend,
  createWire,
  deferred,
  PNG_BASE64,
  settled,
  type CountingBackend,
  type Wire,
} from "./support/wire.js";

const TEA = "title Tea\ncomponent Cup [0.8, 0.7]\n";
const PNG = fromBase64(PNG_BASE64);

const files = () => ({
  "models/tea.owm": TEA,
  "models/sample.tt": "{}",
  "assets/logo.png": { bytes: PNG, mime: "image/png" },
});

/** a server on a wire, and the page's hello already answered unless a test says its own */
async function served(hello = true): Promise<{ wire: Wire; backend: CountingBackend }> {
  const wire = createWire();
  const backend = createCountingBackend(files());
  serveFiles(wire.host, backend);
  if (hello) {
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    wire.fromHost.length = 0;
  }
  return { wire, backend };
}

/** what the host posted since the test last looked */
function taken(wire: Wire): HostMessage[] {
  return wire.fromHost.splice(0);
}

describe("the messages", () => {
  // a type added to the protocol and not to this table fails the type check
  const TYPES = {
    "board.hello": "page",
    "board.text.open": "page",
    "board.text.edit": "page",
    "board.text.close": "page",
    "board.bytes.read": "page",
    "board.file.create": "page",
    "board.paths": "host",
    "board.text.opened": "host",
    "board.text.update": "host",
    "board.text.gone": "host",
    "board.moved": "host",
    "board.bytes": "host",
    "board.bytes.changed": "host",
    "board.done": "host",
    "board.failed": "host",
  } satisfies Record<ClientMessage["type"], "page"> & Record<HostMessage["type"], "host">;
  // the types of @miragon/modeler-shell's document sync, which share a webview's channel
  const SHELL_TYPES = [
    "init",
    "update",
    "problems",
    "command",
    "ready",
    "edit",
    "insertExample",
    "showProblems",
    "info",
    "error",
    "export",
    "modelerShell.appearance",
  ];

  test("every type starts with board. and none is one of the shell's", () => {
    for (const type of Object.keys(TYPES)) {
      expect(type.startsWith("board.")).toBe(true);
      expect(SHELL_TYPES).not.toContain(type);
      expect(isBoardMessage({ type })).toBe(true);
    }
    for (const type of SHELL_TYPES) expect(isBoardMessage({ type })).toBe(false);
  });

  test("the protocol is version 1", () => {
    expect(PROTOCOL).toBe(1);
  });

  test("isBoardMessage takes an object with such a type and nothing else", () => {
    expect(isBoardMessage({ type: "board.anything", more: 1 })).toBe(true);
    for (const value of [null, undefined, "board.hello", 5, [], ["board.hello"], {}]) {
      expect(isBoardMessage(value)).toBe(false);
    }
    expect(isBoardMessage({ type: 5 })).toBe(false);
    expect(isBoardMessage({ type: "board" })).toBe(false);
    expect(isBoardMessage({ type: " board.hello" })).toBe(false);
  });

  test("bytes come back from base64 as they went in, a megabyte of them too", () => {
    const every = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect([...fromBase64(toBase64(every))]).toEqual([...every]);
    expect(toBase64(new Uint8Array())).toBe("");
    expect(fromBase64("").length).toBe(0);
    expect(toBase64(PNG)).toBe(PNG_BASE64);
    // longer than one chunk of the encoder, and not a multiple of it
    const large = Uint8Array.from({ length: 0x8000 * 32 + 7 }, (_, index) => (index * 31) % 251);
    const back = fromBase64(toBase64(large));
    expect(back.length).toBe(large.length);
    expect(back.every((byte, index) => byte === large[index])).toBe(true);
  });
});

describe("the server, before the hello", () => {
  test("pushes nothing, whatever the backend does", async () => {
    const { wire, backend } = await served(false);
    backend.outside("models/new.owm", TEA);
    backend.remove("models/sample.tt");
    backend.move("models/tea.owm", "models/green-tea.owm");
    await backend.createFile("assets/new.png", PNG, "image/png");
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.subscriptions()).toBe(0);
  });

  test.each<[string, Record<string, unknown>]>([
    ["an open", { type: "board.text.open", requestId: 7, path: "models/tea.owm" }],
    ["a read", { type: "board.bytes.read", requestId: 7, path: "assets/logo.png" }],
    [
      "a create",
      {
        type: "board.file.create",
        requestId: 7,
        path: "assets/new.png",
        base64: PNG_BASE64,
        mime: "image/png",
      },
    ],
  ])("fails %s and asks the backend nothing", async (_what, message) => {
    const { wire, backend } = await served(false);
    wire.send(message);
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 7, message: "the page has not said hello" },
    ]);
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
    expect(backend.list()).not.toContain("assets/new.png");
  });

  test("drops an edit and a close: nothing is written, nothing is answered", async () => {
    const { wire, backend } = await served(false);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "gone" });
    wire.send({ type: "board.text.close", path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.textOf("models/tea.owm")).toBe(TEA);
    expect(backend.writes).toEqual([]);
  });

  test("a hello of another protocol is none: no list, and every request is told why", async () => {
    const { wire, backend } = await served(false);
    wire.send({ type: "board.hello", protocol: 2 });
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    backend.outside("models/new.owm", TEA);
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "this host speaks protocol 1, the page said 2",
      },
    ]);
    expect(backend.calls.openText).toEqual([]);
    // the page's next life says the right hello and is served
    wire.fromHost.length = 0;
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    expect(wire.fromHost.map((message) => message.type)).toEqual(["board.paths"]);
  });

  test("a hello without a protocol is none either", async () => {
    const { wire } = await served(false);
    wire.send({ type: "board.hello" });
    wire.send({ type: "board.bytes.read", requestId: 3, path: "assets/logo.png" });
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.failed",
        requestId: 3,
        message: "this host speaks protocol 1, the page said undefined",
      },
    ]);
  });
});

describe("the server, the list", () => {
  test("answers the hello with the whole list, and with nothing else", async () => {
    const { wire } = await served(false);
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.paths", paths: ["assets/logo.png", "models/sample.tt", "models/tea.owm"] },
    ]);
  });

  test("sends the whole list again after every change of it", async () => {
    const { wire, backend } = await served();
    backend.outside("models/new.owm", TEA);
    backend.remove("models/sample.tt");
    await settled();
    expect(taken(wire)).toEqual([
      {
        type: "board.paths",
        paths: ["assets/logo.png", "models/new.owm", "models/sample.tt", "models/tea.owm"],
      },
      { type: "board.paths", paths: ["assets/logo.png", "models/new.owm", "models/tea.owm"] },
    ]);
    // a text that changed is no change of the list
    backend.outside("models/tea.owm", `${TEA}note A [0.1, 0.1]\n`);
    await settled();
    expect(taken(wire)).toEqual([]);
  });

  test("ignores what is no message of the protocol", async () => {
    const { wire, backend } = await served();
    for (const message of [null, "board.hello", 5, {}, { type: "init" }, { type: 7 }, []]) {
      wire.send(message);
    }
    wire.send({ type: "edit", requestId: 1, path: "models/tea.owm", text: "x" });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.textOf("models/tea.owm")).toBe(TEA);
  });

  test("drops a request without an id: there is nothing it could be answered with", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", path: "models/tea.owm" });
    wire.send({ type: "board.text.open", requestId: "1", path: "models/tea.owm" });
    wire.send({ type: "board.bytes.read", path: "assets/logo.png" });
    wire.send({ type: "board.file.create", path: "assets/new.png", base64: PNG_BASE64 });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
  });

  test.each<[string, unknown]>([
    ["NaN, which is a number and travels as null", Number.NaN],
    ["a fraction", 1.5],
    ["infinity", Number.POSITIVE_INFINITY],
    ["a number too large to count with", 2 ** 60],
    ["a text", "7"],
    ["null", null],
  ])("drops a request whose id is %s, and opens nothing for it", async (_what, requestId) => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId, path: "models/tea.owm" });
    wire.send({ type: "board.bytes.read", requestId, path: "assets/logo.png" });
    wire.send({ type: "board.file.create", requestId, path: "assets/new.png", base64: PNG_BASE64 });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
    expect(backend.openTexts()).toBe(0);
  });

  test("fails a request of a type it does not know, so that no page waits for ever", async () => {
    const { wire } = await served();
    wire.send({ type: "board.text.rename", requestId: 4, path: "models/tea.owm" });
    wire.send({ type: "board.text.rename", path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 4, message: "unknown request board.text.rename" },
    ]);
  });
});

describe("the server, a text", () => {
  test("opens it with the backend's text", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.text.opened",
        requestId: 1,
        path: "models/tea.owm",
        text: TEA,
        readOnly: false,
      },
    ]);
    expect(backend.openTexts()).toBe(1);
  });

  test("says read only where the backend does", async () => {
    const { wire, backend } = await served();
    backend.readOnly = true;
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost[0]).toMatchObject({ type: "board.text.opened", readOnly: true });
  });

  test("writes an edit into the backend and sends nothing back", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "title Coffee\n" });
    await settled();
    expect(backend.writes).toEqual([{ path: "models/tea.owm", text: "title Coffee\n" }]);
    expect(backend.textOf("models/tea.owm")).toBe("title Coffee\n");
    expect(wire.fromHost).toEqual([]);
  });

  test("writes the edits of one path in the order they came", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    for (const text of ["one", "two", "three"]) {
      wire.send({ type: "board.text.edit", path: "models/tea.owm", text });
    }
    await settled();
    expect(backend.writes.map((write) => write.text)).toEqual(["one", "two", "three"]);
  });

  test("answers a write the backend refused with the text as the backend has it", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    backend.onWrite = async () => false;
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "refused" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: TEA },
    ]);
    expect(backend.textOf("models/tea.owm")).toBe(TEA);
  });

  test("takes a write that rejects for a refused one", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    backend.onWrite = () => Promise.reject(new Error("the disk is full"));
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "refused" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: TEA },
    ]);
  });

  test("hands the backend one write at a time, in the page's order", async () => {
    const { wire, backend } = await served();
    const started: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred<boolean>>>();
    backend.onWrite = (_path, text) => {
      started.push(text);
      const gate = deferred<boolean>();
      gates.set(text, gate);
      return gate.promise;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    for (const text of ["one", "two", "three"]) {
      wire.send({ type: "board.text.edit", path: "models/tea.owm", text });
    }
    await settled();
    expect(started).toEqual(["one"]);
    gates.get("one")?.resolve(true);
    await settled();
    expect(started).toEqual(["one", "two"]);
    // a write that rejects does not hold up the one behind it
    gates.get("two")?.reject(new Error("the disk is full"));
    await settled();
    expect(started).toEqual(["one", "two", "three"]);
    gates.get("three")?.resolve(true);
    await settled();
    expect(backend.wrongWrites()).toBe(0);
  });

  test("answers a refused write only once the write behind it settled, and not at all where the backend took that", async () => {
    const { wire, backend } = await served();
    const gates: Array<ReturnType<typeof deferred<boolean>>> = [];
    backend.onWrite = () => {
      const gate = deferred<boolean>();
      gates.push(gate);
      return gate.promise;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "one" });
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "two" });
    await settled();
    gates[0]?.resolve(false);
    await settled();
    // the page shows "two" and the backend is about to take it: an answer now would be wrong
    expect(wire.fromHost).toEqual([]);
    gates[1]?.resolve(true);
    await settled();
    expect(wire.fromHost).toEqual([]);
  });

  test("answers once for the writes it refused in a row, with the text the backend has then", async () => {
    const { wire, backend } = await served();
    const real = { write: true };
    backend.onWrite = async (path, text) => {
      if (!real.write) return false;
      backend.outside(path, `kept ${text}`);
      return true;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "one" });
    await settled();
    // the place took the first write and made a text of its own of it
    expect(taken(wire)).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: "kept one" },
    ]);
    real.write = false;
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "two" });
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "three" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: "kept one" },
    ]);
  });

  test("a write with the close right behind it lands before the text is closed", async () => {
    const { wire, backend } = await served();
    const gate = deferred<boolean>();
    let landed = 0;
    backend.onWrite = async () => {
      await gate.promise;
      landed += 1;
      return true;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "one" });
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "two" });
    wire.send({ type: "board.text.close", path: "models/tea.owm" });
    await settled();
    // still open: the first write is on its way and the second waits behind it
    expect(backend.openTexts()).toBe(1);
    gate.resolve(true);
    await settled();
    expect(landed).toBe(2);
    expect(backend.openTexts()).toBe(0);
    expect(backend.wrongWrites()).toBe(0);
  });

  test("never writes a read-only text, and answers with the text it has", async () => {
    const { wire, backend } = await served();
    backend.readOnly = true;
    let asked = 0;
    backend.onWrite = async () => {
      asked += 1;
      return true;
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "not allowed" });
    await settled();
    expect(asked).toBe(0);
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: TEA },
    ]);
  });

  test("drops an edit of a path that is not open, of a bad path and of no text", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/sample.tt", text: "not open" });
    wire.send({ type: "board.text.edit", path: "../models/tea.owm", text: "outside" });
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: { no: "text" } });
    wire.send({ type: "board.text.edit", path: "models/tea.owm" });
    await settled();
    expect(backend.writes).toEqual([]);
    expect(wire.fromHost).toEqual([]);
  });

  test("sends a change from outside, and none once the path is closed", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    backend.outside("models/tea.owm", "title Outside\n");
    await settled();
    expect(taken(wire)).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: "title Outside\n" },
    ]);
    wire.send({ type: "board.text.close", path: "models/tea.owm" });
    await settled();
    expect(backend.openTexts()).toBe(0);
    backend.outside("models/tea.owm", "title Later\n");
    await settled();
    expect(wire.fromHost).toEqual([]);
    // and an edit of the closed path writes nothing
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "closed" });
    await settled();
    expect(backend.textOf("models/tea.owm")).toBe("title Later\n");
  });

  test("sends no change of a text the page did not open", async () => {
    const { wire, backend } = await served();
    backend.outside("models/tea.owm", "title Outside\n");
    await settled();
    expect(wire.fromHost).toEqual([]);
  });

  test("says that a file is gone, and sends its text when it is back", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    backend.remove("models/tea.owm");
    await settled();
    expect(taken(wire)).toEqual([
      { type: "board.paths", paths: ["assets/logo.png", "models/sample.tt"] },
      { type: "board.text.gone", path: "models/tea.owm" },
    ]);
    backend.outside("models/tea.owm", "title Back\n");
    await settled();
    expect(taken(wire)).toEqual([
      { type: "board.paths", paths: ["assets/logo.png", "models/sample.tt", "models/tea.owm"] },
      { type: "board.text.update", path: "models/tea.owm", text: "title Back\n" },
    ]);
  });

  test("answers an edit of a file that is gone with nothing: it has no text to show", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    backend.remove("models/tea.owm");
    await settled();
    taken(wire);
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "into the void" });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.list()).not.toContain("models/tea.owm");
    // back again, a refused write is answered as ever
    backend.outside("models/tea.owm", "title Back\n");
    await settled();
    taken(wire);
    backend.onWrite = async () => false;
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "refused" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/tea.owm", text: "title Back\n" },
    ]);
  });

  test("fails a second open of a text whose file is gone", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    backend.remove("models/tea.owm");
    await settled();
    taken(wire);
    wire.send({ type: "board.text.open", requestId: 2, path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 2, message: "models/tea.owm is gone" },
    ]);
  });

  test("tells a move: the list, the move, and that the open text's file is gone", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    backend.move("models/tea.owm", "drinks/tea.owm");
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.paths", paths: ["assets/logo.png", "drinks/tea.owm", "models/sample.tt"] },
      { type: "board.moved", moves: [{ from: "models/tea.owm", to: "drinks/tea.owm" }] },
      { type: "board.text.gone", path: "models/tea.owm" },
    ]);
  });

  test("opens a path once at the backend, however often the page asks", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.text.open", requestId: 2, path: "models/tea.owm" });
    await settled();
    wire.send({ type: "board.text.open", requestId: 3, path: "models/tea.owm" });
    await settled();
    expect(
      wire.fromHost.map((message) => [message.type, "requestId" in message && message.requestId]),
    ).toEqual([
      ["board.text.opened", 1],
      ["board.text.opened", 2],
      ["board.text.opened", 3],
    ]);
    expect(backend.calls.openText).toEqual(["models/tea.owm"]);
    taken(wire);
    // one subscription: a change is sent once
    backend.outside("models/tea.owm", "title Outside\n");
    await settled();
    expect(wire.fromHost).toHaveLength(1);
  });

  test("fails an open the backend refuses with the backend's message, and asks anew next time", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/missing.owm" });
    wire.send({ type: "board.text.open", requestId: 2, path: "assets/logo.png" });
    await settled();
    expect(taken(wire)).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "models/missing.owm is no text file of this repository",
      },
      {
        type: "board.failed",
        requestId: 2,
        message: "assets/logo.png is no text file of this repository",
      },
    ]);
    expect(backend.openTexts()).toBe(0);
    backend.outside("models/missing.owm", TEA);
    await settled();
    taken(wire);
    wire.send({ type: "board.text.open", requestId: 3, path: "models/missing.owm" });
    await settled();
    expect(wire.fromHost[0]).toMatchObject({ type: "board.text.opened", requestId: 3, text: TEA });
  });

  test("a path closed before the backend opened it is failed and not left open", async () => {
    const { wire, backend } = await served();
    const slow = deferred<void>();
    const openText = backend.openText.bind(backend);
    backend.openText = async (path) => {
      await slow.promise;
      return openText(path);
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.text.close", path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([]);
    slow.resolve();
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.failed",
        requestId: 1,
        message: "models/tea.owm was closed before it was open",
      },
    ]);
    expect(backend.openTexts()).toBe(0);
  });
});

describe("the server, bytes and new files", () => {
  test("answers a read with the bytes and their type", async () => {
    const { wire } = await served();
    wire.send({ type: "board.bytes.read", requestId: 1, path: "assets/logo.png" });
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.bytes",
        requestId: 1,
        path: "assets/logo.png",
        base64: PNG_BASE64,
        mime: "image/png",
      },
    ]);
  });

  test("answers null for a file that is not there and for one that is a text", async () => {
    const { wire } = await served();
    wire.send({ type: "board.bytes.read", requestId: 1, path: "assets/missing.png" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.bytes", requestId: 1, path: "assets/missing.png", base64: null, mime: "" },
      { type: "board.bytes", requestId: 2, path: "models/tea.owm", base64: null, mime: "" },
    ]);
  });

  test("fails a read the backend could not do with the backend's message", async () => {
    const { wire, backend } = await served();
    backend.readBytes = () => Promise.reject(new Error("the file has more than 32 MiB"));
    wire.send({ type: "board.bytes.read", requestId: 1, path: "assets/logo.png" });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 1, message: "the file has more than 32 MiB" },
    ]);
  });

  test("stores a new file below assets and tells the list and the bytes", async () => {
    const { wire, backend } = await served();
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path: "assets/new.png",
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    expect(wire.fromHost).toEqual([
      {
        type: "board.paths",
        paths: ["assets/logo.png", "assets/new.png", "models/sample.tt", "models/tea.owm"],
      },
      { type: "board.bytes.changed", paths: ["assets/new.png"] },
      { type: "board.done", requestId: 1 },
    ]);
    const stored = await backend.readBytes("assets/new.png");
    expect(stored?.mime).toBe("image/png");
    expect([...(stored?.bytes ?? [])]).toEqual([...PNG]);
  });

  test("refuses a create of a file that exists, with the backend's message", async () => {
    const { wire, backend } = await served();
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path: "assets/logo.png",
      base64: toBase64(new Uint8Array([1, 2, 3])),
      mime: "image/png",
    });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 1, message: "assets/logo.png exists already" },
    ]);
    expect([...((await backend.readBytes("assets/logo.png"))?.bytes ?? [])]).toEqual([...PNG]);
  });

  test.each([
    ["a model's path", "models/tea.owm"],
    ["a new file of another folder", "models/new.png"],
    ["a file of the root", "new.png"],
    ["a folder below assets", "assets/icons/new.png"],
  ])("refuses a create at %s and stores nothing", async (_what, path) => {
    const { wire, backend } = await served();
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path,
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 1, message: "a new file goes into assets/" },
    ]);
    expect(backend.calls.createFile).toEqual([]);
    expect(backend.textOf("models/tea.owm")).toBe(TEA);
  });

  test.each([
    ["a name the board would not make", "assets/my picture.png"],
    ["a dot file", "assets/.gitignore"],
    ["a name with a dot at its end", "assets/new.png."],
    ["a device name of Windows", "assets/nul"],
    // the one the board can make: of a picture a person called aux.png
    ["a device name with a suffix", "assets/aux.png"],
  ])("refuses a create in assets under %s and says that it is the name", async (_what, path) => {
    const { wire, backend } = await served();
    const before = [...backend.list()];
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path,
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 1, message: "a new file cannot have this name" },
    ]);
    expect(backend.calls.createFile).toEqual([]);
    expect(backend.list()).toEqual(before);
  });

  test("fails a create whose bytes are no base64, and takes a missing type for none", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.file.create", requestId: 1, path: "assets/a.png", base64: "%%%" });
    wire.send({ type: "board.file.create", requestId: 2, path: "assets/b.png", mime: "image/png" });
    wire.send({
      type: "board.file.create",
      requestId: 3,
      path: "assets/c.png",
      base64: PNG_BASE64,
    });
    await settled();
    const answers = wire.fromHost.filter((message) => "requestId" in message);
    expect(answers.map((message) => [message.type, message.requestId])).toEqual([
      ["board.failed", 1],
      ["board.failed", 2],
      ["board.done", 3],
    ]);
    expect(backend.calls.createFile).toEqual(["assets/c.png"]);
    expect((await backend.readBytes("assets/c.png"))?.mime).toBe("");
  });
});

describe("the server, the bytes of a new file", () => {
  const NO_BYTES = "the bytes of the new file are no base64 text";

  // atob reads null as the text "null", which is base64 for three bytes, and 123 as "123"
  test.each<[string, unknown]>([
    ["null", null],
    ["a number", 123],
    ["an object", { base64: PNG_BASE64 }],
    ["an array", [PNG_BASE64]],
    ["true", true],
    ["nothing at all", undefined],
    ["a text that is no base64", "%%%"],
    ["base64 with a character too many", "AAAAA"],
  ])("refuses %s for the bytes and stores nothing", async (_what, base64) => {
    const { wire, backend } = await served();
    const before = [...backend.list()];
    wire.send({
      type: "board.file.create",
      requestId: 6,
      path: "assets/b.png",
      base64,
      mime: "image/png",
    });
    await settled();
    expect(wire.fromHost).toEqual([{ type: "board.failed", requestId: 6, message: NO_BYTES }]);
    expect(backend.calls.createFile).toEqual([]);
    expect(backend.list()).toEqual(before);
  });

  test("takes a type that is no text for none", async () => {
    const { wire, backend } = await served();
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path: "assets/c.png",
      base64: PNG_BASE64,
      mime: 5,
    });
    await settled();
    expect(wire.fromHost.at(-1)).toEqual({ type: "board.done", requestId: 1 });
    expect(await backend.readBytes("assets/c.png")).toEqual({ bytes: PNG, mime: "" });
  });

  test("takes a file of the board's limit and refuses a larger one before it reads it", async () => {
    const { wire, backend } = await served();
    // "AAAA" is three bytes of zero
    const atLimit = "AAAA".repeat(Math.ceil(NEW_FILE_LIMIT_BYTES / 3));
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path: "assets/large.png",
      base64: atLimit,
      mime: "image/png",
    });
    wire.send({
      type: "board.file.create",
      requestId: 2,
      path: "assets/larger.png",
      base64: `${atLimit}AAAA`,
      mime: "image/png",
    });
    await settled();
    // the refusal is there first: it is given before a byte is read
    expect(wire.fromHost.filter((message) => "requestId" in message)).toEqual([
      { type: "board.failed", requestId: 2, message: "a new file may have up to 10 MiB" },
      { type: "board.done", requestId: 1 },
    ]);
    expect(backend.calls.createFile).toEqual(["assets/large.png"]);
    const stored = await backend.readBytes("assets/large.png");
    expect(stored?.bytes.length).toBeGreaterThanOrEqual(NEW_FILE_LIMIT_BYTES);
    expect(stored?.bytes.length).toBeLessThan(NEW_FILE_LIMIT_BYTES + 3);
  });
});

describe("the server, the paths it refuses", () => {
  const BAD_PATHS: Array<[string, unknown]> = [
    ["an absolute path", "/etc/passwd"],
    ["a scheme", "file:///etc/passwd"],
    ["a drive letter", "C:/secret.owm"],
    ["two dots", "../outside/secret.owm"],
    ["two dots in the middle", "assets/../../secret.png"],
    ["a backslash", "assets\\..\\secret.png"],
    ["a NUL", "assets/a\0.png"],
    ["a line break", "models/tea.owm\n"],
    ["an empty path", ""],
    ["no path at all", undefined],
    ["a path that is no string", ["models/tea.owm"]],
    ["more than 1024 characters", `assets/${"a".repeat(1024)}`],
  ];

  test.each(BAD_PATHS)("fails an open, a read and a create with %s", async (_what, path) => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path });
    wire.send({ type: "board.bytes.read", requestId: 2, path });
    wire.send({
      type: "board.file.create",
      requestId: 3,
      path,
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    const message = "this path is outside the repository";
    expect(wire.fromHost).toEqual([
      { type: "board.failed", requestId: 1, message },
      { type: "board.failed", requestId: 2, message },
      { type: "board.failed", requestId: 3, message },
    ]);
    // the backend never saw the path
    expect(backend.calls).toEqual({ openText: [], readBytes: [], createFile: [] });
  });
});

describe("the server, the lives of a page", () => {
  test("a second hello closes what the page before it had open and sends the list again", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.text.open", requestId: 2, path: "models/sample.tt" });
    await settled();
    expect(backend.openTexts()).toBe(2);
    taken(wire);
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    expect(backend.openTexts()).toBe(0);
    expect(backend.subscriptions()).toBe(3);
    expect(taken(wire).map((message) => message.type)).toEqual(["board.paths"]);
    // the new page did not open the text: it hears nothing of it, and of the list once
    backend.outside("models/tea.owm", "title Outside\n");
    backend.outside("models/new.owm", TEA);
    await settled();
    expect(wire.fromHost.map((message) => message.type)).toEqual(["board.paths"]);
  });

  test("an answer that was awaited across a hello is never sent: the next page counts from 1 too", async () => {
    const { wire, backend } = await served();
    const slow = deferred<void>();
    const openText = backend.openText.bind(backend);
    const readBytes = backend.readBytes.bind(backend);
    backend.openText = async (path) => {
      await slow.promise;
      return openText(path);
    };
    backend.readBytes = async (path) => {
      await slow.promise;
      return readBytes(path);
    };
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "assets/logo.png" });
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken(wire);
    slow.resolve();
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.openTexts()).toBe(0);
  });

  test("a create that was awaited across a hello is stored and not answered", async () => {
    const { wire, backend } = await served();
    const slow = deferred<void>();
    const createFile = backend.createFile.bind(backend);
    backend.createFile = async (path, bytes, mime) => {
      await slow.promise;
      return createFile(path, bytes, mime);
    };
    wire.send({
      type: "board.file.create",
      requestId: 1,
      path: "assets/new.png",
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken(wire);
    slow.resolve();
    await settled();
    // the new page hears of the file as of any other change, and of no request it did not make
    expect(wire.fromHost.map((message) => message.type)).toEqual([
      "board.paths",
      "board.bytes.changed",
    ]);
    expect(backend.list()).toContain("assets/new.png");
  });

  test("what the backend refuses after a hello is not failed to the page that did not ask", async () => {
    const { wire, backend } = await served();
    const slow = deferred<void>();
    const refuse = async (path: string): Promise<never> => {
      await slow.promise;
      throw new Error(`${path} cannot be read`);
    };
    backend.openText = refuse;
    backend.readBytes = refuse;
    backend.createFile = refuse;
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.bytes.read", requestId: 2, path: "assets/logo.png" });
    wire.send({
      type: "board.file.create",
      requestId: 3,
      path: "assets/new.png",
      base64: PNG_BASE64,
      mime: "image/png",
    });
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    taken(wire);
    slow.resolve();
    await settled();
    expect(wire.fromHost).toEqual([]);
  });

  test("a refused write is not answered once its path was closed or its page is gone", async () => {
    const { wire, backend } = await served();
    const slow = deferred<boolean>();
    backend.onWrite = () => slow.promise;
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    wire.send({ type: "board.text.open", requestId: 2, path: "models/sample.tt" });
    await settled();
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "refused" });
    wire.send({ type: "board.text.edit", path: "models/sample.tt", text: "refused" });
    await settled();
    // one path is closed and opened again, then the whole page is new
    wire.send({ type: "board.text.close", path: "models/tea.owm" });
    wire.send({ type: "board.text.open", requestId: 3, path: "models/tea.owm" });
    await settled();
    taken(wire);
    slow.resolve(false);
    await settled();
    expect(wire.fromHost).toEqual([
      { type: "board.text.update", path: "models/sample.tt", text: "{}" },
    ]);
  });

  test("a refused write is not answered to the page after the one that wrote", async () => {
    const { wire, backend } = await served();
    const slow = deferred<boolean>();
    backend.onWrite = () => slow.promise;
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "refused" });
    await settled();
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    slow.resolve(false);
    await settled();
    expect(wire.fromHost).toEqual([]);
  });

  test("an open of a path that is open, with a hello right behind it, is not answered either", async () => {
    const { wire, backend } = await served();
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    // the open waits for nothing but its turn, and the hello is there before it
    wire.send({ type: "board.text.open", requestId: 2, path: "models/tea.owm" });
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    await settled();
    expect(wire.fromHost.map((message) => message.type)).toEqual(["board.paths"]);
    expect(backend.openTexts()).toBe(0);
  });

  test("dispose closes every text, ends every subscription and answers nothing more", async () => {
    const wire = createWire();
    const backend = createCountingBackend(files());
    const server = serveFiles(wire.host, backend);
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    expect(backend.openTexts()).toBe(1);
    expect(backend.subscriptions()).toBe(3);
    const slow = deferred<void>();
    const readBytes = backend.readBytes.bind(backend);
    backend.readBytes = async (path) => {
      await slow.promise;
      return readBytes(path);
    };
    wire.send({ type: "board.bytes.read", requestId: 2, path: "assets/logo.png" });
    await settled();
    taken(wire);

    server.dispose();
    expect(backend.openTexts()).toBe(0);
    expect(backend.subscriptions()).toBe(0);
    slow.resolve();
    backend.outside("models/tea.owm", "title Outside\n");
    backend.outside("models/new.owm", TEA);
    wire.send({ type: "board.text.open", requestId: 3, path: "models/tea.owm" });
    await settled();
    expect(wire.fromHost).toEqual([]);
    expect(backend.openTexts()).toBe(0);
    // a second dispose closes nothing twice: the counting backend throws on that
    server.dispose();
  });

  test("dispose lets a write that is on its way land, and closes the text after it", async () => {
    const wire = createWire();
    const backend = createCountingBackend(files());
    const server = serveFiles(wire.host, backend);
    const gate = deferred<boolean>();
    let landed = 0;
    backend.onWrite = async () => {
      await gate.promise;
      landed += 1;
      return false;
    };
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "one" });
    wire.send({ type: "board.text.edit", path: "models/tea.owm", text: "two" });
    await settled();
    taken(wire);
    server.dispose();
    expect(backend.subscriptions()).toBe(0);
    expect(backend.openTexts()).toBe(1);
    gate.resolve(true);
    await settled();
    expect(landed).toBe(2);
    expect(backend.openTexts()).toBe(0);
    expect(backend.wrongWrites()).toBe(0);
    // refused, and nobody is told: the page is gone
    expect(wire.fromHost).toEqual([]);
  });

  test("dispose closes a text the backend was still opening", async () => {
    const wire = createWire();
    const backend = createCountingBackend(files());
    const server = serveFiles(wire.host, backend);
    const slow = deferred<void>();
    const openText = backend.openText.bind(backend);
    backend.openText = async (path) => {
      await slow.promise;
      return openText(path);
    };
    wire.send({ type: "board.hello", protocol: PROTOCOL });
    wire.send({ type: "board.text.open", requestId: 1, path: "models/tea.owm" });
    await settled();
    taken(wire);
    server.dispose();
    slow.resolve();
    await settled();
    expect(backend.calls.openText).toEqual(["models/tea.owm"]);
    expect(backend.openTexts()).toBe(0);
    expect(wire.fromHost).toEqual([]);
  });
});

describe("the client", () => {
  /** a client on a wire, and a host that answers what the test posts */
  function page(): { wire: Wire; files: ReturnType<typeof createFilesClient> } {
    const wire = createWire();
    return { wire, files: createFilesClient(wire.page) };
  }

  test("says hello with its protocol first, and nothing else unasked", async () => {
    const { wire } = page();
    await settled();
    expect(wire.fromPage).toEqual([{ type: "board.hello", protocol: PROTOCOL }]);
  });

  test("keeps the list it was sent: the same array until the next one", async () => {
    const { wire, files: client } = page();
    const empty = client.paths();
    expect(empty).toEqual([]);
    expect(client.paths()).toBe(empty);
    let told = 0;
    const off = client.onPaths(() => void (told += 1));
    wire.host.post({ type: "board.paths", paths: ["b.owm", "a.owm"] });
    await settled();
    const first = client.paths();
    expect(first).toEqual(["b.owm", "a.owm"]);
    expect(client.paths()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(told).toBe(1);
    wire.host.post({ type: "board.paths", paths: ["b.owm", "a.owm"] });
    await settled();
    expect(client.paths()).not.toBe(first);
    expect(told).toBe(2);
    off();
    wire.host.post({ type: "board.paths", paths: [] });
    await settled();
    expect(client.paths()).toEqual([]);
    expect(told).toBe(2);
  });

  test("gives every request an id of its own and each answer to its request", async () => {
    const { wire, files: client } = page();
    const first = client.readBytes("assets/a.png");
    const second = client.readBytes("assets/b.png");
    const third = client.openText("models/tea.owm");
    await settled();
    expect(wire.fromPage.slice(1)).toEqual([
      { type: "board.bytes.read", requestId: 1, path: "assets/a.png" },
      { type: "board.bytes.read", requestId: 2, path: "assets/b.png" },
      { type: "board.text.open", requestId: 3, path: "models/tea.owm" },
    ]);
    // answered out of order
    wire.host.post({
      type: "board.text.opened",
      requestId: 3,
      path: "models/tea.owm",
      text: TEA,
      readOnly: true,
    });
    wire.host.post({
      type: "board.bytes",
      requestId: 2,
      path: "assets/b.png",
      base64: PNG_BASE64,
      mime: "image/png",
    });
    wire.host.post({
      type: "board.bytes",
      requestId: 1,
      path: "assets/a.png",
      base64: null,
      mime: "",
    });
    expect(await first).toBeUndefined();
    const blob = await second;
    expect(blob?.type).toBe("image/png");
    expect([...new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([
      ...PNG,
    ]);
    const session = await third;
    expect(session.path).toBe("models/tea.owm");
    expect(session.text()).toBe(TEA);
    expect(session.readOnly).toBe(true);
  });

  test("rejects with the host's message where the host failed the request", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("../secret.owm");
    const read = client.readBytes("/etc/passwd");
    const created = client.createFile?.("models/x.png", new Blob([PNG], { type: "image/png" }));
    await settled();
    for (const requestId of [1, 2, 3]) {
      wire.host.post({ type: "board.failed", requestId, message: `no ${requestId}` });
    }
    await expect(opened).rejects.toThrow("no 1");
    await expect(read).rejects.toThrow("no 2");
    await expect(created).rejects.toThrow("no 3");
  });

  test("posts a new file as base64 with the blob's type and resolves on done", async () => {
    const { wire, files: client } = page();
    let done = false;
    const created = client
      .createFile?.("assets/new.png", new Blob([PNG], { type: "image/png" }))
      .then(() => void (done = true));
    await settled();
    expect(wire.fromPage[1]).toEqual({
      type: "board.file.create",
      requestId: 1,
      path: "assets/new.png",
      base64: PNG_BASE64,
      mime: "image/png",
    });
    expect(done).toBe(false);
    wire.host.post({ type: "board.done", requestId: 1 });
    await created;
    expect(done).toBe(true);
  });

  test("rejects an open that is answered with something else", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("models/tea.owm");
    await settled();
    wire.host.post({ type: "board.done", requestId: 1 });
    await expect(opened).rejects.toThrow("models/tea.owm: unexpected answer");
  });

  test("ignores an answer nobody waits for and a change of a path nobody has open", async () => {
    const { wire, files: client } = page();
    wire.host.post({ type: "board.done", requestId: 99 });
    wire.host.post({ type: "board.failed", requestId: 98, message: "late" });
    wire.host.post({ type: "board.text.update", path: "models/tea.owm", text: "x" });
    wire.host.post({ type: "board.text.gone", path: "models/tea.owm" });
    await settled();
    expect(client.paths()).toEqual([]);
    expect(wire.fromPage).toHaveLength(1);
  });

  test("tells a file that is gone once, however often the host says so", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("models/tea.owm");
    await settled();
    wire.host.post({
      type: "board.text.opened",
      requestId: 1,
      path: "models/tea.owm",
      text: TEA,
      readOnly: false,
    });
    const session = await opened;
    const heard: string[] = [];
    session.onAvailable((available) => heard.push(available ? "back" : "gone"));
    session.onReplace((text) => heard.push(text));
    wire.host.post({ type: "board.text.gone", path: "models/tea.owm" });
    wire.host.post({ type: "board.text.gone", path: "models/tea.owm" });
    await settled();
    expect(heard).toEqual(["gone"]);
    wire.host.post({ type: "board.text.update", path: "models/tea.owm", text: "back" });
    wire.host.post({ type: "board.text.update", path: "models/tea.owm", text: "again" });
    await settled();
    expect(heard).toEqual(["gone", "back", "back", "again"]);
  });

  test("a file that is gone before its first reader is there is refused, and the host is told to close it", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("models/tea.owm");
    await settled();
    wire.host.post({
      type: "board.text.opened",
      requestId: 1,
      path: "models/tea.owm",
      text: TEA,
      readOnly: false,
    });
    wire.host.post({ type: "board.text.gone", path: "models/tea.owm" });
    await expect(opened).rejects.toThrow("models/tea.owm is gone");
    await settled();
    expect(wire.fromPage.slice(1)).toEqual([
      { type: "board.text.open", requestId: 1, path: "models/tea.owm" },
      { type: "board.text.close", path: "models/tea.owm" },
    ]);
    // and the next reader asks the host anew
    void client.openText("models/tea.owm").catch(() => {});
    await settled();
    expect(wire.fromPage[3]).toEqual({
      type: "board.text.open",
      requestId: 2,
      path: "models/tea.owm",
    });
  });

  test("does not act on a message its channel delivers after the dispose", async () => {
    // a channel whose unsubscribe comes too late for a message that is on its way
    let deliver: ((message: HostMessage) => void) | undefined;
    const client = createFilesClient({
      post: () => {},
      onMessage(listener) {
        deliver = listener;
        return () => {};
      },
    });
    let told = 0;
    client.onPaths(() => void (told += 1));
    deliver?.({ type: "board.paths", paths: ["a.owm"] });
    expect(client.paths()).toEqual(["a.owm"]);
    client.dispose();
    deliver?.({ type: "board.paths", paths: ["late.owm"] });
    expect(client.paths()).toEqual(["a.owm"]);
    expect(told).toBe(1);
  });

  test("dispose rejects what still waits, and every later call at once and without a message", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("models/tea.owm");
    const read = client.readBytes("assets/logo.png");
    await settled();
    client.dispose();
    await expect(opened).rejects.toThrow("the files were closed");
    await expect(read).rejects.toThrow("the files were closed");
    const posted = wire.fromPage.length;
    await expect(client.openText("models/tea.owm")).rejects.toThrow("the files were closed");
    await expect(client.readBytes("assets/logo.png")).rejects.toThrow("the files were closed");
    await expect(client.createFile?.("assets/a.png", new Blob([PNG]))).rejects.toThrow(
      "the files were closed",
    );
    expect(wire.fromPage).toHaveLength(posted);
    // and it hears nothing more
    let told = 0;
    client.onPaths(() => void (told += 1));
    wire.host.post({ type: "board.paths", paths: ["late.owm"] });
    await settled();
    expect(told).toBe(0);
    expect(client.paths()).toEqual([]);
    client.dispose();
  });

  test("a session of a disposed client writes and closes without a message", async () => {
    const { wire, files: client } = page();
    const opened = client.openText("models/tea.owm");
    await settled();
    wire.host.post({
      type: "board.text.opened",
      requestId: 1,
      path: "models/tea.owm",
      text: TEA,
      readOnly: false,
    });
    const session = await opened;
    client.dispose();
    const posted = wire.fromPage.length;
    session.write("title Late\n");
    session.close();
    await settled();
    expect(wire.fromPage).toHaveLength(posted);
    expect(session.text()).toBe(TEA);
  });
});
