/**
 * Host code that goes wrong: a list that is a new array on every call, a call that throws, an
 * editor whose callbacks throw, an answer of `open` that is no editor, a peer that announced
 * nothing of itself. None of it takes the board down: the board says what failed and goes on with
 * what it has.
 *
 * No test here listens for window errors. Vitest counts an unhandled error or rejection of the
 * page against the run, so a board that lets one through fails the file.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Viewport } from "../../src/arming/types.js";
import type {
  BoardHost,
  BoardModels,
  BoardPeer,
  BoardReference,
  EmbeddedEditor,
  EmbeddedEditorContext,
} from "../../src/host/types.js";
import { writeRemoval } from "../../src/store/actions.js";
import { BOARD_B, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { click, doubleClick } from "../support/pointer.js";
import { createTestHost, type TestHost } from "../support/test-host.js";

const NODE = "n_order";
const ARROW = "e_remark_to_order";
const EDITOR = { nodeId: NODE, path: MODEL_PATH } as const;
const MOVED_PATH = "processes/moved.bpmn";
const BILLING_PATH = "processes/billing.bpmn";

/** two models side by side, in the canonical form */
const TWO_MODELS = `${[
  `{"format":"structured-model","meta":{"title":"Two models","version":1},"version":1}`,
  `{"file":"${BILLING_PATH}","height":300,"id":"n_billing","kind":"node","type":"model","width":400,"x":520,"y":0,"z":"b"}`,
  `{"file":"${MODEL_PATH}","height":300,"id":"n_order","kind":"node","type":"model","width":400,"x":0,"y":0,"z":"a"}`,
].join("\n")}\n`;

/** a part that is loaded lazily comes from the dev server on its first use in this file */
const LOADED = { timeout: 5000 };

let mounted: MountedBoard | undefined;

async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  mounted = await mountBoard(...args);
  return mounted;
}

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  vi.restoreAllMocks();
});

function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the board has no ${what}`);
  return value;
}

/** what the board reported through console.error; anything else goes to the console as it would */
function boardReports(): () => string[] {
  const { error } = console;
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (args[0] === "[board]") lines.push(String(args[1]));
    else error(...args);
  });
  return () => [...lines];
}

/** what stands of a board: none of it may go because host code failed */
function standing(board: MountedBoard): Record<string, unknown> {
  const { element } = board;
  return {
    canvas: element.querySelector(".board-root .react-flow__pane") !== null,
    toolbar: element.querySelector(".board-toolbar") !== null,
    done: element.querySelector("[data-board-done]") !== null,
    zoom: element.querySelector("[data-board-zoom]") !== null,
    nodes: element.querySelectorAll(".react-flow__node").length,
    failedParts: [...element.querySelectorAll(".board-slot--error")].map(
      (part) => part.textContent,
    ),
  };
}

const WHOLE = { canvas: true, toolbar: true, done: true, zoom: true, failedParts: [] } as const;

const offered = (board: MountedBoard): Array<[string, string | null]> =>
  [
    ...present(
      board.element.querySelector<HTMLSelectElement>("select.board-toolbar__models"),
      "model picker",
    ).options,
  ].map((option) => [option.value, option.textContent]);

const derivedLabels = (board: MountedBoard): Array<string | undefined> =>
  [...board.element.querySelectorAll<HTMLElement>(".board-derived-label")].map(
    (label) => label.dataset.rel,
  );

const viewOf = (board: MountedBoard): Viewport => board.modeler.getViewState() as Viewport;

const layerOf = (board: MountedBoard): HTMLElement =>
  present(
    board.element.querySelector<HTMLElement>(".react-flow > .board-overlay-layer"),
    "overlay layer",
  );

const slotOf = (board: MountedBoard): HTMLElement =>
  present(board.node(NODE).querySelector<HTMLElement>(".board-surface__slot"), "slot");

/** a test host whose editors pass through `change` before the board gets them */
function hostWith(
  change: (editor: EmbeddedEditor, context: EmbeddedEditorContext) => EmbeddedEditor,
): TestHost {
  const host = createTestHost();
  const models = present(host.models, "models");
  const open = models.open.bind(models);
  models.open = (context) => {
    const editor = open(context);
    if (editor === undefined || editor instanceof Promise) {
      throw new Error("the test host hands its editor over at once");
    }
    return change(editor, context);
  };
  return host;
}

/** board B on `host`, once the editor of its model node is ready */
async function mountModel(host: TestHost): Promise<MountedBoard> {
  const board = await mount(BOARD_B, { host });
  await expect.poll(() => board.runtime.mounted(NODE), LOADED).toBe(true);
  return board;
}

async function arm(board: MountedBoard): Promise<void> {
  doubleClick(board.node(NODE));
  await expect.poll(() => board.runtime.armedId(), LOADED).toBe(NODE);
  await board.settle();
}

const elementOf = (host: TestHost): HTMLElement =>
  present(host.contexts.get(NODE), "editor context").element;

const events = (host: TestHost): string[] => host.events.map((entry) => entry.event);

describe("a list that is a new array on every call", () => {
  it("of references: the board stands and draws the arrow", async () => {
    const said = boardReports();
    const calls: BoardReference = { from: MODEL_PATH, to: BILLING_PATH, relation: "calls" };
    const base = createTestHost({ models: [MODEL_PATH, BILLING_PATH] });
    const host: BoardHost = {
      ...base,
      references: { list: () => [{ ...calls }], onChange: () => () => undefined },
    };
    const board = await mount(TWO_MODELS, { host });

    await expect.poll(() => derivedLabels(board), LOADED).toEqual(["calls"]);
    await board.settle();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
    expect(board.runtime.lines).toEqual([]);
    expect(said()).toEqual([]);
  });

  it("of models: the toolbar stands and offers them", async () => {
    const said = boardReports();
    const base = createTestHost();
    const host: BoardHost = {
      ...base,
      models: { ...present(base.models, "models"), list: () => [MODEL_PATH, BILLING_PATH] },
    };
    const board = await mount(BOARD_B, { host });

    await board.settle();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(offered(board)).toEqual([
      ["", "Model…"],
      [MODEL_PATH, "order-to-cash (model)"],
      [BILLING_PATH, "billing (model)"],
    ]);
    expect(board.runtime.lines).toEqual([]);
    expect(said()).toEqual([]);
  });
});

describe("a list() that throws", () => {
  it("of references: the board stands, says so once and draws the arrows once the host has them", async () => {
    const said = boardReports();
    const base = createTestHost({ models: [MODEL_PATH, BILLING_PATH] });
    const listeners = new Set<() => void>();
    const listed: readonly BoardReference[] = [
      { from: MODEL_PATH, to: BILLING_PATH, relation: "calls" },
    ];
    let loaded = false;
    const host: BoardHost = {
      ...base,
      references: {
        list() {
          if (!loaded) throw new Error("the index is not loaded yet");
          return listed;
        },
        onChange(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      },
    };
    const board = await mount(TWO_MODELS, { host });

    await board.settle();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
    expect(derivedLabels(board)).toEqual([]);
    expect(said()).toEqual(["host.references.list() failed: the index is not loaded yet"]);

    loaded = true;
    for (const listener of [...listeners]) listener();
    await expect.poll(() => derivedLabels(board), LOADED).toEqual(["calls"]);
    expect(said()).toHaveLength(1);
  });

  it("of models: the toolbar stands, says so once and offers the models once the host has them", async () => {
    const said = boardReports();
    const base = createTestHost();
    const models = present(base.models, "models");
    const listeners = new Set<() => void>();
    const listed: readonly string[] = [MODEL_PATH];
    let loaded = false;
    const host: BoardHost = {
      ...base,
      models: {
        ...models,
        list() {
          if (!loaded) throw new Error("the repository is not read yet");
          return listed;
        },
        onChange(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
      },
    };
    const board = await mount(BOARD_B, { host });

    await board.settle();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(offered(board)).toEqual([["", "Model…"]]);
    expect(said()).toEqual(["host.models.list() failed: the repository is not read yet"]);

    loaded = true;
    for (const listener of [...listeners]) listener();
    await expect
      .poll(() => offered(board))
      .toEqual([
        ["", "Model…"],
        [MODEL_PATH, "order-to-cash (model)"],
      ]);
    expect(said()).toHaveLength(1);
  });
});

describe("a describe() that throws", () => {
  it("leaves the toolbar and the node, which go by the file name, and the editor is opened", async () => {
    const said = boardReports();
    const base = createTestHost({ models: [MODEL_PATH, "processes/broken.bpmn"] });
    const host: TestHost = {
      ...base,
      models: {
        ...present(base.models, "models"),
        describe(path) {
          throw new Error(`no title for ${path}`);
        },
      },
    };
    const board = await mount(BOARD_B, { host });

    await expect.poll(() => board.runtime.mounted(NODE), LOADED).toBe(true);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(offered(board)).toEqual([
      ["", "Model…"],
      [MODEL_PATH, "order-to-cash (model)"],
      ["processes/broken.bpmn", "broken (model)"],
    ]);
    const header = present(board.node(NODE).querySelector(".board-node__header"), "header");
    expect(header.querySelector(".board-node__title")?.textContent).toBe("order-to-cash");
    expect(header.querySelector(".board-node__notation")?.textContent).toBe("");
    expect(host.events).toEqual([{ event: "open", ...EDITOR }]);

    // the Done control names the armed model in the toolbar's render
    await arm(board);
    const done = present(
      board.element.querySelector<HTMLButtonElement>("[data-board-done]"),
      "Done control",
    );
    await expect.poll(() => done.getAttribute("aria-label")).toBe("Done editing order-to-cash");
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatch(/^host\.models\.describe\(\) failed: no title for /);
  });

  it("is never asked for the empty path of a node that names no file", async () => {
    const asked = new Set<string>();
    const base = createTestHost();
    const host: BoardHost = {
      ...base,
      models: {
        ...present(base.models, "models"),
        describe(path) {
          asked.add(path);
          return undefined;
        },
      },
    };
    const board = await mount(BOARD_B.replace(`"file":"${MODEL_PATH}",`, ""), { host });

    await board.settle();
    expect(board.node(NODE).querySelector(".board-slot--error")?.textContent).toBe("names no file");
    expect([...asked]).toEqual([MODEL_PATH]);
  });
});

describe("an editor whose destroy() throws", () => {
  const failing = (): TestHost =>
    hostWith((editor) => ({
      ...editor,
      destroy() {
        editor.destroy();
        throw new Error("the session was closed already");
      },
    }));
  const LINE = `${NODE}: the editor's destroy() failed: the session was closed already`;

  it("is logged when its node is removed: the element goes and the board stands", async () => {
    const host = failing();
    const board = await mountModel(host);
    const engine = elementOf(host);

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => engine.isConnected).toBe(false);
    await board.settle();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
    expect(board.element.querySelector(".board-engine")).toBeNull();
    expect(board.runtime.surface(NODE)).toBeUndefined();
    expect(events(host)).toEqual(["open", "destroy"]);
    expect(board.runtime.lines).toEqual([LINE]);

    // the board still draws what it is given
    await board.modeler.importText(BOARD_B);
    await expect.poll(() => board.element.querySelectorAll(".react-flow__node").length).toBe(3);
  });

  it("is logged at a path change while armed: the old element leaves the layer for the new one", async () => {
    const host = failing();
    const board = await mountModel(host);
    await arm(board);
    const first = elementOf(host);
    const moved = { nodeId: NODE, path: MOVED_PATH };

    present(host.contexts.get(NODE), "editor context").relocate(MOVED_PATH);
    await expect.poll(() => host.events.at(-1), LOADED).toEqual({ event: "focus", ...moved });
    await board.settle();
    const second = elementOf(host);
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect([...layerOf(board).children]).toEqual([second]);
    expect(board.runtime.armedId()).toBe(NODE);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(board.runtime.lines).toEqual([LINE]);
    await expect.poll(() => board.runtime.mounted(NODE)).toBe(true);

    // Done makes the new editor a preview: nothing is left in the layer
    click(present(board.element.querySelector("[data-board-done]"), "Done control"));
    await expect.poll(() => board.runtime.armedId()).toBeNull();
    await expect.poll(() => layerOf(board).children.length).toBe(0);
    expect(second.parentElement).toBe(slotOf(board));
  });

  it("is logged when the board is destroyed, and the element goes", async () => {
    const host = failing();
    const board = await mountModel(host);
    const engine = elementOf(host);

    board.destroy();
    await expect.poll(() => engine.isConnected).toBe(false);
    await board.settle();
    expect(events(host)).toEqual(["open", "destroy"]);
    expect(document.querySelector(".board-engine")).toBeNull();
    expect(board.runtime.lines).toEqual([LINE]);
  });

  it("is logged for an editor that arrives after its node is gone", async () => {
    const calls: string[] = [];
    let arrive: ((editor: EmbeddedEditor) => void) | undefined;
    let engine: HTMLElement | undefined;
    const host = createTestHost();
    present(host.models, "models").open = (context) => {
      engine = context.element;
      return new Promise((resolve) => {
        arrive = resolve;
      });
    };
    const board = await mount(BOARD_B, { host });

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => engine?.isConnected).toBe(false);
    present(
      arrive,
      "pending editor",
    )({
      ready: Promise.resolve(),
      release: () => void calls.push("release"),
      destroy() {
        calls.push("destroy");
        throw new Error("the session was closed already");
      },
    });
    await expect.poll(() => board.runtime.lines).toEqual([LINE]);
    expect(calls).toEqual(["destroy"]);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
  });
});

describe("an editor whose release() throws", () => {
  const failing = (): TestHost =>
    hostWith((editor) => ({
      ...editor,
      release() {
        editor.release();
        throw new Error("the label editor is stuck");
      },
    }));
  const LINE = `${NODE}: the editor's release() failed: the label editor is stuck`;
  const AFTER_RELEASE = ["open", "armed", "focus", "release", "armed"];

  it.each([
    [
      "a zoom of the board",
      (board: MountedBoard) => board.modeler.setViewState({ ...viewOf(board), zoom: 0.5 }),
    ],
    [
      "Done",
      (board: MountedBoard) =>
        click(present(board.element.querySelector("[data-board-done]"), "Done control")),
    ],
  ])("is logged, and %s still makes the node a preview", async (_how, disarm) => {
    const host = failing();
    const board = await mountModel(host);
    await arm(board);
    const engine = elementOf(host);
    expect(engine.parentElement).toBe(layerOf(board));

    disarm(board);
    await expect.poll(() => board.runtime.armedId()).toBeNull();
    await expect.poll(() => events(host)).toEqual(AFTER_RELEASE);
    await board.settle();
    expect(engine.parentElement).toBe(slotOf(board));
    expect(engine.dataset.armed).toBe("false");
    expect(engine.dataset.layout).toBe("preview");
    expect(layerOf(board).children).toHaveLength(0);
    expect(host.events.at(-1)).toEqual({ event: "armed", ...EDITOR, armed: false });
    expect(board.runtime.mounted(NODE)).toBe(true);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(board.runtime.lines).toEqual([LINE]);

    // the editor is the same one, and it can be armed again
    await arm(board);
    expect(engine.parentElement).toBe(layerOf(board));
    expect(events(host)).toEqual([...AFTER_RELEASE, "armed", "focus"]);
  });

  it("is logged when the armed node is removed, and the editor is destroyed all the same", async () => {
    const host = failing();
    const board = await mountModel(host);
    await arm(board);
    const engine = elementOf(host);

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => engine.isConnected).toBe(false);
    await board.settle();
    expect(events(host)).toEqual(["open", "armed", "focus", "release", "destroy"]);
    expect(layerOf(board).children).toHaveLength(0);
    expect(board.runtime.armedId()).toBeNull();
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
    expect(board.runtime.lines).toEqual([LINE]);
  });
});

describe("an editor whose focus() throws", () => {
  it("is logged: the node is armed and its element stands in the layer at its size", async () => {
    const host = hostWith((editor) => ({
      ...editor,
      focus() {
        editor.focus?.();
        throw new Error("nothing to focus yet");
      },
    }));
    const board = await mountModel(host);
    const engine = elementOf(host);

    await arm(board);
    expect(engine.parentElement).toBe(layerOf(board));
    expect(engine.dataset.armed).toBe("true");
    expect(engine.dataset.layout).toBe("overlay");
    const body = present(board.node(NODE).querySelector(".board-node__body"), "node body");
    const [box, wanted] = [engine.getBoundingClientRect(), body.getBoundingClientRect()];
    expect(Math.abs(box.width - wanted.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - wanted.height)).toBeLessThanOrEqual(1);
    expect(events(host)).toEqual(["open", "armed", "focus"]);
    expect(board.runtime.mounted(NODE)).toBe(true);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(board.runtime.lines).toEqual([
      `${NODE}: the editor's focus() failed: nothing to focus yet`,
    ]);
  });

  it("is logged for a node that is armed from its first moment", async () => {
    const host = hostWith((editor, context) => ({
      ...editor,
      focus() {
        if (context.path === MOVED_PATH) throw new Error("nothing to focus yet");
        editor.focus?.();
      },
    }));
    const board = await mountModel(host);
    await arm(board);

    present(host.contexts.get(NODE), "editor context").relocate(MOVED_PATH);
    await expect.poll(() => host.events.at(-1)?.path, LOADED).toBe(MOVED_PATH);
    await board.settle();
    const second = elementOf(host);
    expect([...layerOf(board).children]).toEqual([second]);
    await expect.poll(() => board.runtime.mounted(NODE)).toBe(true);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    // twice, as an editor that is armed from its first moment is given the keys twice
    const line = `${NODE}: the editor's focus() failed: nothing to focus yet`;
    expect(board.runtime.lines).toEqual([line, line]);
  });
});

describe("an onArmedChange listener that throws", () => {
  it("is logged: the listeners after it hear of the arming, and the editor gets the keys", async () => {
    const host = createTestHost();
    const models = present(host.models, "models");
    const open = models.open.bind(models);
    models.open = (context) => {
      // registered before the test host's own listener, so it runs first
      context.onArmedChange((armed) => {
        throw new Error(`cannot show armed ${armed}`);
      });
      return open(context);
    };
    const board = await mountModel(host);
    const engine = elementOf(host);

    await arm(board);
    expect(host.events.slice(1)).toEqual([
      { event: "armed", ...EDITOR, armed: true },
      { event: "focus", ...EDITOR },
    ]);
    expect(engine.parentElement).toBe(layerOf(board));
    expect(board.runtime.mounted(NODE)).toBe(true);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });
    expect(board.runtime.lines).toEqual([
      `${NODE}: an onArmedChange listener failed: cannot show armed true`,
    ]);

    board.modeler.setViewState({ ...viewOf(board), zoom: 0.5 });
    await expect.poll(() => board.runtime.armedId()).toBeNull();
    await expect
      .poll(() => host.events.at(-1))
      .toEqual({ event: "armed", ...EDITOR, armed: false });
    expect(engine.parentElement).toBe(slotOf(board));
    expect(board.runtime.lines.at(-1)).toBe(
      `${NODE}: an onArmedChange listener failed: cannot show armed false`,
    );
  });
});

describe("an answer of open() that is no editor", () => {
  const MESSAGE = `${MODEL_PATH}: the host returned no editor`;
  const nothing = (): void => undefined;

  it.each<[string, unknown]>([
    ["null", null],
    ["a promise of null", Promise.resolve(null)],
    ["an object without ready", { release: nothing, destroy: nothing }],
    ["an object whose ready is no promise", { ready: true, release: nothing, destroy: nothing }],
    ["an object without release", { ready: Promise.resolve(), destroy: nothing }],
    ["an object without destroy", { ready: Promise.resolve(), release: nothing }],
    ["a string", "editor"],
  ])("shows that the host returned no editor: %s", async (_name, answer) => {
    const host = createTestHost();
    present(host.models, "models").open = () => answer as ReturnType<BoardModels["open"]>;
    const board = await mount(BOARD_B, { host });
    const { runtime } = board;

    await expect.poll(() => runtime.mounted(NODE), LOADED).toBe(false);
    const engine = present(
      board.node(NODE).querySelector<HTMLElement>(".board-surface__slot > .board-engine"),
      "editor element",
    );
    expect(engine.classList.contains("board-engine--failed")).toBe(true);
    expect(engine.textContent).toBe(MESSAGE);
    expect(runtime.lines).toEqual([`${NODE}: ${MESSAGE}`]);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 3 });

    // arming it and taking the board down call nothing on what is no editor
    doubleClick(board.node(NODE));
    await expect.poll(() => runtime.armedId(), LOADED).toBe(NODE);
    await board.settle();
    board.destroy();
    await expect.poll(() => engine.isConnected).toBe(false);
    await board.settle();
    expect(runtime.lines).toEqual([`${NODE}: ${MESSAGE}`]);
  });

  it("calls nothing on one that arrives after its node is gone", async () => {
    const calls: string[] = [];
    let arrive: ((answer: unknown) => void) | undefined;
    let engine: HTMLElement | undefined;
    const host = createTestHost();
    present(host.models, "models").open = (context) => {
      engine = context.element;
      return new Promise((resolve) => {
        arrive = resolve as (answer: unknown) => void;
      });
    };
    const board = await mount(BOARD_B, { host });

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => engine?.isConnected).toBe(false);
    // no editor, although it has the one call the board makes on an editor that comes too late
    present(arrive, "pending answer")({ destroy: () => void calls.push("destroy") });
    await board.settle();
    expect(calls).toEqual([]);
    expect(board.runtime.lines).toEqual([]);
    expect(standing(board)).toEqual({ ...WHOLE, nodes: 2 });
  });
});

describe("a peer that announced nothing of itself", () => {
  const GOOD: BoardPeer = {
    clientId: 7,
    user: { name: "Grace", color: "#335DE5" },
    canvas: { cursor: { x: 5, y: 5 }, selection: [] },
  };
  const CANVAS = { cursor: { x: 10, y: 10 }, selection: [NODE] };
  const drawn = (board: MountedBoard): Array<string | undefined> =>
    [...board.element.querySelectorAll<HTMLElement>(".board-presence__cursor")].map(
      (cursor) => cursor.closest<HTMLElement>("[data-peer]")?.dataset.peer,
    );
  const pointerMove = (target: Element, clientX: number, clientY: number): void =>
    void target.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        composed: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        clientX,
        clientY,
      }),
    );

  it.each<[string, unknown]>([
    ["a peer without user", [{ clientId: 1, canvas: CANVAS }, GOOD]],
    ["a peer whose user is null", [{ clientId: 1, user: null, canvas: CANVAS }, GOOD]],
    ["entries that are no objects", [null, "peer", 7, GOOD]],
  ])("is skipped and the others are drawn: %s", async (_name, peers) => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    await expect.poll(() => board.element.querySelector(".board-presence"), LOADED).not.toBeNull();
    await board.settle();

    host.setPeers(peers as BoardPeer[]);
    await expect.poll(() => drawn(board)).toEqual(["7"]);
    expect(board.element.querySelectorAll(".board-presence__outline")).toHaveLength(0);
    expect(board.element.querySelector(".board-presence")).not.toBeNull();
    expect(board.runtime.lines).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["undefined", undefined],
    ["null", null],
    ["an object", { 0: GOOD, length: 1 }],
  ])("a list that is no array is nobody, and presence goes on: %s", async (_name, peers) => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    await expect.poll(() => board.element.querySelector(".board-presence"), LOADED).not.toBeNull();
    await board.settle();
    host.setPeers([GOOD]);
    await expect.poll(() => drawn(board)).toEqual(["7"]);

    host.setPeers(peers as BoardPeer[]);
    await expect.poll(() => drawn(board)).toEqual([]);
    await board.settle();
    expect(board.element.querySelector(".board-presence")).not.toBeNull();
    expect(board.runtime.lines).toEqual([]);

    // the peers are drawn again, and this person is still published
    host.setPeers([GOOD]);
    await expect.poll(() => drawn(board)).toEqual(["7"]);
    host.published.length = 0;
    const flow = present(board.element.querySelector(".react-flow"), "canvas");
    const box = flow.getBoundingClientRect();
    pointerMove(board.pane(), box.left + 300, box.top + 200);
    await expect.poll(() => host.published.at(-1)?.cursor).toBeTruthy();
  });
});
