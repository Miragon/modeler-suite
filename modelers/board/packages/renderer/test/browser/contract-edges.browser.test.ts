/**
 * The edges of the contract the conformance kit does not reach, because no hook of its harness
 * drives them: a move by the arrow keys that still rests when a text is imported or the board
 * goes, what the change event counts as this board's own, a listener that leaves in the middle
 * of a delivery, a destroy under a waiting import, and where a revealed element is looked for.
 */
import { decodeBoard } from "@miragon/board-schema-model";
import { attachedHost } from "@miragon/modeler-api/conformance";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import type { Viewport } from "../../src/arming/types.js";
import {
  addNode,
  boardText,
  createBoardDoc,
  createCollaborativeModeler,
  ELEMENTS_KEY,
  NEW_NODE,
  readSnapshot,
  reconcileSnapshot,
  writeDrop,
} from "../../src/index.js";
import { BOARD_A, INVALID } from "../support/board-texts.js";
import { complaintsOf } from "../support/console-complaints.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { key } from "../support/pointer.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

const track = (board: MountedBoard): MountedBoard => {
  cleanups.push(board.destroy);
  return board;
};

/** the canvas follows the document within a few commits, and slower on a busy machine */
const SOON = { timeout: 5000 };
/** past the rest of a move by the arrow keys (KEY_MOVE_REST_MS in board-flow.tsx, 400 ms) */
const RESTED_MS = 650;
/** one step of an arrow key, in board px (React Flow's own) */
const KEY_STEP = 5;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const microtask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

/** how often onContentChanged was called since */
function countChanges(board: MountedBoard): () => number {
  let changes = 0;
  board.modeler.onContentChanged(() => changes++);
  return () => changes;
}

const NOTE = "n_note_b";
/** board A with its second note somewhere else */
const noteAt = (x: number, y: number): string => {
  const moved = BOARD_A.replace(`"x":760,"y":80`, `"x":${x},"y":${y}`);
  if (moved === BOARD_A) throw new Error("board A has no note at 760, 80");
  return moved;
};
/** where the canvas shows a node: the transform React Flow gives its wrapper */
const shownAt = (x: number, y: number): string => `translate(${x}px, ${y}px)`;

/** the note selected and focused, as after a click on it: React Flow moves such a node by the arrow keys */
async function focusedNote(board: MountedBoard): Promise<HTMLElement> {
  expect(board.modeler.elements.reveal(NOTE)).toBe(true);
  const wrapper = board.node(NOTE);
  await expect.poll(() => wrapper.classList.contains("selected"), SOON).toBe(true);
  await board.settle();
  wrapper.focus();
  expect(document.activeElement).toBe(wrapper);
  return wrapper;
}

/**
 * One arrow key on the focused note: the canvas shows the step, and the document does not hold
 * it yet. React commits the step in a microtask, and no timer runs before a microtask: whatever
 * the test does next meets the move inside its rest, however busy the machine is.
 */
async function stepRight(board: MountedBoard, wrapper: HTMLElement): Promise<void> {
  const before = board.modeler.exportText();
  expect(key(wrapper, "ArrowRight").defaultPrevented).toBe(true);
  await microtask();
  expect(wrapper.style.transform).toBe(shownAt(760 + KEY_STEP, 80));
  expect(board.modeler.exportText()).toBe(before);
}

describe("a move by the arrow keys", () => {
  it("is written once the keys rest, as one change that one undo takes back", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const changes = countChanges(board);
    const wrapper = await focusedNote(board);

    key(wrapper, "ArrowRight");
    key(wrapper, "ArrowRight");
    key(wrapper, "ArrowDown");
    await microtask();
    expect(wrapper.style.transform).toBe(shownAt(770, 85));
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);

    await expect.poll(() => modeler.exportText(), SOON).toBe(noteAt(770, 85));
    expect(changes()).toBe(1);
    expect(modeler.board.store.undo.undoStack).toHaveLength(1);
    modeler.board.undo();
    expect(modeler.exportText()).toBe(BOARD_A);
  });

  it("is given up by an import inside its rest: no write, no event, no entry of the history", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const { undo } = modeler.board.store;
    const changes = countChanges(board);
    const wrapper = await focusedNote(board);

    // a peer moved the same note meanwhile, and the host imports the text that says so
    await stepRight(board, wrapper);
    const theirs = noteAt(100, 900);
    await modeler.importText(theirs);
    expect(modeler.exportText()).toBe(theirs);
    await sleep(RESTED_MS);
    expect(modeler.exportText()).toBe(theirs);
    expect(changes()).toBe(0);
    expect(undo.undoStack).toHaveLength(0);
    expect(board.node(NOTE).style.transform).toBe(shownAt(100, 900));
  });

  it("is given up by an import of the same text too, and the node stands where the document has it", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const { undo } = modeler.board.store;
    const changes = countChanges(board);
    const wrapper = await focusedNote(board);

    await stepRight(board, wrapper);
    await modeler.importText(BOARD_A);
    await expect.poll(() => wrapper.style.transform, SOON).toBe(shownAt(760, 80));
    await sleep(RESTED_MS);
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);
    expect(undo.undoStack).toHaveLength(0);

    // the next key starts from the document's place, not from the one that was given up
    expect(key(wrapper, "ArrowRight").defaultPrevented).toBe(true);
    await expect.poll(() => modeler.exportText(), SOON).toBe(noteAt(760 + KEY_STEP, 80));
    expect(changes()).toBe(1);
  });

  it("is kept by an import that is refused", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const changes = countChanges(board);
    const wrapper = await focusedNote(board);

    await stepRight(board, wrapper);
    await expect(modeler.importText(INVALID[0] ?? "")).rejects.toThrow("not a board");
    await expect.poll(() => modeler.exportText(), SOON).toBe(noteAt(760 + KEY_STEP, 80));
    expect(changes()).toBe(1);
  });

  it("is written for a node whose id is __proto__, which only a live document can hold", async () => {
    // the reader refuses that id in a file (schema-model/format.ts); a peer's document has no reader
    const id = "__proto__";
    const doc = createBoardDoc(BOARD_A);
    const board = track(await mountBoard(BOARD_A, { liveDocument: doc }));
    const { modeler } = board;
    doc.transact(() => {
      const elements = doc.getMap<Y.Map<unknown>>(ELEMENTS_KEY);
      const copy = new Y.Map<unknown>();
      for (const [name, value] of elements.get(NOTE)?.entries() ?? []) copy.set(name, value);
      elements.set(id, copy);
    }, "peer");
    await expect.poll(() => modeler.elements.reveal(id), SOON).toBe(true);
    await expect
      .poll(() => board.element.querySelector(`.react-flow__node[data-id="${id}"].selected`), SOON)
      .not.toBeNull();
    const wrapper = board.node(id);
    await board.settle();
    wrapper.focus();

    key(wrapper, "ArrowRight");
    await microtask();
    expect(wrapper.style.transform).toBe(shownAt(760 + KEY_STEP, 80));
    await expect.poll(() => readSnapshot(doc).elements[id]?.x, SOON).toBe(760 + KEY_STEP);
  });

  it("is written when the board is destroyed inside its rest, and no listener hears of it", async () => {
    // a document of the host's, which is still there to read once the board is gone
    const doc = createBoardDoc(BOARD_A);
    const board = track(await mountBoard(BOARD_A, { liveDocument: doc }));
    const changes = countChanges(board);
    const wrapper = await focusedNote(board);

    await stepRight(board, wrapper);
    board.modeler.destroy();
    const moved = noteAt(760 + KEY_STEP, 80);
    expect(boardText(doc)).toBe(moved);
    expect(changes()).toBe(0);
    await sleep(RESTED_MS);
    expect(boardText(doc)).toBe(moved);
    expect(changes()).toBe(0);
  });

  it("does not keep the board from going when an observer of the host's document throws at that write", async () => {
    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const doc = createBoardDoc(BOARD_A);
    const board = track(await mountBoard(BOARD_A, { liveDocument: doc }));
    const wrapper = await focusedNote(board);
    await stepRight(board, wrapper);
    // as a provider that was closed before the board: its update handler has nowhere to send
    doc.on("update", () => {
      throw new Error("the provider is closed");
    });

    expect(() => board.modeler.destroy()).not.toThrow();
    expect(boardText(doc)).toBe(noteAt(760 + KEY_STEP, 80));
    await microtask();
    expect(board.element.querySelector(".board-module")).toBeNull();
    expect(complaintsOf(complaints).map((call) => call.slice(0, 2))).toEqual([
      ["[board]", "the last write of a destroyed board failed: the provider is closed"],
    ]);
  });
});

describe("the change event of a board", () => {
  it("compares a gesture with the text a foreign transaction left, without a live document too", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const { store } = modeler.board;
    const changes = countChanges(board);

    // a write under another origin into the board's own document, as the exported reconcileSnapshot makes it
    const theirs = noteAt(900, 80);
    reconcileSnapshot(store.doc, decodeBoard(theirs));
    expect(modeler.exportText()).toBe(theirs);
    expect(changes()).toBe(0);
    // the place that write gave the note already: written again, and no change
    writeDrop(store, { [NOTE]: { x: 900, y: 80 } });
    expect(changes()).toBe(0);
    // back to where the note was at the import: a change of the document as it stands
    writeDrop(store, { [NOTE]: { x: 760, y: 80 } });
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(1);
  });

  it("reports an amend as this board's change, and no undo takes it back", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const { store } = modeler.board;
    const exported: string[] = [];
    modeler.onContentChanged(() => exported.push(modeler.exportText()));

    store.amend((tx) => tx.update(NOTE, { x: 900 }));
    expect(exported).toEqual([noteAt(900, 80)]);
    expect(store.undo.undoStack).toHaveLength(0);
    modeler.board.undo();
    expect(modeler.exportText()).toBe(noteAt(900, 80));
    // an amend that leaves the text as it is reports nothing
    store.amend((tx) => tx.update(NOTE, { x: 900 }));
    expect(exported).toHaveLength(1);
  });

  it("does not call a listener that an earlier listener of the same delivery unsubscribed", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;

    const changes: string[] = [];
    let leave = (): void => undefined;
    modeler.onContentChanged(() => {
      changes.push("first");
      leave();
    });
    leave = modeler.onContentChanged(() => changes.push("second"));
    modeler.onContentChanged(() => changes.push("third"));
    addNode(modeler.board.store, { type: "text", text: "New", ...NEW_NODE.text }, { x: 0, y: 900 });
    expect(changes).toEqual(["first", "third"]);

    const selections: string[] = [];
    modeler.elements.onSelection(() => {
      selections.push("first");
      leave();
    });
    leave = modeler.elements.onSelection(() => selections.push("second"));
    modeler.elements.onSelection(() => selections.push("third"));
    expect(modeler.elements.reveal(NOTE)).toBe(true);
    expect(selections).toEqual(["first", "third"]);
  });
});

describe("an import and the canvas it waits for", () => {
  it("resolves only once the canvas the board was attached to exists", async () => {
    const element = attachedHost();
    const modeler = createCollaborativeModeler();
    cleanups.push(() => {
      modeler.destroy();
      element.parentElement?.remove();
    });
    let canvas = false;
    void modeler.board.mounted.then(() => (canvas = true));
    modeler.attachTo(element);
    await modeler.importText(BOARD_A);
    expect(canvas).toBe(true);
    expect(element.querySelector(".react-flow__viewport")).not.toBeNull();
  });

  it("is refused at once when the board is destroyed while it waits", async () => {
    const element = attachedHost();
    const modeler = createCollaborativeModeler();
    cleanups.push(() => element.parentElement?.remove());
    modeler.attachTo(element);
    const outcome = modeler.importText(BOARD_A).then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    // the import has written by now and waits for the canvas, which is not there yet
    await microtask();
    await microtask();
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(element.querySelector(".react-flow__viewport")).toBeNull();

    modeler.destroy();
    const waited = await Promise.race([outcome, sleep(2000).then(() => "still waiting")]);
    expect(waited).toBe("the board was destroyed during the import");
  });

  it("resolves although the host's free area throws, with the fit of the whole box", async () => {
    const complaints = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const plain = track(await mountBoard(BOARD_A));
    const board = track(
      await mountBoard(BOARD_A, {
        freeArea: {
          insets() {
            throw new Error("the side panel is gone");
          },
        },
      }),
    );
    expect(board.modeler.exportText()).toBe(BOARD_A);
    expect(board.modeler.getViewState()).toEqual(plain.modeler.getViewState());
    expect(complaintsOf(complaints).map((call) => call[0])).toEqual(["[board]"]);
  });
});

describe("the view of a board the person moved by hand", () => {
  const PAN_STEP = 40;

  /** a point of the pane with nothing of the board over it: where a person presses to pan */
  const barePoint = (pane: Element): { x: number; y: number } => {
    const box = pane.getBoundingClientRect();
    for (let y = box.bottom - 12; y > box.top; y -= 24) {
      for (let x = box.left + 12; x < box.right; x += 24) {
        if (document.elementFromPoint(x, y) === pane) return { x, y };
      }
    }
    throw new Error("the pane has no bare point to press on");
  };
  // React Flow pans with d3-zoom, which binds the move and the release on the event's view
  const mouse = (target: EventTarget, type: string, x: number, y: number): void => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
      }),
    );
  };
  /** a press on the bare pane, moved `steps` times to the right and released */
  function panRight(board: MountedBoard, steps: number): void {
    const pane = board.pane();
    const start = barePoint(pane);
    mouse(pane, "mousedown", start.x, start.y);
    for (let step = 1; step <= steps; step++) {
      mouse(window, "mousemove", start.x + step * PAN_STEP, start.y);
    }
    mouse(window, "mouseup", start.x + steps * PAN_STEP, start.y);
  }
  const insideHost = (board: MountedBoard, id: string): boolean => {
    const node = board.node(id).getBoundingClientRect();
    const host = board.element.getBoundingClientRect();
    return (
      node.left >= host.left &&
      node.right <= host.right &&
      node.top >= host.top &&
      node.bottom <= host.bottom
    );
  };
  const viewOf = (board: MountedBoard): Viewport => board.modeler.getViewState() as Viewport;

  it("is where a revealed element is looked for, not the view that was set last", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler } = board;
    const fitted = viewOf(board);
    expect(insideHost(board, NOTE)).toBe(true);

    // the fit leaves 24 px beside the note: three steps put its right edge out of the box
    panRight(board, 3);
    await board.settle();
    const panned = viewOf(board);
    expect(panned.x).toBeCloseTo(fitted.x + 3 * PAN_STEP, 6);
    expect(panned.zoom).toBe(fitted.zoom);
    expect(insideHost(board, NOTE)).toBe(false);

    expect(modeler.elements.reveal(NOTE)).toBe(true);
    await board.settle();
    expect(insideHost(board, NOTE)).toBe(true);
    // brought into view at the zoom the person had
    expect(viewOf(board).zoom).toBe(panned.zoom);
  });

  it("is still answered when the board is destroyed, until its canvas is gone", async () => {
    const board = track(await mountBoard(BOARD_A));
    const { modeler, element } = board;
    const fitted = viewOf(board);
    panRight(board, 2);
    await board.settle();
    const left = viewOf(board);
    expect(left.x).toBeCloseTo(fitted.x + 2 * PAN_STEP, 6);

    modeler.destroy();
    expect(modeler.getViewState()).toEqual(left);
    await microtask();
    expect(element.querySelector(".board-module")).toBeNull();
    // As built, and not as meant: React Flow resets its store before the board asks it one last
    // time, so the view the destroy kept is overwritten with the reset one (the guide's Deferred
    // section has it). A host that keeps a view reads it before it destroys the board.
    expect(modeler.getViewState()).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
