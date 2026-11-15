/**
 * The canvas's own input (src/canvas/board.tsx with canvas-keys.ts and click-ownership.ts): the
 * keys the board answers on its focused pane and on nothing else, and whose click it is beside an
 * armed editor.
 */
import { afterEach, describe, expect, it } from "vitest";

import { BOARD_A, BOARD_B, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { centreOf, click, doubleClick, key } from "../support/pointer.js";
import { createTestHost, type TestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;
const beside: HTMLElement[] = [];

/** every test's board goes with the test, whether it passed or not */
async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  mounted = await mountBoard(...args);
  return mounted;
}

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  for (const element of beside.splice(0)) element.remove();
});

/** board A once its second note and the arrow that ends at it are deleted */
const WITHOUT_NOTE_B = BOARD_A.split("\n")
  .filter((line) => !line.includes('"id":"n_note_b"') && !line.includes('"id":"e_note_to_note"'))
  .join("\n");

const UNDO_AND_REDO_KEYS: ReadonlyArray<readonly [string, KeyboardEventInit]> = [
  ["z", { ctrlKey: true }],
  ["z", { metaKey: true }],
  ["Z", { ctrlKey: true, shiftKey: true }],
  ["Z", { metaKey: true, shiftKey: true }],
  ["y", { ctrlKey: true }],
  ["y", { metaKey: true }],
];

function countChanges(board: MountedBoard): () => number {
  let changes = 0;
  board.modeler.onContentChanged(() => void changes++);
  return () => changes;
}

/** selects one element as a host does, and waits until React Flow has it selected */
async function reveal(board: MountedBoard, id: string): Promise<void> {
  expect(board.modeler.elements.reveal(id)).toBe(true);
  await expect.poll(() => board.node(id).classList.contains("selected")).toBe(true);
}

function focusedPane(board: MountedBoard): HTMLElement {
  const pane = board.pane();
  pane.focus();
  expect(document.activeElement).toBe(pane);
  return pane;
}

/** a button of the page the board is a part of */
function buttonBesideTheBoard(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Save";
  document.body.append(button);
  beside.push(button);
  return button;
}

describe("the keys of the board", () => {
  it("are taken on the pane, which has a focus stop and a name", async () => {
    const board = await mount(BOARD_A);
    const pane = board.pane();
    expect(pane.getAttribute("tabindex")).toBe("0");
    expect(pane.getAttribute("aria-label")).toBe("Board");
    // with nothing selected there is nothing to delete, and the key is left to the page
    focusedPane(board);
    expect(key(pane, "Delete").defaultPrevented).toBe(false);
    expect(key(pane, "Backspace").defaultPrevented).toBe(false);
  });

  it.each(["Delete", "Backspace"])(
    "%s on the focused pane removes the revealed note as one change",
    async (name) => {
      const board = await mount(BOARD_A);
      const changes = countChanges(board);
      await reveal(board, "n_note_b");
      const pane = focusedPane(board);

      expect(key(pane, name).defaultPrevented).toBe(true);
      await expect.poll(() => board.modeler.exportText()).toBe(WITHOUT_NOTE_B);
      await expect
        .poll(() => board.element.querySelector('.react-flow__node[data-id="n_note_b"]'))
        .toBeNull();
      await board.settle();
      expect(changes()).toBe(1);
      const left = board.modeler.elements.list().map((element) => element.id);
      expect(left.sort()).toEqual(["n_group", "n_note_a"]);
      expect(document.activeElement).toBe(pane);
    },
  );

  it.each([
    ["Control", { ctrlKey: true }],
    ["Command", { metaKey: true }],
  ] as const)("%s + Z undoes; with Shift, and with Y for Z, it redoes", async (_name, held) => {
    const board = await mount(BOARD_A);
    const { modeler } = board;
    const changes = countChanges(board);
    await reveal(board, "n_note_b");
    const pane = focusedPane(board);
    key(pane, "Delete");
    await expect.poll(() => modeler.exportText()).toBe(WITHOUT_NOTE_B);

    expect(key(pane, "z", held).defaultPrevented).toBe(true);
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(key(pane, "Z", { ...held, shiftKey: true }).defaultPrevented).toBe(true);
    expect(modeler.exportText()).toBe(WITHOUT_NOTE_B);
    expect(key(pane, "z", held).defaultPrevented).toBe(true);
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(key(pane, "y", held).defaultPrevented).toBe(true);
    expect(modeler.exportText()).toBe(WITHOUT_NOTE_B);
    // the delete and each of the four
    expect(changes()).toBe(5);

    // neither an undo nor a redo: left to the page
    expect(key(pane, "Y", { ...held, shiftKey: true }).defaultPrevented).toBe(false);
    expect(key(pane, "z", { ...held, altKey: true }).defaultPrevented).toBe(false);
    expect(key(pane, "a", held).defaultPrevented).toBe(false);
    expect(key(pane, "z").defaultPrevented).toBe(false);
    expect(modeler.exportText()).toBe(WITHOUT_NOTE_B);
    expect(changes()).toBe(5);
  });

  it("leaves the undo keys alone where the host owns the history", async () => {
    const board = await mount(BOARD_A, { undoRedoKeys: false });
    const { modeler } = board;
    const changes = countChanges(board);
    await reveal(board, "n_note_b");
    const pane = focusedPane(board);
    // the delete key is the board's all the same
    expect(key(pane, "Delete").defaultPrevented).toBe(true);
    await expect.poll(() => modeler.exportText()).toBe(WITHOUT_NOTE_B);

    for (const [name, held] of UNDO_AND_REDO_KEYS) {
      expect(key(pane, name, held).defaultPrevented).toBe(false);
    }
    await board.settle();
    expect(modeler.exportText()).toBe(WITHOUT_NOTE_B);
    expect(changes()).toBe(1);
    // there was something to undo: the host runs the history itself
    modeler.board.undo();
    expect(modeler.exportText()).toBe(BOARD_A);
  });

  it("leaves a key alone that is aimed at the page or at a button beside the board", async () => {
    const board = await mount(BOARD_A);
    const { modeler } = board;
    const changes = countChanges(board);
    const button = buttonBesideTheBoard();
    await reveal(board, "n_note_b");

    const aimAt = (target: HTMLElement): void => {
      // the page itself takes no focus: it has the keys when nothing else has
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      target.focus();
      expect(document.activeElement).toBe(target);
      for (const name of ["Delete", "Backspace"]) {
        expect(key(target, name).defaultPrevented).toBe(false);
      }
      for (const [name, held] of UNDO_AND_REDO_KEYS) {
        expect(key(target, name, held).defaultPrevented).toBe(false);
      }
    };
    aimAt(document.body);
    aimAt(button);
    await board.settle();
    expect(modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);
    expect(modeler.elements.selection()).toEqual(["n_note_b"]);

    // the same keys on the pane are the board's: the note was there to be deleted
    const pane = focusedPane(board);
    key(pane, "Delete");
    await expect.poll(() => modeler.exportText()).toBe(WITHOUT_NOTE_B);
    // and the delete is there to be undone
    aimAt(document.body);
    aimAt(button);
    await board.settle();
    expect(modeler.exportText()).toBe(WITHOUT_NOTE_B);
    expect(changes()).toBe(1);
    key(pane, "z", { ctrlKey: true });
    expect(modeler.exportText()).toBe(BOARD_A);
  });

  it("leaves the keys of a note that is being written to its textarea", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    const note = board.node("n_note_b");
    const text = note.querySelector(".board-text");
    if (!text) throw new Error("the note has no text");
    doubleClick(text);
    await expect.poll(() => note.querySelector("textarea.board-text__editor")).not.toBeNull();
    const area = note.querySelector<HTMLTextAreaElement>("textarea.board-text__editor");
    if (!area) throw new Error("the note has no textarea");
    // selected: a delete key the board took for its own would remove the note
    await expect.poll(() => note.classList.contains("selected")).toBe(true);
    await expect.poll(() => document.activeElement).toBe(area);

    for (const name of ["Delete", "Backspace"]) {
      expect(key(area, name).defaultPrevented).toBe(false);
    }
    for (const [name, held] of UNDO_AND_REDO_KEYS) {
      expect(key(area, name, held).defaultPrevented).toBe(false);
    }
    await board.settle();
    expect(area.isConnected).toBe(true);
    expect(board.modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);
  });
});

describe("the selection", () => {
  it("grows with a press that holds Control or Command, and starts anew without", async () => {
    const board = await mount(BOARD_A);
    const { modeler } = board;
    const selection = (): string[] => [...modeler.elements.selection()].sort();

    click(board.node("n_note_a"));
    await expect.poll(selection).toEqual(["n_note_a"]);
    click(board.node("n_note_b"), { ctrlKey: true });
    await expect.poll(selection).toEqual(["n_note_a", "n_note_b"]);
    click(board.node("n_group"));
    await expect.poll(selection).toEqual(["n_group"]);
    click(board.node("n_note_a"), { metaKey: true });
    await expect.poll(selection).toEqual(["n_group", "n_note_a"]);
    // with the key held, a press on a selected node takes it out again
    click(board.node("n_note_a"), { metaKey: true });
    await expect.poll(selection).toEqual(["n_group"]);
  });
});

interface ArmedBoard {
  board: MountedBoard;
  host: TestHost;
  /** the host's editor of the armed node, in the board's layer */
  editor: HTMLElement;
}

/** the board moves to zoom 1 before it arms, and the surface is loaded lazily on its first use */
const ARMED = { timeout: 5000 };

/** board B with its model armed by a double-click, at rest, the editor in the layer with the keys */
async function armTheModel(): Promise<ArmedBoard> {
  const host = createTestHost();
  const board = await mount(BOARD_B, { host });
  await expect.poll(() => board.runtime.mounted("n_order"), ARMED).toBe(true);
  doubleClick(board.node("n_order"));
  await expect.poll(() => board.runtime.armedId(), ARMED).toBe("n_order");
  await expect.poll(() => host.events.at(-1)?.event, ARMED).toBe("focus");
  const editor = board.element.querySelector<HTMLElement>(
    ".board-overlay-layer > .board-engine [data-test-editor='n_order']",
  );
  if (!editor) throw new Error("the armed editor is not in the overlay layer");
  return { board, host, editor };
}

function mouseAt(target: Element): MouseEventInit {
  return { bubbles: true, cancelable: true, composed: true, view: window, ...centreOf(target) };
}

/** the press of a drag that ends elsewhere */
function press(target: Element): void {
  const init = { ...mouseAt(target), button: 0, buttons: 1 };
  target.dispatchEvent(
    new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse" }),
  );
  target.dispatchEvent(new MouseEvent("mousedown", { ...init, detail: 1 }));
}

/** the end of that drag: the browser sends the click to where press and release meet */
function releaseAndClick(target: Element): void {
  const init = { ...mouseAt(target), button: 0 };
  target.dispatchEvent(
    new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse" }),
  );
  target.dispatchEvent(new MouseEvent("mouseup", { ...init, detail: 1 }));
  target.dispatchEvent(new MouseEvent("click", { ...init, detail: 1 }));
}

describe("a click beside an armed editor", () => {
  it("inside the overlay layer is the editor's: the selection and the arming stay", async () => {
    const { board, host, editor } = await armTheModel();
    const { modeler, runtime } = board;
    expect(modeler.elements.selection()).toEqual(["n_order"]);

    click(editor);
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.elements.selection()).toEqual(["n_order"]);
    expect(host.events.map((entry) => entry.event)).not.toContain("release");
  });

  it("on the pane disarms when it began there, and not as the tail of a drag out of the editor", async () => {
    const { board, host, editor } = await armTheModel();
    const { modeler, runtime } = board;
    const pane = board.pane();

    press(editor);
    releaseAndClick(pane);
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.elements.selection()).toEqual(["n_order"]);
    expect(host.events.map((entry) => entry.event)).not.toContain("release");

    // a drag that began on another node of the board ends on the pane, too
    press(board.node("n_remark"));
    releaseAndClick(pane);
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.elements.selection()).toEqual(["n_order"]);

    click(pane);
    await expect.poll(() => runtime.armedId()).toBeNull();
    await expect
      .poll(() => host.events.at(-1))
      .toEqual({ event: "armed", nodeId: "n_order", path: MODEL_PATH, armed: false });
    await expect.poll(() => modeler.elements.selection()).toEqual([]);
    expect(editor.closest(".react-flow__node")).toBe(board.node("n_order"));
  });

  it("decides whose delete it is: the editor's after a press in it that left the focus on the page", async () => {
    const { board, editor } = await armTheModel();
    const { modeler } = board;
    await reveal(board, "n_remark");
    const withRemark = modeler.exportText();
    const blur = (): void => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      expect(document.activeElement).toBe(document.body);
    };

    click(editor);
    blur();
    // Dispatched by hand: with the focus on the page a real key reaches the board only where the
    // board is the whole page (the bench). The board's key handler takes it and asks; the answer is no
    expect(key(board.pane(), "Delete").defaultPrevented).toBe(true);
    await board.settle();
    expect(modeler.exportText()).toBe(withRemark);

    // the toolbar's button is a press of its own, outside the editor
    const remove = board.element.querySelector<HTMLButtonElement>(".board-toolbar__delete");
    if (!remove) throw new Error("the toolbar has no delete button");
    expect(remove.disabled).toBe(false);
    blur();
    click(remove);
    await expect
      .poll(() =>
        modeler.elements
          .list()
          .map((element) => element.id)
          .sort(),
      )
      .toEqual(["n_image", "n_order"]);
  });
});
