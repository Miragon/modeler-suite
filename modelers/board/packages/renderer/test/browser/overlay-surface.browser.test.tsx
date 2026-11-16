/**
 * The overlay surface: which calls a host's editor gets, in which order, and where its element is
 * at each of them. designIQ's batteries measured the board with the product's editors in exactly
 * this order, so a call that moves is a change nobody else measures here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Viewport } from "../../src/arming/types.js";
import type { BoardHost, EmbeddedEditor } from "../../src/host/types.js";
import { writeRemoval } from "../../src/store/actions.js";
import { elementsOf } from "../../src/store/document.js";
import { BOARD_B, BOARD_EMPTY, MODEL_PATH } from "../support/board-texts.js";
import { complaintsOf } from "../support/console-complaints.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { doubleClick } from "../support/pointer.js";
import { createTestHost, type TestHost, type TestHostSeed } from "../support/test-host.js";

const NODE = "n_order";
const ARROW = "e_remark_to_order";
const EDITOR = { nodeId: NODE, path: MODEL_PATH } as const;
const MOVED_PATH = "processes/moved.bpmn";

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

/** a call the editor got, and the state of its element inside that call */
interface Seen {
  call: string;
  /** the element's parent: the node's slot, the board's layer, or none */
  within: "slot" | "layer" | "nothing" | "elsewhere";
  /** what `context.armed()` answered */
  armed: boolean;
  /** `data-armed` and `data-layout` of the element */
  flag: string | undefined;
  layout: string | undefined;
}

function parentOf(element: HTMLElement): Seen["within"] {
  const parent = element.parentElement;
  if (!parent) return "nothing";
  if (parent.classList.contains("board-surface__slot")) return "slot";
  if (parent.classList.contains("board-overlay-layer")) return "layer";
  return "elsewhere";
}

/** wraps the host's `open`, so that every call of an editor is recorded with where its element is */
function watchEditors(host: TestHost): Seen[] {
  const seen: Seen[] = [];
  const models = present(host.models, "models");
  const open = models.open.bind(models);
  models.open = (context) => {
    const see = (call: string): void => {
      const { element } = context;
      seen.push({
        call,
        within: parentOf(element),
        armed: context.armed(),
        flag: element.dataset.armed,
        layout: element.dataset.layout,
      });
    };
    see("open");
    context.onArmedChange((armed) => see(`armed ${armed}`));
    const watched = (editor: EmbeddedEditor): EmbeddedEditor => ({
      ready: editor.ready,
      release() {
        see("release");
        editor.release();
      },
      focus() {
        see("focus");
        editor.focus?.();
      },
      destroy() {
        see("destroy");
        editor.destroy();
      },
    });
    const answer = open(context);
    if (answer === undefined) return undefined;
    return answer instanceof Promise
      ? answer.then((editor) => editor && watched(editor))
      : watched(answer);
  };
  return seen;
}

const PREVIEW = { within: "slot", armed: false, flag: "false", layout: "preview" } as const;
const ARMED_IN_LAYER = { within: "layer", armed: true, flag: "true", layout: "overlay" } as const;

interface ModelBoard {
  board: MountedBoard;
  host: TestHost;
  seen: Seen[];
  /** the element the board made for the editor of the model node */
  engine: HTMLElement;
  slot: HTMLElement;
  body: HTMLElement;
  layer: HTMLElement;
}

/** board B on a test host, once the model node's editor is ready */
async function mountModel(seed?: TestHostSeed): Promise<ModelBoard> {
  const host = createTestHost(seed);
  const seen = watchEditors(host);
  const board = await mount(BOARD_B, { host });
  await expect.poll(() => board.runtime.mounted(NODE)).toBe(true);
  const node = board.node(NODE);
  return {
    board,
    host,
    seen,
    engine: present(host.contexts.get(NODE), "editor context").element,
    slot: present(node.querySelector<HTMLElement>(".board-surface__slot"), "slot"),
    body: present(node.querySelector<HTMLElement>(".board-node__body"), "node body"),
    layer: present(
      board.element.querySelector<HTMLElement>(".react-flow > .board-overlay-layer"),
      "overlay layer",
    ),
  };
}

async function arm({ board, host }: ModelBoard): Promise<void> {
  doubleClick(board.node(NODE));
  await expect
    .poll(() => host.events.at(-1), { timeout: 5000 })
    .toEqual({ event: "focus", ...EDITOR });
}

const viewOf = (board: MountedBoard): Viewport => board.modeler.getViewState() as Viewport;

const SIDES = ["left", "top", "width", "height"] as const;

function expectSameBox(element: Element, other: Element): void {
  const [box, wanted] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
  for (const side of SIDES) {
    expect(Math.abs(box[side] - wanted[side]), `${side} in px`).toBeLessThanOrEqual(1);
  }
}

const inlineBox = (element: HTMLElement): string[] => SIDES.map((side) => element.style[side]);

describe("the mount of a model node", () => {
  it.each(["sync", "async"] as const)(
    "opens the editor once, with its element already in the node (%s editor)",
    async (editors) => {
      const { board, host, seen, engine, slot } = await mountModel({ editors });

      expect(seen).toEqual([{ call: "open", ...PREVIEW }]);
      expect(host.events).toEqual([{ event: "open", ...EDITOR }]);
      expect(board.runtime.counters.mounts).toEqual({ [NODE]: 1 });
      expect(host.contexts.get(NODE)).toMatchObject(EDITOR);
      expect(engine.className).toBe("board-engine");
      expect({ ...engine.dataset }).toEqual({
        strategy: "overlay",
        armed: "false",
        layout: "preview",
      });
      expect(engine.parentElement).toBe(slot);
      const nesting = ".board-node__body > .board-surface[data-surface='overlay'] > *";
      expect(slot.matches(nesting)).toBe(true);
      expect(engine.querySelector(`[data-test-editor='${NODE}']`)).not.toBeNull();
      expect(inlineBox(engine)).toEqual(["", "", "", ""]);
      expect(board.runtime.lines).toEqual([]);
    },
  );

  it("opens first, then reports the mount and registers the surface, all before the editor is taken", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_EMPTY, { host });
    const { runtime } = board;
    const models = present(host.models, "models");
    const open = models.open.bind(models);
    const order: Array<{ at: string; mounts: number; registered: boolean; ready: unknown }> = [];
    const look = (at: string): void => {
      order.push({
        at,
        mounts: runtime.counters.mounts[NODE] ?? 0,
        registered: runtime.surface(NODE) !== undefined,
        ready: runtime.mounted(NODE),
      });
    };
    models.open = (context) => {
      look("inside open");
      // runs once the effect that called open has returned, and before any promise the surface made
      queueMicrotask(() => look("after the mount effect"));
      return open(context);
    };

    await board.modeler.importText(BOARD_B);
    await expect.poll(() => runtime.mounted(NODE), { timeout: 10_000 }).toBe(true);
    expect(order).toEqual([
      { at: "inside open", mounts: 0, registered: false, ready: undefined },
      { at: "after the mount effect", mounts: 1, registered: true, ready: undefined },
    ]);
  });

  it("counts as mounted only once the editor's ready resolved", async () => {
    const host = createTestHost({ ready: "manual" });
    const board = await mount(BOARD_B, { host });
    const { runtime } = board;
    await board.settle();
    expect(host.events).toEqual([{ event: "open", ...EDITOR }]);
    expect(runtime.counters.mounts).toEqual({ [NODE]: 1 });
    expect(runtime.mounted(NODE)).toBeUndefined();

    host.settleReady(NODE);
    await expect.poll(() => runtime.mounted(NODE)).toBe(true);
    expect(runtime.lines).toEqual([]);
  });

  it("counts as failed when the editor's ready rejects", async () => {
    const host = createTestHost({ ready: "manual" });
    const board = await mount(BOARD_B, { host });
    const { runtime } = board;
    await board.settle();
    expect(runtime.mounted(NODE)).toBeUndefined();

    host.settleReady(NODE, new Error("the diagram cannot be drawn"));
    await expect.poll(() => runtime.mounted(NODE)).toBe(false);
    expect(runtime.lines).toEqual([`${NODE}: the diagram cannot be drawn`]);
  });

  it("keeps the editor when the same text is imported again", async () => {
    const { board, host, engine, slot } = await mountModel();

    await board.modeler.importText(BOARD_B);
    await board.settle();
    expect(host.events).toEqual([{ event: "open", ...EDITOR }]);
    expect(board.runtime.counters.mounts).toEqual({ [NODE]: 1 });
    expect(host.contexts.get(NODE)?.element).toBe(engine);
    expect(engine.parentElement).toBe(slot);
    expect(board.runtime.mounted(NODE)).toBe(true);
  });
});

describe("an editor the host cannot hand in", () => {
  const refused = `${MODEL_PATH} was refused by the test host`;
  const thrown = "the editor's code did not load";

  it.each([
    ["answers undefined", { editors: "none" }, `${MODEL_PATH} cannot be shown here`],
    ["resolves to undefined", {}, `${MODEL_PATH} cannot be shown here`],
    ["rejects", { editors: "reject" }, refused],
    ["throws", {}, thrown],
  ] as const)("shows the message in the node when open %s", async (how, seed, message) => {
    const host = createTestHost(seed);
    if (how === "throws") {
      present(host.models, "models").open = () => {
        throw new Error(thrown);
      };
    }
    // a host that loads its editors and finds out late that it has none for this file
    if (how === "resolves to undefined") {
      present(host.models, "models").open = () => Promise.resolve(undefined);
    }
    const board = await mount(BOARD_B, { host });
    const { runtime } = board;
    await expect.poll(() => runtime.mounted(NODE)).toBe(false);

    const engine = present(
      board.node(NODE).querySelector<HTMLElement>(".board-surface__slot > .board-engine"),
      "editor element",
    );
    expect(engine.classList.contains("board-engine--failed")).toBe(true);
    expect(engine.textContent).toBe(message);
    expect(runtime.counters.mounts).toEqual({ [NODE]: 1 });
    expect(runtime.lines).toEqual([`${NODE}: ${message}`]);
    expect(host.events.filter((entry) => entry.event !== "open")).toEqual([]);
  });
});

describe("arming and disarming", () => {
  it("tells the editor that it is armed, then moves its element into the layer and gives it the keys", async () => {
    const model = await mountModel();
    const { board, host, seen, engine, slot, body, layer } = model;
    expect(viewOf(board).zoom).not.toBe(1);

    await arm(model);
    expect(seen.slice(1)).toEqual([
      { call: "armed true", within: "slot", armed: true, flag: "true", layout: "preview" },
      { call: "focus", ...ARMED_IN_LAYER },
    ]);
    expect(host.events.slice(1)).toEqual([
      { event: "armed", ...EDITOR, armed: true },
      { event: "focus", ...EDITOR },
    ]);
    expect(board.runtime.armedId()).toBe(NODE);
    expect(viewOf(board).zoom).toBe(1);

    expect(engine.parentElement).toBe(layer);
    expect([...layer.children]).toEqual([engine]);
    expect(engine.dataset.layout).toBe("overlay");
    expect(engine.dataset.armed).toBe("true");
    expectSameBox(engine, body);
    expect(slot.children).toHaveLength(0);
    expect(board.node(NODE).querySelector(".board-surface__placeholder")).not.toBeNull();
    expect(engine.contains(document.activeElement)).toBe(true);
  });

  it("moves the armed element with a pan of the board before the call that pans returns", async () => {
    const model = await mountModel();
    const { board, host, engine, body } = model;
    await arm(model);
    const view = viewOf(board);
    const before = engine.getBoundingClientRect();

    board.modeler.setViewState({ x: view.x + 40, y: view.y, zoom: view.zoom });
    const after = engine.getBoundingClientRect();
    expect(after.left - before.left).toBe(40);
    expect(after.top).toBe(before.top);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expectSameBox(engine, body);

    expect(board.runtime.armedId()).toBe(NODE);
    await board.settle();
    expect(host.events).toHaveLength(3);
  });

  it("follows the size of the armed node", async () => {
    const model = await mountModel();
    const { board, engine, body, layer } = model;
    await arm(model);
    const before = engine.getBoundingClientRect();

    board.modeler.board.store.gesture((tx) => tx.update(NODE, { width: 720, height: 480 }));
    await expect.poll(() => engine.getBoundingClientRect().width).toBe(before.width - 80);
    expect(engine.getBoundingClientRect().height).toBe(before.height - 60);
    expectSameBox(engine, body);
    expect(engine.parentElement).toBe(layer);
    expect(board.runtime.armedId()).toBe(NODE);
  });

  it("releases the editor before a zoom of the board disarms it, and puts the element back", async () => {
    const model = await mountModel();
    const { board, host, seen, engine, slot, layer } = model;
    await arm(model);

    board.modeler.setViewState({ ...viewOf(board), zoom: 0.5 });
    await expect.poll(() => board.runtime.armedId()).toBeNull();
    await expect.poll(() => host.events.length).toBe(5);
    expect(seen.slice(3)).toEqual([
      { call: "release", ...ARMED_IN_LAYER },
      { call: "armed false", within: "layer", armed: false, flag: "false", layout: "overlay" },
    ]);
    expect(host.events.slice(3)).toEqual([
      { event: "release", ...EDITOR, armed: true },
      { event: "armed", ...EDITOR, armed: false },
    ]);

    expect(engine.parentElement).toBe(slot);
    expect(layer.children).toHaveLength(0);
    expect(engine.dataset.layout).toBe("preview");
    expect(engine.dataset.armed).toBe("false");
    expect(inlineBox(engine)).toEqual(["", "", "", ""]);
    expect(board.node(NODE).querySelector(".board-surface__placeholder")).toBeNull();
    expect(engine.contains(document.activeElement)).toBe(false);
    expect(board.runtime.counters.arm.lateDisarms).toBe(0);
  });
});

describe("the end of an editor", () => {
  const destroys = (host: TestHost): number =>
    host.events.filter((entry) => entry.event === "destroy").length;

  it("destroys the editor once and removes its element when the node is removed", async () => {
    const { board, host, seen, engine } = await mountModel();

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...EDITOR });
    await board.settle();
    expect(destroys(host)).toBe(1);
    expect(seen.at(-1)).toEqual({ call: "destroy", ...PREVIEW });
    // a preview has nothing open: no release before its end
    expect(seen.map((entry) => entry.call)).toEqual(["open", "destroy"]);
    expect(engine.parentElement).toBeNull();
    expect(board.element.querySelector(".board-engine")).toBeNull();
    expect(board.runtime.surface(NODE)).toBeUndefined();
    expect(board.runtime.mounted(NODE)).toBeUndefined();
  });

  it("destroys the editor once and removes its element when the board is destroyed", async () => {
    const { board, host, engine } = await mountModel();

    board.destroy();
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...EDITOR });
    await board.settle();
    expect(destroys(host)).toBe(1);
    expect(engine.parentElement).toBeNull();
    expect(document.querySelector(".board-engine")).toBeNull();
  });

  it("releases an armed editor, then destroys it and takes its element out of the layer, when the board is destroyed", async () => {
    const model = await mountModel();
    const { board, host, seen, engine } = model;
    await arm(model);
    const complaints = vi.spyOn(console, "error");

    board.destroy();
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...EDITOR });
    await board.settle();
    expect(destroys(host)).toBe(1);
    // both while the editor is still armed and in the layer: it can end what is open
    expect(seen.slice(3)).toEqual([
      { call: "release", ...ARMED_IN_LAYER },
      { call: "destroy", ...ARMED_IN_LAYER },
    ]);
    expect(host.events.slice(3)).toEqual([
      { event: "release", ...EDITOR, armed: true },
      { event: "destroy", ...EDITOR },
    ]);
    expect(engine.parentElement).toBeNull();
    // the arming ends with the node, also while the whole canvas goes: nothing complains about it
    expect(board.runtime.armedId()).toBeNull();
    expect(board.runtime.lines).toEqual([]);
    expect(complaintsOf(complaints)).toEqual([]);
  });

  const removals: ReadonlyArray<[string, (board: MountedBoard) => unknown]> = [
    ["the person", (board) => writeRemoval(board.modeler.board.store, [NODE], [ARROW])],
    [
      "a peer",
      ({ modeler }) => {
        const { doc } = modeler.board.store;
        doc.transact(() => {
          elementsOf(doc).delete(ARROW);
          elementsOf(doc).delete(NODE);
        }, "a peer");
      },
    ],
    // the fit of an empty board is zoom 1, where the armed board stands: no zoom disarms the node
    ["an import", (board) => board.modeler.importText(BOARD_EMPTY)],
  ];

  it.each(removals)(
    "releases an armed editor, then destroys it, and ends the arming when %s removes its node",
    async (_who, remove) => {
      const model = await mountModel();
      const { board, host, seen, engine, layer } = model;
      await arm(model);
      const done = present(
        board.element.querySelector<HTMLButtonElement>("[data-board-done]"),
        "Done control",
      );
      await expect.poll(() => done.dataset.boardDone).toBe(NODE);
      expect(done.disabled).toBe(false);
      const complaints = vi.spyOn(console, "error");

      await remove(board);
      await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...EDITOR });
      await board.settle();
      expect(seen.slice(3)).toEqual([
        { call: "release", ...ARMED_IN_LAYER },
        { call: "destroy", ...ARMED_IN_LAYER },
      ]);
      expect(host.events.slice(3)).toEqual([
        { event: "release", ...EDITOR, armed: true },
        { event: "destroy", ...EDITOR },
      ]);
      expect(engine.parentElement).toBeNull();
      expect(layer.children).toHaveLength(0);
      expect(board.runtime.surface(NODE)).toBeUndefined();

      expect(board.runtime.armedId()).toBeNull();
      await expect.poll(() => done.disabled).toBe(true);
      expect(done.dataset.boardDone).toBe("");
      expect(done.getAttribute("aria-label")).toBe("Done editing: no model is being edited");
      expect(board.runtime.counters.arm.lateDisarms).toBe(0);
      expect(board.runtime.lines).toEqual([]);
      expect(complaintsOf(complaints)).toEqual([]);
    },
  );

  it("brings a node that was removed while armed back as a preview", async () => {
    const model = await mountModel();
    const { board, host, seen, layer } = model;
    await arm(model);

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...EDITOR });
    board.modeler.board.undo();
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "open", ...EDITOR });
    await board.settle();
    expect(seen.at(-1)).toEqual({ call: "open", ...PREVIEW });
    expect(host.events).toHaveLength(6);
    expect(board.runtime.armedId()).toBeNull();
    expect(layer.children).toHaveLength(0);
    expect(board.node(NODE).querySelector(".board-node")?.getAttribute("data-armed")).toBe("false");
  });

  it("destroys an editor at once when it arrives after its node is gone", async () => {
    const calls: string[] = [];
    const paths: readonly string[] = [MODEL_PATH];
    let engine: HTMLElement | undefined;
    let arrive: ((editor: EmbeddedEditor) => void) | undefined;
    const host: BoardHost = {
      models: {
        list: () => paths,
        onChange: () => () => undefined,
        open(context) {
          calls.push("open");
          engine = context.element;
          return new Promise((resolve) => {
            arrive = resolve;
          });
        },
      },
    };
    const board = await mount(BOARD_B, { host });
    expect(calls).toEqual(["open"]);

    writeRemoval(board.modeler.board.store, [NODE], [ARROW]);
    await expect.poll(() => engine?.isConnected).toBe(false);
    const handOver = present(arrive, "pending editor");
    handOver({
      ready: Promise.resolve(),
      release: () => void calls.push("release"),
      focus: () => void calls.push("focus"),
      destroy: () => void calls.push("destroy"),
    });
    await expect.poll(() => calls).toEqual(["open", "destroy"]);
    await board.settle();
    expect(calls).toEqual(["open", "destroy"]);
    expect(board.runtime.mounted(NODE)).toBeUndefined();
  });
});

describe("a model that moved to another path", () => {
  it("writes the path as one change that is on no history, and opens the editor anew there", async () => {
    const { board, host, engine } = await mountModel();
    const { modeler, runtime } = board;
    const { store } = modeler.board;
    // what the person did before somebody renamed the model
    store.gesture((tx) => tx.update("n_remark", { x: 1000 }));
    const gestured = modeler.exportText();
    expect(gestured).not.toBe(BOARD_B);
    expect(store.undo.undoStack).toHaveLength(1);
    let changes = 0;
    modeler.onContentChanged(() => void changes++);
    const first = present(host.contexts.get(NODE), "editor context");
    const moved = { nodeId: NODE, path: MOVED_PATH };

    first.relocate(MOVED_PATH);
    expect(modeler.exportText()).toBe(gestured.replace(MODEL_PATH, MOVED_PATH));
    expect(changes).toBe(1);
    expect(store.undo.undoStack).toHaveLength(1);
    expect(store.undo.redoStack).toHaveLength(0);
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "open", ...moved });
    expect(host.events).toEqual([
      { event: "open", ...EDITOR },
      { event: "destroy", ...EDITOR },
      { event: "open", ...moved },
    ]);
    expect(runtime.counters.mounts).toEqual({ [NODE]: 2 });
    const second = present(host.contexts.get(NODE), "editor context");
    expect(second).toMatchObject(moved);
    expect(second.element).not.toBe(engine);
    expect(engine.parentElement).toBeNull();
    expect(second.element.closest(".react-flow__node")).toBe(board.node(NODE));
    expect(board.element.querySelectorAll(".board-engine")).toHaveLength(1);
    await expect.poll(() => runtime.mounted(NODE)).toBe(true);

    // the editor that is gone may still call: its node shows another file now
    first.relocate("processes/too-late.bpmn");
    await board.settle();
    expect(modeler.exportText()).toBe(gestured.replace(MODEL_PATH, MOVED_PATH));
    expect(changes).toBe(1);
    expect(host.events).toHaveLength(3);

    // an undo takes back what the person did before, and the model stays where it went
    modeler.board.undo();
    expect(modeler.exportText()).toBe(BOARD_B.replace(MODEL_PATH, MOVED_PATH));
    expect(changes).toBe(2);
    expect(store.undo.undoStack).toHaveLength(0);
    await board.settle();
    expect(host.events).toHaveLength(3);
    modeler.board.redo();
    expect(modeler.exportText()).toBe(gestured.replace(MODEL_PATH, MOVED_PATH));
  });

  it("opens the new editor armed and in the layer when the node was armed", async () => {
    const model = await mountModel();
    const { board, host, seen, layer } = model;
    await arm(model);
    const moved = { nodeId: NODE, path: MOVED_PATH };

    present(host.contexts.get(NODE), "editor context").relocate(MOVED_PATH);
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "focus", ...moved });
    await board.settle();
    // twice, as measured: once for the move into the layer, once for a node armed from its first moment
    expect(seen.slice(3)).toEqual([
      { call: "destroy", ...ARMED_IN_LAYER },
      { call: "open", within: "slot", armed: true, flag: "true", layout: "preview" },
      { call: "focus", ...ARMED_IN_LAYER },
      { call: "focus", ...ARMED_IN_LAYER },
    ]);
    const second = present(host.contexts.get(NODE), "editor context").element;
    expect([...layer.children]).toEqual([second]);
    expect(board.runtime.armedId()).toBe(NODE);
  });
});
