/**
 * The parts the contract factory is made of (src/collaborative/view.ts, selection.ts, imports.ts
 * and elements.ts), as far as they run without a canvas: what a host's view state is taken for,
 * the fit, the wait for the canvas, the names and boxes of the elements, the selection, the order
 * of the imports and what an import asks of the canvas. The factory itself mounts React and runs
 * in the browser project only.
 */
import type { ElementBounds } from "@miragon/modeler-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { Viewport } from "../src/arming/types.js";
import { createElementsSurface, endPoint, firstLine } from "../src/collaborative/elements.js";
import { createImportQueue } from "../src/collaborative/imports.js";
import { createSelectionMirror } from "../src/collaborative/selection.js";
import {
  asViewport,
  type BoardSession,
  createViewControl,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../src/collaborative/view.js";
import { writeDrop } from "../src/store/actions.js";
import { BOARD_LOCAL, createBoardDoc, createBoardStore } from "../src/store/board-store.js";
import { BOARD_A, BOARD_B, BOARD_EMPTY } from "./support/board-texts.js";

/** a board that was never attached: no host element, no canvas */
function session(): BoardSession {
  return {
    flow: null,
    view: { x: 0, y: 0, zoom: 1 },
    host: null,
    element: null,
    root: null,
    destroyed: false,
    lastText: "",
  };
}

/** all a fit reads of the element a board is attached to */
const box = (clientWidth: number, clientHeight: number): Element =>
  ({ clientWidth, clientHeight }) as Element;

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a view a host hands in", () => {
  it("is taken when it has three finite numbers, and nothing else of it is kept", () => {
    expect(asViewport({ x: -150, y: 60, zoom: 0.5 })).toEqual({ x: -150, y: 60, zoom: 0.5 });
    expect(asViewport({ x: 0, y: 0, zoom: 1, scale: 3, inner: {} })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  it("has its zoom held to the board's range, 0.1 to 4", () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.1, 4]);
    expect(asViewport({ x: 1, y: 2, zoom: 0.01 })).toEqual({ x: 1, y: 2, zoom: 0.1 });
    expect(asViewport({ x: 1, y: 2, zoom: 40 })).toEqual({ x: 1, y: 2, zoom: 4 });
    expect(asViewport({ x: 1, y: 2, zoom: 0.1 })).toEqual({ x: 1, y: 2, zoom: 0.1 });
    expect(asViewport({ x: 1, y: 2, zoom: 4 })).toEqual({ x: 1, y: 2, zoom: 4 });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "0,0,1"],
    ["a number", 1],
    ["an array", [0, 0, 1]],
    ["an empty object", {}],
    ["no zoom", { x: 0, y: 0 }],
    ["a number as text", { x: "0", y: 0, zoom: 1 }],
    ["NaN", { x: Number.NaN, y: 0, zoom: 1 }],
    ["an infinite offset", { x: 0, y: Number.POSITIVE_INFINITY, zoom: 1 }],
    ["an infinite zoom", { x: 0, y: 0, zoom: Number.POSITIVE_INFINITY }],
    ["a zoom of zero", { x: 0, y: 0, zoom: 0 }],
    ["a negative zoom", { x: 0, y: 0, zoom: -1 }],
    ["a diagram-js viewbox", { x: 0, y: 0, width: 800, height: 600, scale: 1 }],
  ])("is ignored when it is %s", (_name, state) => {
    expect(asViewport(state)).toBeUndefined();
  });
});

describe("the fit", () => {
  // React Flow's fit with the board's padding: the content is centred in the box at the largest
  // zoom that leaves 88 px at the top (the toolbar's band) and 24 px on the other sides, and then
  // moved only as far as one of those sides asks. In 800 x 600 that is 752 x 488 px of room.
  const fitOf = (
    text: string,
    host: Element | null,
    insets?: { top: number; right: number; bottom: number; left: number },
  ): Viewport => {
    const state = { ...session(), host };
    const store = createBoardStore(createBoardDoc(text));
    const options = insets ? { freeArea: { insets: () => insets } } : {};
    return createViewControl(state, store, options, Promise.resolve()).fitted();
  };

  it("puts a wide board between the side margins, in the middle of the height", () => {
    // board A is 1000 x 420 at 0,0: the width decides
    const view = fitOf(BOARD_A, box(800, 600));
    expect(view.zoom).toBeCloseTo(752 / 1000, 10);
    expect(view.x).toBeCloseTo(24, 10);
    expect(view.y).toBeCloseTo(300 - 210 * 0.752, 10);
  });

  it("puts a high board under the toolbar's band, not in the middle of the height", () => {
    // board B is 1200 x 860 at 0,0: the height decides, and the middle would reach into the band
    const view = fitOf(BOARD_B, box(800, 600));
    const zoom = 488 / 860;
    expect(view.zoom).toBeCloseTo(zoom, 10);
    expect(view.x).toBeCloseTo(400 - 600 * zoom, 10);
    expect(view.y).toBeCloseTo(88, 10);
    expect(view.y + 860 * view.zoom).toBeCloseTo(600 - 24, 10);
  });

  it("is the same for the same text in the same box", () => {
    expect(fitOf(BOARD_A, box(800, 600))).toEqual(fitOf(BOARD_A, box(800, 600)));
    expect(fitOf(BOARD_A, box(800, 600))).not.toEqual(fitOf(BOARD_A, box(1200, 600)));
  });

  it("fits into what the host's insets leave and starts behind them", () => {
    const insets = { top: 0, right: 0, bottom: 0, left: 300 };
    const view = fitOf(BOARD_A, box(1100, 600), insets);
    const free = fitOf(BOARD_A, box(800, 600));
    expect(view).toEqual({ x: free.x + 300, y: free.y, zoom: free.zoom });
  });

  it.each([
    ["the board is empty", BOARD_EMPTY, box(800, 600), undefined],
    ["the board is not attached", BOARD_A, null, undefined],
    ["the host has no size", BOARD_A, box(0, 600), undefined],
    [
      "the insets leave no room",
      BOARD_A,
      box(800, 600),
      { top: 0, right: 400, bottom: 0, left: 400 },
    ],
  ])("is the plain view at zoom 1 while %s", (_name, text, host, insets) => {
    expect(fitOf(text, host, insets)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("goes on with the insets it had when the host's free area throws, and says so once", () => {
    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: "nothing" | "panel" | "throw" = "throw";
    const options = {
      freeArea: {
        insets() {
          if (answer === "throw") throw new Error("the side panel is gone");
          return { top: 0, right: 0, bottom: 0, left: answer === "panel" ? 300 : 0 };
        },
      },
    };
    const view = createViewControl(
      { ...session(), host: box(1100, 600) },
      createBoardStore(createBoardDoc(BOARD_A)),
      options,
      Promise.resolve(),
    );
    // no answer yet: the whole box
    expect(view.fitted()).toEqual(fitOf(BOARD_A, box(1100, 600)));
    answer = "panel";
    const beside = view.fitted();
    expect(beside).toEqual(
      fitOf(BOARD_A, box(1100, 600), { top: 0, right: 0, bottom: 0, left: 300 }),
    );
    answer = "throw";
    expect(view.fitted()).toEqual(beside);
    expect(complaints.mock.calls).toHaveLength(1);
    expect(complaints.mock.calls[0]?.slice(0, 2)).toEqual([
      "[board]",
      "options.freeArea.insets() failed: the side panel is gone",
    ]);
  });

  it("has a tight content box from the document, and none for an empty board", () => {
    const boundsOf = (text: string): ElementBounds | undefined =>
      createViewControl(
        session(),
        createBoardStore(createBoardDoc(text)),
        {},
        Promise.resolve(),
      ).contentBounds();
    expect(boundsOf(BOARD_A)).toEqual({ x: 0, y: 0, width: 1000, height: 420 });
    expect(boundsOf(BOARD_B)).toEqual({ x: 0, y: 0, width: 1200, height: 860 });
    expect(boundsOf(BOARD_EMPTY)).toBeUndefined();
  });
});

describe("the wait for the canvas", () => {
  const waitOn = (state: BoardSession, mounted: Promise<void>): (() => boolean) => {
    const view = createViewControl(state, createBoardStore(createBoardDoc(BOARD_A)), {}, mounted);
    let drawn = false;
    void view.rendered().then(() => (drawn = true));
    return () => drawn;
  };

  it("is one macrotask for a board that was never attached", async () => {
    const drawn = waitOn(session(), new Promise<void>(() => undefined));
    await macrotask();
    await macrotask();
    expect(drawn()).toBe(true);
  });

  it("lasts until the canvas of an attached board exists, and one macrotask more", async () => {
    let exists!: () => void;
    const mounted = new Promise<void>((resolve) => {
      exists = resolve;
    });
    const drawn = waitOn({ ...session(), host: box(800, 600) }, mounted);
    for (let turn = 0; turn < 5; turn++) await macrotask();
    expect(drawn()).toBe(false);
    exists();
    await macrotask();
    await macrotask();
    expect(drawn()).toBe(true);
  });

  it("leaves no timer behind once the canvas came or the board went", async () => {
    vi.useFakeTimers();
    const view = createViewControl(
      { ...session(), host: box(800, 600) },
      createBoardStore(createBoardDoc(BOARD_A)),
      {},
      Promise.resolve(),
    );
    const drawn = view.rendered();
    await vi.advanceTimersByTimeAsync(0);
    await drawn;
    // the ten seconds it would have waited for a canvas that never appears
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the name of an element", () => {
  it("is the first line of its text that says something, without the marks in front", () => {
    expect(firstLine("First note")).toBe("First note");
    expect(firstLine("## Second note\n\nWith a list:\n\n- one\n- two")).toBe("Second note");
    expect(firstLine("\n\n  > quoted\nmore")).toBe("quoted");
    expect(firstLine("- one\n- two")).toBe("one");
    expect(firstLine("* * *\n# \nBelow the rule")).toBe("Below the rule");
  });

  it("keeps the marks that are not in front", () => {
    expect(firstLine("**bold** and `code`")).toBe("bold** and `code`");
    expect(firstLine("a - b # c")).toBe("a - b # c");
  });

  it("is absent for no text and for a text of marks alone", () => {
    expect(firstLine(undefined)).toBeUndefined();
    expect(firstLine("")).toBeUndefined();
    expect(firstLine("\n \n")).toBeUndefined();
    expect(firstLine("# \n> \n- ")).toBeUndefined();
  });

  it.each([
    ["a number", 5],
    ["an object", { a: 1 }],
    ["a list", ["First note"]],
    ["null", null],
    ["true", true],
  ])("is absent for %s where a text belongs", (_name, value) => {
    expect(firstLine(value)).toBeUndefined();
  });
});

describe("the end of an arrow", () => {
  const node = { x: 10, y: 20, width: 100, height: 40 };

  it("is the middle of the side it names", () => {
    expect(endPoint(node, "top")).toEqual({ x: 60, y: 20 });
    expect(endPoint(node, "bottom")).toEqual({ x: 60, y: 60 });
    expect(endPoint(node, "left")).toEqual({ x: 10, y: 40 });
    expect(endPoint(node, "right")).toEqual({ x: 110, y: 40 });
  });

  it("is the middle of the node without a side", () => {
    expect(endPoint(node, undefined)).toEqual({ x: 60, y: 40 });
  });
});

describe("the elements of a board that has no canvas", () => {
  const surfaceOf = (text: string, state: BoardSession = session()) => {
    const store = createBoardStore(createBoardDoc(text));
    const mirror = createSelectionMirror(state, store);
    const view = createViewControl(state, store, {}, Promise.resolve());
    return { store, mirror, elements: createElementsSurface(state, store, mirror, view) };
  };

  it("lists nodes and stored arrows under their ids, named by their text or their file", () => {
    expect(surfaceOf(BOARD_A).elements.list()).toEqual([
      { id: "n_group", name: "Inbox" },
      { id: "n_note_a", name: "First note" },
      { id: "n_note_b", name: "Second note" },
      { id: "e_note_to_note", name: "leads to" },
    ]);
    expect(surfaceOf(BOARD_B).elements.list()).toEqual([
      { id: "n_order", name: "processes/order-to-cash.bpmn" },
      { id: "n_remark", name: "Check the credit limit first." },
      { id: "n_image", name: "assets/sketch.svg" },
      { id: "e_remark_to_order" },
    ]);
  });

  it("lists an element whose text, label or file is no text under its id alone", () => {
    // what a hand edit or another tool may leave: the reader takes it, and the view draws it
    const odd = [
      String.raw`{"format":"structured-model","meta":{},"version":1}`,
      String.raw`{"id":"e_odd","kind":"edge","label":{"a":1},"source":"n_note","target":"n_model"}`,
      String.raw`{"height":200,"id":"n_group","kind":"node","text":["Inbox"],"type":"group","width":300,"x":0,"y":300,"z":"c"}`,
      String.raw`{"file":7,"height":100,"id":"n_model","kind":"node","type":"model","width":200,"x":300,"y":0,"z":"b"}`,
      String.raw`{"height":100,"id":"n_note","kind":"node","text":5,"type":"text","width":200,"x":0,"y":0,"z":"a"}`,
      String.raw`{"height":100,"id":"n_plain","kind":"node","text":"Still named","type":"text","width":200,"x":0,"y":150,"z":"d"}`,
      "",
    ].join("\n");
    const { elements } = surfaceOf(odd);
    expect(elements.list()).toEqual([
      { id: "n_note" },
      { id: "n_model" },
      { id: "n_group" },
      { id: "n_plain", name: "Still named" },
      { id: "e_odd" },
    ]);
    expect(elements.bounds("n_note")).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("gives a node its box on the board and an arrow the box around its two ends", () => {
    const { elements } = surfaceOf(BOARD_A);
    // a member's place is relative to its group in the file and absolute here
    expect(elements.bounds("n_note_a")).toEqual({ x: 40, y: 80, width: 240, height: 160 });
    expect(elements.bounds("n_note_b")).toEqual({ x: 760, y: 80, width: 240, height: 160 });
    // from the right side of n_note_a to the left side of n_note_b, both at the same height
    expect(elements.bounds("e_note_to_note")).toEqual({ x: 280, y: 160, width: 480, height: 0 });
    expect(elements.bounds("n_nobody")).toBeUndefined();
  });

  it("reveals what is on the board, selects it at once and tells the listeners once", () => {
    const { elements } = surfaceOf(BOARD_A);
    const heard: string[][] = [];
    elements.onSelection((ids) => heard.push(ids));
    expect(elements.reveal("n_nobody")).toBe(false);
    expect(elements.selection()).toEqual([]);
    expect(elements.reveal("n_note_b")).toBe(true);
    expect(elements.selection()).toEqual(["n_note_b"]);
    expect(elements.reveal("n_note_b")).toBe(true);
    expect(heard).toEqual([["n_note_b"]]);
  });

  it("leaves out of the selection what left the board since", () => {
    const { store, mirror, elements } = surfaceOf(BOARD_A);
    mirror.setSelection(["n_note_a", "n_nobody", "e_note_to_note"]);
    expect(elements.selection()).toEqual(["n_note_a", "e_note_to_note"]);
    store.gesture((tx) => tx.remove("e_note_to_note"));
    expect(elements.selection()).toEqual(["n_note_a"]);
  });

  it("does not tell a listener that an earlier listener of the same delivery took off", () => {
    const { elements } = surfaceOf(BOARD_A);
    const heard: string[] = [];
    let leave = (): void => undefined;
    elements.onSelection(() => {
      heard.push("first");
      leave();
    });
    leave = elements.onSelection(() => heard.push("second"));
    elements.onSelection(() => heard.push("third"));
    expect(elements.reveal("n_note_a")).toBe(true);
    expect(heard).toEqual(["first", "third"]);
    // the one that left stays away, the others hear the next selection too
    expect(elements.reveal("n_note_b")).toBe(true);
    expect(heard).toEqual(["first", "third", "first", "third"]);
  });

  it("stops a delivery when a listener destroyed the board, and reveals nothing afterwards", () => {
    const state = session();
    const { elements } = surfaceOf(BOARD_A, state);
    const heard: string[] = [];
    elements.onSelection(() => {
      heard.push("first");
      state.destroyed = true;
    });
    elements.onSelection(() => heard.push("second"));
    expect(elements.reveal("n_note_a")).toBe(true);
    expect(heard).toEqual(["first"]);
    expect(elements.reveal("n_note_b")).toBe(false);
  });
});

describe("the imports of a board", () => {
  /**
   * An import queue on a document, with a canvas that draws within one macrotask. `canvas.editing`
   * says whether a model of the document is armed, and `canvas.dropped` holds the text the
   * document had each time the queue gave up what the canvas held back.
   */
  const queueOn = (doc: Y.Doc, options: { fitOnImport?: boolean | undefined } = {}) => {
    const store = createBoardStore(doc);
    const state = { destroyed: false, lastText: store.text() };
    const fits: Viewport[] = [];
    const canvas = { editing: false, dropped: [] as string[] };
    const importText = createImportQueue(
      state,
      store,
      options,
      {
        fitted: () => ({ x: 7, y: 7, zoom: 0.7 }),
        setView: (next) => void fits.push(next),
        rendered: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
      },
      {
        dropHeld: () => void canvas.dropped.push(store.text()),
        editsModel: () => canvas.editing,
      },
    );
    /** every text the document went through and every import that settled, in that order */
    const events: string[] = [];
    const names = new Map([
      [BOARD_A, "A"],
      [BOARD_B, "B"],
      [BOARD_EMPTY, "empty"],
    ]);
    let last = store.text();
    doc.on("afterTransaction", () => {
      const text = store.text();
      if (text !== last) events.push(`wrote ${names.get(text) ?? "another text"}`);
      last = text;
    });
    const run = (text: string): Promise<unknown> =>
      importText(text).then(
        () => events.push(`imported ${names.get(text) ?? "another text"}`),
        (error: unknown) => events.push(`refused: ${(error as Error).message}`),
      );
    return { store, state, fits, canvas, events, importText, run };
  };

  it("starts none before the call returns", async () => {
    const { store, importText } = queueOn(new Y.Doc());
    const imported = importText(BOARD_A);
    expect(store.text()).toBe(BOARD_EMPTY);
    await expect(imported).resolves.toEqual({ warnings: [] });
    expect(store.text()).toBe(BOARD_A);
  });

  it("runs them one after another in the order they were called", async () => {
    const { store, events, run } = queueOn(new Y.Doc());
    await Promise.all([run(BOARD_A), run(BOARD_B), run(BOARD_EMPTY), run(BOARD_A)]);
    expect(events).toEqual([
      "wrote A",
      "imported A",
      "wrote B",
      "imported B",
      "wrote empty",
      "imported empty",
      "wrote A",
      "imported A",
    ]);
    expect(store.text()).toBe(BOARD_A);
  });

  it("goes on with the next one after a text it refused, which left no trace", async () => {
    const { store, state, fits, events, run } = queueOn(createBoardDoc(BOARD_B));
    await Promise.all([run("not a board at all"), run(BOARD_A)]);
    expect(events[0]).toMatch(/^refused: not a board: /);
    expect(events.slice(1)).toEqual(["wrote A", "imported A"]);
    expect(store.text()).toBe(BOARD_A);
    expect(state.lastText).toBe(BOARD_A);
    // only the accepted one fitted the view
    expect(fits).toEqual([{ x: 7, y: 7, zoom: 0.7 }]);
  });

  it("starts one that was called while another wrote only after that one resolved", async () => {
    const { store, events, run } = queueOn(new Y.Doc());
    let echoed: Promise<unknown> | undefined;
    const stop = store.subscribe(() => {
      // as a host does that echoes a peer's text from inside a delivery
      echoed ??= run(BOARD_B);
    });
    await run(BOARD_A);
    stop();
    expect(echoed).toBeDefined();
    await echoed;
    expect(events).toEqual(["wrote A", "imported A", "wrote B", "imported B"]);
  });

  it("starts one that a gesture's listener called only once the gesture returned", async () => {
    const doc = createBoardDoc(BOARD_A);
    const { store, events, run } = queueOn(doc);
    let echoed: Promise<unknown> | undefined;
    doc.on("afterTransaction", (transaction: Y.Transaction) => {
      if (transaction.origin === BOARD_LOCAL) echoed ??= run(BOARD_B);
    });
    writeDrop(store, { n_note_b: { x: 900, y: 300 } });
    // the gesture's own write stands when its call returns: the import has not begun
    expect(events).toEqual(["wrote another text"]);
    expect(store.getSnapshot().nodes.find((node) => node.id === "n_note_b")?.attrs.x).toBe(900);
    await echoed;
    expect(events).toEqual(["wrote another text", "wrote B", "imported B"]);
  });

  it("fits the view after every accepted import, unless the host fits itself", async () => {
    const fitting = queueOn(new Y.Doc());
    await fitting.importText(BOARD_A);
    await fitting.importText(BOARD_B);
    expect(fitting.fits).toHaveLength(2);
    const plain = queueOn(new Y.Doc(), { fitOnImport: false });
    await plain.importText(BOARD_A);
    expect(plain.fits).toEqual([]);
  });

  it("leaves the view alone while a model of the document is edited in place", async () => {
    const { fits, canvas, importText } = queueOn(new Y.Doc());
    canvas.editing = true;
    await importText(BOARD_B);
    expect(fits).toEqual([]);
    canvas.editing = false;
    await importText(BOARD_B);
    expect(fits).toHaveLength(1);
  });

  it("gives up what the canvas held back before it writes, and only for a text it accepts", async () => {
    const { store, canvas, run, importText } = queueOn(createBoardDoc(BOARD_A));
    await run("not a board at all");
    expect(canvas.dropped).toEqual([]);
    await importText(BOARD_B);
    // asked once, while the document still held the text the held moves were made on
    expect(canvas.dropped).toEqual([BOARD_A]);
    expect(store.text()).toBe(BOARD_B);
    // an import that changes nothing replaces the document all the same
    await importText(BOARD_B);
    expect(canvas.dropped).toEqual([BOARD_A, BOARD_B]);
  });

  it("empties the history, so an undo after it changes nothing", async () => {
    const { store, importText } = queueOn(createBoardDoc(BOARD_A));
    writeDrop(store, { n_note_b: { x: 900, y: 300 } });
    expect(store.undo.undoStack).toHaveLength(1);
    await importText(BOARD_B);
    expect(store.undo.undoStack).toHaveLength(0);
    store.undo.undo();
    expect(store.text()).toBe(BOARD_B);
  });

  it("refuses on a board that was destroyed, before and while it runs", async () => {
    const before = queueOn(new Y.Doc());
    before.state.destroyed = true;
    await expect(before.importText(BOARD_A)).rejects.toThrow("the board was destroyed");
    expect(before.store.text()).toBe(BOARD_EMPTY);

    const during = queueOn(new Y.Doc());
    const stop = during.store.subscribe(() => {
      during.state.destroyed = true;
    });
    await expect(during.importText(BOARD_A)).rejects.toThrow(
      "the board was destroyed during the import",
    );
    stop();
  });
});
