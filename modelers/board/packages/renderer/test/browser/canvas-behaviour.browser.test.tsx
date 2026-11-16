/**
 * Behaviour of the canvas that one statement each stands for. A review broke these statements one
 * at a time and every other test still passed, so each has a test of its own here, named after
 * what goes when the statement goes: an armed model and the delete key, a note's editor beside
 * an armed model, the double-click on a model's own button, the arming at the end of the board's
 * move, the layer an armed editor is put into, a node moved by the arrow keys, where a new node
 * lands, a pasted image, reveal, the presence publish, a part that throws, a second attachTo, an
 * arrow drawn from a handle and a node dragged under a peer's change.
 */
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { NodeProps } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { BoardFlowNode } from "../../src/flow/flow-types.js";
import { createCollaborativeModeler, ELEMENTS_KEY } from "../../src/index.js";
import type * as ModelNodeModule from "../../src/nodes/model-node.js";
import { BOARD_A, BOARD_B, BOARD_EMPTY } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { centreOf, click, doubleClick, key } from "../support/pointer.js";
import { createTestHost } from "../support/test-host.js";

/** true only inside the tests of a part that throws: every other test gets the frame as it is */
const modelFrame = vi.hoisted(() => ({ throws: false }));

vi.mock("../../src/nodes/model-node.js", async (importOriginal) => {
  const original = await importOriginal<typeof ModelNodeModule>();
  const { createElement } = await import("react");
  return {
    ...original,
    ModelNode: (props: NodeProps<BoardFlowNode>) => {
      if (modelFrame.throws) throw new Error("the frame threw");
      return createElement(original.ModelNode, props);
    },
  };
});

let mounted: MountedBoard | undefined;
const cleanups: Array<() => void> = [];

/** every test's board goes with the test, whether it passed or not */
async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  mounted = await mountBoard(...args);
  return mounted;
}

afterEach(() => {
  // the notices are one list per page: the next test's toolbar would show what this one left
  for (const dismiss of document.querySelectorAll<HTMLElement>(".board-notice button")) {
    dismiss.click();
  }
  mounted?.destroy();
  mounted = undefined;
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** a part that is loaded lazily comes from the dev server on its first use in this file */
const LOADED = { timeout: 5000 };
const MOUSE = { bubbles: true, cancelable: true, view: window, button: 0 } as const;

interface View {
  x: number;
  y: number;
  zoom: number;
}

const viewOf = (board: MountedBoard): View => board.modeler.getViewState() as View;

function countChanges(board: MountedBoard): () => number {
  let changes = 0;
  board.modeler.onContentChanged(() => void changes++);
  return () => changes;
}

function within<T extends Element = HTMLElement>(parent: Element, selector: string): T {
  const found = parent.querySelector<T>(selector);
  if (!found) throw new Error(`the board has no ${selector}`);
  return found;
}

/** a node as the board file holds it */
function nodeOf(board: MountedBoard, id: string) {
  const node = board.modeler.board.store.getSnapshot().nodes.find((one) => one.id === id);
  if (!node) throw new Error(`the board file has no node ${id}`);
  return node.attrs;
}

/** React Flow measures a node a frame after it mounts and draws an arrow only between measured nodes */
async function nodesAreMeasured(board: MountedBoard, arrowId: string): Promise<void> {
  const selector = `.react-flow__edge[data-id="${arrowId}"] g.board-arrow`;
  await expect.poll(() => board.element.querySelector(selector)).not.toBeNull();
}

/** the board's paste listener is on, with the lazily loaded gestures */
const gesturesAreOn = (board: MountedBoard): Promise<void> =>
  expect.poll(() => within(board.element, ".react-flow").dataset.boardView, LOADED).toBeDefined();

const SKETCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><path d="M4 44 24 16l12 16 8-10 16 22z"/></svg>';

function paste(target: Element, ...names: string[]): ClipboardEvent {
  const transfer = new DataTransfer();
  for (const name of names) transfer.items.add(new File([SKETCH], name, { type: "image/svg+xml" }));
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: transfer,
  });
  target.dispatchEvent(event);
  return event;
}

/** board B with the editor of its model up; returns the model's Edit button */
async function boardWithModel(): Promise<{ board: MountedBoard; edit: HTMLElement }> {
  const board = await mount(BOARD_B, { host: createTestHost() });
  await expect.poll(() => board.runtime.mounted("n_order"), LOADED).toBe(true);
  return { board, edit: within(board.node("n_order"), ".board-node__arm") };
}

/** the same with the model armed through its Edit button */
async function armedByItsButton(): Promise<MountedBoard> {
  const { board, edit } = await boardWithModel();
  click(edit);
  await expect.poll(() => board.runtime.armedId(), LOADED).toBe("n_order");
  await expect.poll(() => board.node("n_order").classList.contains("selected")).toBe(true);
  return board;
}

describe("an armed model", () => {
  it("stays on the board when the delete key is pressed on the pane", async () => {
    const board = await armedByItsButton();
    const pane = board.pane();
    pane.focus();

    key(pane, "Delete");
    // the delete key asks first (onBeforeDelete), so a node that goes would go a task later
    await board.settle();
    expect(board.modeler.elements.list().map((element) => element.id)).toContain("n_order");
    expect(board.modeler.exportText()).toBe(BOARD_B);
    expect(board.runtime.armedId()).toBe("n_order");
  });

  it("is a preview again once a note's editor opens: one thing takes the keys", async () => {
    const board = await armedByItsButton();

    doubleClick(within(board.node("n_remark"), ".board-text"));
    await expect
      .poll(() => board.element.querySelector("textarea.board-text__editor"))
      .not.toBeNull();
    await expect.poll(() => board.runtime.armedId()).toBeNull();
  });
});

describe("the Edit and Done button of a model", () => {
  it("keeps its double-click to itself: the node, which a double-click arms, does not hear of it", async () => {
    const { board, edit } = await boardWithModel();
    const fitted = viewOf(board);

    // The event alone. The two clicks a browser sends before it are the button's own, an Edit
    // and a Done or the other way round, and a test of theirs would say nothing about this event
    edit.dispatchEvent(new MouseEvent("dblclick", { ...MOUSE, ...centreOf(edit), detail: 2 }));
    // a node that heard of it would be on its way to zoom 1 within a frame
    await board.settle();
    expect(viewOf(board)).toEqual(fitted);
    expect(board.runtime.armedId()).toBeNull();
  });
});

describe("the arming at the end of the board's move", () => {
  /** the board moves in no time: its one viewport write and the arming are inside one call */
  function moveAtOnce(): void {
    const { style } = document.documentElement;
    style.setProperty("--cd-motion-base", "0ms");
    cleanups.push(() => style.removeProperty("--cd-motion-base"));
  }

  it("is committed before the call returns: the editor is in the layer at the view it is armed at", async () => {
    moveAtOnce();
    const { board, edit } = await boardWithModel();
    const node = within(board.node("n_order"), ".board-node");
    expect(viewOf(board).zoom).not.toBe(1);
    expect(node.dataset.armed).toBe("false");

    click(edit);
    // No await up to here. Left to React's own timing the commit comes a microtask later, and
    // the editor would get its armed layout after the task that moved the board
    expect(viewOf(board).zoom).toBe(1);
    expect(node.dataset.armed).toBe("true");
    const engine = within(board.element, ".board-overlay-layer > .board-engine");
    expect(engine.dataset.armed).toBe("true");
    expect(engine.dataset.layout).toBe("overlay");
  });
});

describe("the editor of an armed model", () => {
  it("is put into the board's layer as the layer is when the editor is placed, not as it was when the node rendered", async () => {
    const { board, edit } = await boardWithModel();
    const { runtime } = board;
    const layer = within(board.element, ".board-overlay-layer");
    const engine = within(board.node("n_order"), ".board-engine");
    // as for a surface that commits before the board's first commit: the board has no layer yet
    runtime.setOverlayLayer(null);

    click(edit);
    await expect.poll(() => runtime.armedId(), LOADED).toBe("n_order");
    await board.settle();
    expect(board.node("n_order").contains(engine)).toBe(true);

    runtime.setOverlayLayer(layer);
    // a pan is one tick of React Flow's store and no render of the surface
    const view = viewOf(board);
    board.modeler.setViewState({ ...view, x: view.x + 1 });
    expect(engine.parentElement).toBe(layer);
    expect(runtime.armedId()).toBe("n_order");
  });
});

describe("a node moved by the arrow keys", () => {
  it("is written once the keys rest, as one change that one undo takes back", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await nodesAreMeasured(board, "e_note_to_note");
    const wrapper = board.node("n_note_b");
    click(wrapper);
    await expect.poll(() => wrapper.classList.contains("selected")).toBe(true);
    // as a real click does: the node's wrapper takes the focus, and the arrow keys are its own
    wrapper.focus();

    expect(key(wrapper, "ArrowRight").defaultPrevented).toBe(true);
    key(wrapper, "ArrowRight");
    key(wrapper, "ArrowDown");
    // the rest is 400 ms (KEY_MOVE_REST_MS in board-flow.tsx)
    await expect
      .poll(() => [nodeOf(board, "n_note_b").x, nodeOf(board, "n_note_b").y], { timeout: 3000 })
      .toEqual([770, 85]);
    await board.settle();
    expect(changes()).toBe(1);
    board.modeler.board.undo();
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });
});

describe("a new node", () => {
  it("lands in the middle of the view, and the next one from the same view a step down and to the right", async () => {
    const board = await mount(BOARD_EMPTY);
    // The place of the node added last is kept per page, not per board (gestures/placement.ts):
    // from a view another test of this file added a node at, the count would go on. This view is
    // this test's alone
    board.modeler.setViewState({ x: -1000, y: -2000, zoom: 1 });
    const addNote = within(board.element, ".board-toolbar button[title='Add a text note']");
    const notes = (): Array<{ x: number; y: number }> =>
      board.modeler.board.store
        .getSnapshot()
        .nodes.map(({ attrs }) => ({ x: attrs.x + attrs.width / 2, y: attrs.y + attrs.height / 2 }))
        .sort((a, b) => a.x - b.x);

    click(addNote);
    await expect.poll(() => notes().length).toBe(1);
    click(addNote);
    await expect.poll(() => notes().length).toBe(2);
    click(addNote);
    await expect.poll(() => notes().length).toBe(3);
    // the board is 800 x 600: its middle at this view is 1400, 2300
    expect(notes()).toEqual([
      { x: 1400, y: 2300 },
      { x: 1428, y: 2328 },
      { x: 1456, y: 2356 },
    ]);
  });
});

describe("a pasted image", () => {
  it("is the textarea's when it is pasted into a note that is being written", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_A, { host });
    await gesturesAreOn(board);
    doubleClick(within(board.node("n_note_b"), ".board-text"));
    await expect
      .poll(() => board.element.querySelector("textarea.board-text__editor"))
      .not.toBeNull();

    const event = paste(within(board.element, "textarea.board-text__editor"), "pasted.svg");
    expect(event.defaultPrevented).toBe(false);
    await board.settle();
    expect(host.stored).toEqual([]);
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });

  it("gets a name of its own when its name is taken: two files of one name, pasted together", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board);

    expect(paste(board.pane(), "a.svg", "a.svg").defaultPrevented).toBe(true);
    await expect
      .poll(() => host.stored.map((entry) => entry.path))
      .toEqual(["assets/a.svg", "assets/a-2.svg"]);
    await expect
      .poll(() =>
        board.modeler.board.store
          .getSnapshot()
          .nodes.map((node) => node.attrs.file)
          .sort(),
      )
      .toEqual(["assets/a-2.svg", "assets/a.svg"]);
  });
});

describe("reveal", () => {
  it("leaves the view alone for an element that is in view", async () => {
    const board = await mount(BOARD_A);
    const fitted = viewOf(board);

    expect(board.modeler.elements.reveal("n_note_b")).toBe(true);
    expect(viewOf(board)).toEqual(fitted);
  });

  it("puts an element that is out of view in the middle of the board, at the zoom the board has", async () => {
    const board = await mount(BOARD_A);
    board.modeler.setViewState({ x: -5000, y: -5000, zoom: 1 });

    expect(board.modeler.elements.reveal("n_note_b")).toBe(true);
    // the note is 240 x 160 at 760, 80 and the board 800 x 600
    expect(viewOf(board)).toEqual({ x: -480, y: 140, zoom: 1 });
  });
});

describe("this person's pointer", () => {
  it("is published where it stopped, also when it moved twice within one tick of the publish", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_A, { host });
    await expect.poll(() => board.element.querySelector(".board-presence"), LOADED).not.toBeNull();
    await board.settle();
    const flow = within(board.element, ".react-flow").getBoundingClientRect();
    const view = viewOf(board);
    const moveTo = (x: number, y: number): void =>
      void board.pane().dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          composed: true,
          view: window,
          pointerId: 1,
          pointerType: "mouse",
          clientX: flow.left + x,
          clientY: flow.top + y,
        }),
      );
    const onBoard = (px: number, offset: number): number =>
      Math.round(((px - offset) / view.zoom) * 10) / 10;

    moveTo(300, 200);
    moveTo(340, 260);
    await expect
      .poll(() => host.published.at(-1)?.cursor)
      .toEqual({ x: onBoard(340, view.x), y: onBoard(260, view.y) });
  });
});

describe("a part that throws while it renders", () => {
  async function boardWhoseModelFrameThrows(): Promise<MountedBoard> {
    modelFrame.throws = true;
    cleanups.push(() => void (modelFrame.throws = false));
    // React reports the error it hands to the boundary: said here, so the run's output is not taken for a failure
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanups.push(() => reported.mockRestore());
    const board = await mount(BOARD_B, { host: createTestHost() });
    await expect.poll(() => board.runtime.lines).toContain("model node n_order: the frame threw");
    return board;
  }

  it("shows its error where it would be, and the rest of the board is drawn", async () => {
    const board = await boardWhoseModelFrameThrows();

    const shown = within(board.node("n_order"), ".board-slot--error");
    expect(shown.getAttribute("role")).toBe("alert");
    expect(within(shown, "strong").textContent).toBe("model node n_order");
    expect(within(shown, "span").textContent).toBe("the frame threw");
    expect(board.node("n_remark").querySelector(".board-text")).not.toBeNull();
    expect(board.node("n_image").querySelector(".board-image")).not.toBeNull();
    expect(board.element.querySelector(".board-toolbar")).not.toBeNull();
  });

  it("counts as failed when it is a model's frame: its editor will never be ready", async () => {
    const board = await boardWhoseModelFrameThrows();

    expect(board.runtime.mounted("n_order")).toBe(false);
  });
});

describe("attachTo", () => {
  it("mounts the board once: a second call adds nothing", async () => {
    const [first, second] = [attachedHost(), attachedHost()];
    const modeler = createCollaborativeModeler();
    cleanups.push(() => {
      modeler.destroy();
      first.parentElement?.remove();
      second.parentElement?.remove();
    });

    modeler.attachTo(first);
    modeler.attachTo(second);
    modeler.attachTo(first);
    expect(first.querySelectorAll(".board-module")).toHaveLength(1);
    expect(second.childElementCount).toBe(0);
    await modeler.board.mounted;
    expect(first.querySelectorAll(".react-flow")).toHaveLength(1);
    expect(second.childElementCount).toBe(0);
  });
});

describe("an arrow drawn from a handle", () => {
  /** React Flow hears the press on the handle and the rest on the document */
  function draw(from: Element, to: Element): void {
    const [start, end] = [centreOf(from), centreOf(to)];
    from.dispatchEvent(new MouseEvent("mousedown", { ...MOUSE, ...start, buttons: 1 }));
    for (let step = 1; step <= 4; step++) {
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          ...MOUSE,
          clientX: start.clientX + ((end.clientX - start.clientX) * step) / 4,
          clientY: start.clientY + ((end.clientY - start.clientY) * step) / 4,
          buttons: 1,
        }),
      );
    }
    document.dispatchEvent(new MouseEvent("mouseup", { ...MOUSE, ...end }));
  }

  /** the arrows of the board file but the one board A comes with */
  const drawn = (board: MountedBoard): Array<Record<string, unknown>> =>
    board.modeler.board.store
      .getSnapshot()
      .edges.filter((edge) => edge.id !== "e_note_to_note")
      .map((edge) => ({ ...edge.attrs }));

  it("runs from the node it was drawn from to the handle it was dropped on, as one change", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await nodesAreMeasured(board, "e_note_to_note");

    draw(
      within(board.node("n_note_b"), ".react-flow__handle-bottom"),
      within(board.node("n_note_a"), ".react-flow__handle-top"),
    );
    await expect.poll(() => drawn(board).length).toBe(1);
    expect(drawn(board)).toEqual([
      {
        kind: "edge",
        source: "n_note_b",
        sourceHandle: "bottom",
        target: "n_note_a",
        targetHandle: "top",
      },
    ]);
    await board.settle();
    expect(changes()).toBe(1);
  });

  it("is not drawn from a node to itself, between two of its handles", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await nodesAreMeasured(board, "e_note_to_note");
    const note = board.node("n_note_b");

    draw(within(note, ".react-flow__handle-bottom"), within(note, ".react-flow__handle-top"));
    await board.settle();
    expect(drawn(board)).toEqual([]);
    expect(changes()).toBe(0);
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });
});

describe("a node that is being dragged", () => {
  it("keeps the place of the drag when a peer changes it, and the drop keeps the peer's change", async () => {
    const board = await mount(BOARD_A);
    await nodesAreMeasured(board, "e_note_to_note");
    const wrapper = board.node("n_note_b");
    const atRest = wrapper.style.transform;
    const from = centreOf(wrapper);
    const { zoom } = viewOf(board);
    const pointerAt = (step: number): MouseEventInit => ({
      ...MOUSE,
      clientX: from.clientX - 40 * step * zoom,
      clientY: from.clientY + 30 * step * zoom,
    });

    // d3-drag hears the press on the node and the rest on the window
    wrapper.dispatchEvent(new MouseEvent("mousedown", { ...pointerAt(0), buttons: 1 }));
    for (let step = 1; step <= 5; step++) {
      window.dispatchEvent(new MouseEvent("mousemove", { ...pointerAt(step), buttons: 1 }));
    }
    await expect.poll(() => wrapper.style.transform).not.toBe(atRest);
    await board.settle();
    const dragged = wrapper.style.transform;

    // as a sync provider applies it: a transaction that is not this board's own
    const { doc } = board.modeler.board.store;
    doc.transact(() => {
      const note = doc.getMap(ELEMENTS_KEY).get("n_note_b");
      if (!(note instanceof Y.Map)) throw new Error("the document has no element n_note_b");
      note.set("text", "A peer's sentence");
    }, "peer");
    await expect
      .poll(() => within(wrapper, ".board-text__body").textContent?.trim())
      .toBe("A peer's sentence");
    await board.settle();
    expect(wrapper.style.transform).toBe(dragged);

    window.dispatchEvent(new MouseEvent("mouseup", pointerAt(5)));
    await expect.poll(() => nodeOf(board, "n_note_b").x).not.toBe(760);
    const [x, y] = [...dragged.matchAll(/-?\d+(?:\.\d+)?(?=px)/g)].map(Number);
    const written = nodeOf(board, "n_note_b");
    expect([written.x, written.y]).toEqual([Math.round(x ?? NaN), Math.round(y ?? NaN)]);
    expect(written.text).toBe("A peer's sentence");
  });
});
