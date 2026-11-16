import { encodeBoard } from "@miragon/board-schema-model";
import { describe, expect, test } from "vitest";
import {
  createAppStorage,
  createOpenStorage,
  memoryStore,
  picturesOf,
  resetRequested,
  type ExampleRepository,
  type KeyValueStore,
} from "../src/storage.js";

const PICTURE = { bytes: new Uint8Array([137, 80, 78, 71, 0, 255]), mime: "image/png" };

const EXAMPLE: ExampleRepository = {
  board: "the example board\n",
  files: {
    "models/tea.owm": "title Tea Shop\n",
    "models/sample.tt": "{}\n",
    "assets/logo.svg": { bytes: new Uint8Array([60, 115, 118, 103, 62]), mime: "image/svg+xml" },
  },
};

const keysOf = (store: KeyValueStore): string[] =>
  Array.from({ length: store.length }, (_, index) => store.key(index) ?? "").sort();

/** a store whose named calls throw, as a blocked or a full storage does */
function failing(calls: ReadonlyArray<keyof KeyValueStore>): KeyValueStore {
  const store = memoryStore();
  const refuse = (): never => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
  return {
    get length() {
      return calls.includes("length") ? refuse() : store.length;
    },
    key: (index) => (calls.includes("key") ? refuse() : store.key(index)),
    getItem: (key) => (calls.includes("getItem") ? refuse() : store.getItem(key)),
    setItem: (key, value) => (calls.includes("setItem") ? refuse() : store.setItem(key, value)),
    removeItem: (key) => (calls.includes("removeItem") ? refuse() : store.removeItem(key)),
  };
}

describe("what the app keeps in the browser", () => {
  test("nothing kept: the board and the files are the example's", () => {
    const kept = createAppStorage(memoryStore(), EXAMPLE);

    expect(kept.board()).toBe(EXAMPLE.board);
    expect(kept.files()).toEqual(EXAMPLE.files);
  });

  test("a board text is there for the next storage on the same store", () => {
    const store = memoryStore();

    expect(createAppStorage(store, EXAMPLE).keepBoard("another board\n")).toBe(true);

    expect(createAppStorage(store, EXAMPLE).board()).toBe("another board\n");
    expect(createAppStorage(store, EXAMPLE).files()).toEqual(EXAMPLE.files);
  });

  test("a changed file takes its place among the example's files and leaves the others", () => {
    const store = memoryStore();

    expect(createAppStorage(store, EXAMPLE).keepText("models/tea.owm", "title Coffee\n")).toBe(
      true,
    );

    const next = createAppStorage(store, EXAMPLE);
    expect(next.files()).toEqual({ ...EXAMPLE.files, "models/tea.owm": "title Coffee\n" });
    expect(next.board()).toBe(EXAMPLE.board);
  });

  test("the example's own text is kept by forgetting: an undone change leaves nothing behind", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBoard("another board\n");
    kept.keepText("models/tea.owm", "title Coffee\n");
    expect(keysOf(store)).toHaveLength(2);

    expect(kept.keepBoard(EXAMPLE.board)).toBe(true);
    expect(kept.keepText("models/tea.owm", "title Tea Shop\n")).toBe(true);

    expect(keysOf(store)).toEqual([]);
  });

  test("a new picture comes back with its bytes and its type", () => {
    const store = memoryStore();

    expect(
      createAppStorage(store, EXAMPLE).keepBytes("assets/new.png", PICTURE.bytes, PICTURE.mime),
    ).toBe(true);

    const files = createAppStorage(store, EXAMPLE).files();
    expect(files["assets/new.png"]).toEqual(PICTURE);
    expect(Object.keys(files).sort()).toEqual(
      [...Object.keys(EXAMPLE.files), "assets/new.png"].sort(),
    );
  });

  test("what fits no file of the example is left out", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    // a text for a path the example does not have, and one for a path that is a picture there
    kept.keepText("models/gone.owm", "title Gone\n");
    kept.keepText("assets/logo.svg", "<svg/>");
    // bytes outside assets/, in a folder below it, and over a file of the example
    kept.keepBytes("models/new.png", PICTURE.bytes, PICTURE.mime);
    kept.keepBytes("assets/deeper/new.png", PICTURE.bytes, PICTURE.mime);
    kept.keepBytes("assets/logo.svg", PICTURE.bytes, PICTURE.mime);
    expect(keysOf(store)).toHaveLength(5);

    expect(createAppStorage(store, EXAMPLE).files()).toEqual(EXAMPLE.files);
  });

  test("a value another program left under a picture's key hides no other file", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBytes("assets/a.png", PICTURE.bytes, PICTURE.mime);
    kept.keepText("models/tea.owm", "title Coffee\n");
    const pictureKey = keysOf(store).find((key) => key.endsWith("assets/a.png")) ?? "";
    for (const [name, value] of [
      ["b", "no JSON"],
      ["c", JSON.stringify({ mime: "image/png" })],
      ["d", JSON.stringify(["image/png", "AAAA"])],
      ["e", JSON.stringify({ mime: "image/png", base64: "not base64 !" })],
    ] as const) {
      store.setItem(pictureKey.replace("a.png", `${name}.png`), value);
    }

    expect(createAppStorage(store, EXAMPLE).files()).toEqual({
      ...EXAMPLE.files,
      "assets/a.png": PICTURE,
      "models/tea.owm": "title Coffee\n",
    });
  });

  test("the reset forgets what the app kept and nothing else in the store", () => {
    const store = memoryStore();
    store.setItem("somebody-else", "theirs");
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBoard("another board\n");
    kept.keepText("models/tea.owm", "title Coffee\n");
    kept.keepBytes("assets/new.png", PICTURE.bytes, PICTURE.mime);
    expect(keysOf(store)).toHaveLength(4);

    kept.reset();

    expect(keysOf(store)).toEqual(["somebody-else"]);
    expect(kept.board()).toBe(EXAMPLE.board);
    expect(kept.files()).toEqual(EXAMPLE.files);
  });
});

describe("the pictures a board shows", () => {
  const node = (type: string, more: Record<string, unknown>): Record<string, unknown> => ({
    kind: "node",
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    z: "a",
    ...more,
  });

  test("are the files of its image nodes, and of no other element", () => {
    const board = encodeBoard({
      meta: {},
      elements: {
        n_logo: node("image", { file: "assets/logo.svg" }),
        n_plan: node("image", { file: "assets/plan.png", parent: "n_group" }),
        n_again: node("image", { file: "assets/plan.png" }),
        n_model: node("model", { file: "models/tea.owm" }),
        n_note: node("text", { text: "assets/note.png" }),
        n_group: node("group", { text: "Pictures" }),
        // an image the canvas does not draw: it has no box
        n_broken: { kind: "node", type: "image", file: "assets/broken.png" },
        n_nameless: node("image", {}),
        e_arrow: { kind: "edge", source: "n_logo", target: "n_plan", label: "assets/label.png" },
      },
    });

    expect([...(picturesOf(board) ?? [])].sort()).toEqual(["assets/logo.svg", "assets/plan.png"]);
  });

  test("are none for a new board, and unknown for a text that is no board", () => {
    expect(picturesOf("")).toEqual(new Set());
    expect(picturesOf(encodeBoard({ meta: {}, elements: {} }))).toEqual(new Set());
    expect(picturesOf("not a board at all")).toBeUndefined();
    expect(picturesOf('{"format":"structured-model","version":99,"meta":{}}\n')).toBeUndefined();
  });
});

describe("a kept picture no node shows any more", () => {
  test("is forgotten, and whatever else is kept stays", () => {
    const store = memoryStore();
    store.setItem("somebody-else", "theirs");
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBoard("another board\n");
    kept.keepText("models/tea.owm", "title Coffee\n");
    kept.keepBytes("assets/shown.png", PICTURE.bytes, PICTURE.mime);
    kept.keepBytes("assets/removed.png", PICTURE.bytes, PICTURE.mime);
    kept.keepBytes("assets/removed-2.png", PICTURE.bytes, PICTURE.mime);
    expect(keysOf(store)).toHaveLength(6);

    kept.forgetPictures(new Set(["assets/shown.png", "assets/logo.svg"]));

    expect(keysOf(store)).toEqual([
      "miragon-board-example:board",
      "miragon-board-example:bytes:assets/shown.png",
      "miragon-board-example:text:models/tea.owm",
      "somebody-else",
    ]);
    expect(createAppStorage(store, EXAMPLE).files()).toEqual({
      ...EXAMPLE.files,
      "models/tea.owm": "title Coffee\n",
      "assets/shown.png": PICTURE,
    });
  });

  test("a board without a picture forgets every kept one", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBytes("assets/a.png", PICTURE.bytes, PICTURE.mime);
    kept.keepBytes("assets/b.png", PICTURE.bytes, PICTURE.mime);

    kept.forgetPictures(new Set());

    expect(keysOf(store)).toEqual([]);
  });

  test("a storage that refuses is left as it is, without a throw", () => {
    const kept = createAppStorage(failing(["removeItem"]), EXAMPLE);
    kept.keepBytes("assets/a.png", PICTURE.bytes, PICTURE.mime);

    expect(() => kept.forgetPictures(new Set())).not.toThrow();
    expect(() =>
      createAppStorage(failing(["length", "key"]), EXAMPLE).forgetPictures(new Set()),
    ).not.toThrow();
    expect(Object.keys(kept.files())).toContain("assets/a.png");
  });
});

describe("a storage the browser blocks or has no room in", () => {
  test("a refused write answers false and throws nothing", () => {
    const kept = createAppStorage(failing(["setItem", "removeItem"]), EXAMPLE);

    expect(kept.keepBoard("another board\n")).toBe(false);
    expect(kept.keepText("models/tea.owm", "title Coffee\n")).toBe(false);
    expect(kept.keepBytes("assets/new.png", PICTURE.bytes, PICTURE.mime)).toBe(false);
    // forgetting is a write too
    expect(kept.keepBoard(EXAMPLE.board)).toBe(false);
  });

  test("a store that refuses every call gives the example and takes a reset", () => {
    const kept = createAppStorage(
      failing(["length", "key", "getItem", "setItem", "removeItem"]),
      EXAMPLE,
    );

    expect(kept.board()).toBe(EXAMPLE.board);
    expect(kept.files()).toEqual(EXAMPLE.files);
    expect(() => kept.reset()).not.toThrow();
  });
});

describe("the way back from a reset", () => {
  test("a snapshot put back is what was kept, byte for byte, and nothing else of the store", () => {
    const store = memoryStore();
    store.setItem("somebody-else", "theirs");
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepBoard("another board\n");
    kept.keepText("models/tea.owm", "title Coffee\n");
    kept.keepBytes("assets/new.png", PICTURE.bytes, PICTURE.mime);
    const before = keysOf(store).map((key) => [key, store.getItem(key)]);

    const snapshot = kept.snapshot();
    kept.reset();
    expect(keysOf(store)).toEqual(["somebody-else"]);

    expect(kept.restore(snapshot)).toBe(true);
    expect(keysOf(store).map((key) => [key, store.getItem(key)])).toEqual(before);
    expect(kept.board()).toBe("another board\n");
    expect(kept.files()).toEqual({
      ...EXAMPLE.files,
      "models/tea.owm": "title Coffee\n",
      "assets/new.png": PICTURE,
    });
  });

  test("a snapshot takes the place of what was kept since: nothing of both is mixed", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    kept.keepText("models/tea.owm", "title Coffee\n");
    const snapshot = kept.snapshot();
    kept.reset();
    kept.keepBoard("a board made after the reset\n");
    kept.keepText("models/sample.tt", '{"after":true}\n');

    expect(kept.restore(snapshot)).toBe(true);

    expect(kept.board()).toBe(EXAMPLE.board);
    expect(kept.files()).toEqual({ ...EXAMPLE.files, "models/tea.owm": "title Coffee\n" });
  });

  test("the snapshot of a pristine example is empty, and holds no key of somebody else", () => {
    const store = memoryStore();
    store.setItem("somebody-else", "theirs");
    store.setItem("miragon-board:open", '{"kind":"example"}');

    expect(createAppStorage(store, EXAMPLE).snapshot()).toEqual({});
  });

  test("a storage that refuses answers false, and one that cannot be read gives nothing", () => {
    const kept = createAppStorage(memoryStore(), EXAMPLE);
    kept.keepBoard("another board\n");
    const snapshot = kept.snapshot();

    expect(createAppStorage(failing(["setItem"]), EXAMPLE).restore(snapshot)).toBe(false);
    expect(createAppStorage(failing(["length"]), EXAMPLE).snapshot()).toEqual({});
  });
});

describe("the document that is open", () => {
  test("nothing is open in a store that holds nothing", () => {
    expect(createOpenStorage(memoryStore()).read()).toBeUndefined();
  });

  test("the example is open for the next storage on the same store", () => {
    const store = memoryStore();

    expect(createOpenStorage(store).keep({ kind: "example" })).toBe(true);

    expect(createOpenStorage(store).read()).toEqual({ kind: "example" });
  });

  test("a board comes back with its text and the name of its file", () => {
    const store = memoryStore();
    const text = encodeBoard({ meta: { title: "Mine" }, elements: {} });

    createOpenStorage(store).keep({ kind: "board", name: "mine.board", text });
    expect(createOpenStorage(store).read()).toEqual({ kind: "board", name: "mine.board", text });

    // a board that was made new has no file
    createOpenStorage(store).keep({ kind: "board", text });
    const unnamed = createOpenStorage(store).read();
    expect(unnamed).toEqual({ kind: "board", text });
    expect(unnamed !== undefined && "name" in unnamed).toBe(false);
  });

  test("forgetting leaves nothing open", () => {
    const store = memoryStore();
    const open = createOpenStorage(store);
    open.keep({ kind: "example" });

    expect(open.forget()).toBe(true);

    expect(open.read()).toBeUndefined();
    expect(keysOf(store)).toEqual([]);
  });

  test.each([
    ["no JSON", "not JSON at all"],
    ["no object", '"example"'],
    ["null", "null"],
    ["another kind", '{"kind":"folder"}'],
    ["a board without a text", '{"kind":"board","name":"a.board"}'],
    ["a board whose text is no string", '{"kind":"board","text":7}'],
  ])("a value of another shape opens nothing: %s", (_what, value) => {
    const store = memoryStore();
    store.setItem("miragon-board:open", value);

    expect(createOpenStorage(store).read()).toBeUndefined();
  });

  test("a name that is no string is left out, and the board is still open", () => {
    const store = memoryStore();
    store.setItem("miragon-board:open", '{"kind":"board","name":7,"text":""}');

    expect(createOpenStorage(store).read()).toEqual({ kind: "board", text: "" });
  });

  test("is kept beside the example: the reset of the example leaves it, and it leaves the example", () => {
    const store = memoryStore();
    const kept = createAppStorage(store, EXAMPLE);
    const open = createOpenStorage(store);
    kept.keepBoard("another board\n");
    open.keep({ kind: "example" });

    kept.reset();
    expect(open.read()).toEqual({ kind: "example" });

    kept.keepBoard("another board\n");
    open.forget();
    expect(kept.board()).toBe("another board\n");
  });

  test("a storage that refuses answers false and throws nothing", () => {
    const open = createOpenStorage(failing(["getItem", "setItem", "removeItem"]));

    expect(open.keep({ kind: "example" })).toBe(false);
    expect(open.forget()).toBe(false);
    expect(open.read()).toBeUndefined();
  });
});

describe("what the editor of the open document keeps", () => {
  const VIEW = { x: -120.5, y: 40, zoom: 1.35 };

  test("nothing is kept in a store that holds nothing", () => {
    expect(createOpenStorage(memoryStore()).state("boardView")).toBeUndefined();
  });

  test("a value is there under its key for the next storage on the same store", () => {
    const store = memoryStore();

    expect(createOpenStorage(store).keepState("boardView", VIEW)).toBe(true);

    expect(createOpenStorage(store).state("boardView")).toEqual(VIEW);
    expect(createOpenStorage(store).state("another")).toBeUndefined();
    // a name every object has is no kept key
    expect(createOpenStorage(store).state("toString")).toBeUndefined();
    expect(keysOf(store)).toEqual(["miragon-board:open-state"]);
  });

  test("a second key leaves the first, and a second value takes the place of the first", () => {
    const open = createOpenStorage(memoryStore());
    open.keepState("boardView", VIEW);
    open.keepState("legend", true);
    open.keepState("boardView", { ...VIEW, zoom: 2 });

    expect(open.state("boardView")).toEqual({ ...VIEW, zoom: 2 });
    expect(open.state("legend")).toBe(true);
  });

  test("forgetting takes all of it, and leaves which document is open", () => {
    const store = memoryStore();
    const open = createOpenStorage(store);
    open.keep({ kind: "example" });
    open.keepState("boardView", VIEW);

    expect(open.forgetState()).toBe(true);

    expect(open.state("boardView")).toBeUndefined();
    expect(open.read()).toEqual({ kind: "example" });
    expect(keysOf(store)).toEqual(["miragon-board:open"]);
  });

  test("is kept beside the open document and beside the example: neither takes it along", () => {
    const store = memoryStore();
    const open = createOpenStorage(store);
    open.keepState("boardView", VIEW);

    open.keep({ kind: "board", text: "" });
    open.forget();
    createAppStorage(store, EXAMPLE).reset();

    expect(open.state("boardView")).toEqual(VIEW);
  });

  test.each([
    ["no JSON", "not JSON at all"],
    ["no object", '"boardView"'],
    ["null", "null"],
    ["a list", '[{"x":0,"y":0,"zoom":1}]'],
  ])(
    "a value of another shape under the key is nothing kept, and is replaced: %s",
    (_what, value) => {
      const store = memoryStore();
      store.setItem("miragon-board:open-state", value);
      const open = createOpenStorage(store);

      expect(open.state("boardView")).toBeUndefined();
      expect(open.keepState("boardView", VIEW)).toBe(true);
      expect(open.state("boardView")).toEqual(VIEW);
      // nothing of the other value is carried along
      expect(JSON.parse(store.getItem("miragon-board:open-state") ?? "")).toEqual({
        boardView: VIEW,
      });
    },
  );

  test("a storage that refuses answers false and throws nothing", () => {
    const open = createOpenStorage(failing(["getItem", "setItem", "removeItem"]));

    expect(open.keepState("boardView", VIEW)).toBe(false);
    expect(open.forgetState()).toBe(false);
    expect(open.state("boardView")).toBeUndefined();
  });
});

describe("resetRequested", () => {
  test.each(["?reset", "?reset=", "?reset=1", "?a=1&reset", "reset"])(
    "%s asks for it",
    (search) => {
      expect(resetRequested(search)).toBe(true);
    },
  );

  test.each(["", "?", "?resetting", "?a=reset", "?Reset"])("'%s' does not", (search) => {
    expect(resetRequested(search)).toBe(false);
  });
});

describe("memoryStore", () => {
  test("is the part of a Storage the app uses", () => {
    const store = memoryStore();
    expect(store.length).toBe(0);
    expect(store.getItem("a")).toBeNull();
    expect(store.key(0)).toBeNull();

    store.setItem("a", "1");
    store.setItem("b", "2");
    store.setItem("a", "3");

    expect(store.length).toBe(2);
    expect(store.getItem("a")).toBe("3");
    expect(keysOf(store)).toEqual(["a", "b"]);

    store.removeItem("a");
    expect(store.length).toBe(1);
    expect(store.key(0)).toBe("b");
    expect(store.key(1)).toBeNull();
  });
});
