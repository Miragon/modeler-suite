import { encodeBoard } from "@miragon/board-schema-model";
import { describe, expect, test } from "vitest";
import {
  createAppStorage,
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
