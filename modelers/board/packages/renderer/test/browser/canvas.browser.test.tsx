/**
 * The canvas's own input (src/canvas/board.tsx with canvas-keys.ts and click-ownership.ts): the
 * keys the board answers on its pane and on nothing else, what keeps a key from it (a modifier, a
 * key that is taken, a field, a board that moves), what it leaves on the pane when it goes, whose
 * click it is beside an armed editor, and the rectangle of a box selection there.
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

/** how long the board's move to an armed node takes: the design system's token, read off the page */
const MOTION_TOKEN = "--cd-motion-base";

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  for (const element of beside.splice(0)) element.remove();
  document.documentElement.style.removeProperty(MOTION_TOKEN);
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

/** the board moves to zoom 1 before it arms, and the surface is loaded lazily on its first use */
const ARMED = { timeout: 5000 };

function mouseAt(target: Element): MouseEventInit {
  return { bubbles: true, cancelable: true, composed: true, view: window, ...centreOf(target) };
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
    "%s on the focused note removes it as one change, and the pane takes the focus it had",
    async (name) => {
      const board = await mount(BOARD_A);
      const changes = countChanges(board);
      await reveal(board, "n_note_b");
      const pane = board.pane();
      // as a click leaves it: the focus on the node's wrapper, whose keys come up to the pane
      const wrapper = board.node("n_note_b");
      wrapper.focus();
      expect(document.activeElement).toBe(wrapper);

      expect(key(wrapper, name).defaultPrevented).toBe(true);
      await expect.poll(() => board.modeler.exportText()).toBe(WITHOUT_NOTE_B);
      await expect
        .poll(() => board.element.querySelector('.react-flow__node[data-id="n_note_b"]'))
        .toBeNull();
      await board.settle();
      expect(changes()).toBe(1);
      const left = board.modeler.elements.list().map((element) => element.id);
      expect(left.sort()).toEqual(["n_group", "n_note_a"]);
      // the wrapper went with its node: without the pane the next key would be the page's
      expect(document.activeElement).toBe(pane);
    },
  );

  it("leaves a delete key alone that comes with Alt, Control or Command", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await reveal(board, "n_note_b");
    const pane = focusedPane(board);

    for (const held of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      for (const name of ["Delete", "Backspace"]) {
        expect(key(pane, name, held).defaultPrevented, `${name} with ${Object.keys(held)}`).toBe(
          false,
        );
      }
    }
    await board.settle();
    expect(board.modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);
  });

  it("leaves a key alone that something inside the board has taken already", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await reveal(board, "n_note_b");
    const wrapper = board.node("n_note_b");
    wrapper.focus();
    const take = (event: KeyboardEvent): void => event.preventDefault();
    wrapper.addEventListener("keydown", take);

    key(wrapper, "Delete");
    key(wrapper, "Backspace");
    await board.settle();
    expect(board.modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);

    // the same key is the board's once nobody takes it first
    wrapper.removeEventListener("keydown", take);
    key(wrapper, "Delete");
    await expect.poll(() => board.modeler.exportText()).toBe(WITHOUT_NOTE_B);
  });

  it("leaves the keys of a field or a nokey element inside the pane alone, whoever put it there", async () => {
    const board = await mount(BOARD_A);
    const changes = countChanges(board);
    await reveal(board, "n_note_b");
    // in a node that is not the selected one, as a host's editor may put them into its element
    const wrapper = board.node("n_note_a");
    const inside = (tag: string, prepare?: (element: HTMLElement) => void): HTMLElement => {
      const element = document.createElement(tag);
      prepare?.(element);
      wrapper.append(element);
      beside.push(element);
      return element;
    };
    const keepTheirKeys = {
      input: inside("input"),
      textarea: inside("textarea"),
      select: inside("select"),
      contenteditable: inside("div", (element) => element.setAttribute("contenteditable", "true")),
      nokey: inside("div", (element) => element.classList.add("nokey")),
    };

    for (const [what, target] of Object.entries(keepTheirKeys)) {
      for (const name of ["Delete", "Backspace"]) {
        expect(key(target, name).defaultPrevented, `${name} on ${what}`).toBe(false);
      }
      for (const [name, held] of UNDO_AND_REDO_KEYS) {
        expect(key(target, name, held).defaultPrevented, `${name} on ${what}`).toBe(false);
      }
    }
    await board.settle();
    expect(board.modeler.exportText()).toBe(BOARD_A);
    expect(changes()).toBe(0);

    // any other element at the same place hands its keys up to the board
    expect(key(inside("div"), "Delete").defaultPrevented).toBe(true);
    await expect.poll(() => board.modeler.exportText()).toBe(WITHOUT_NOTE_B);
  });

  it("takes no key while the board moves to arm a model, not the delete key for the node the double-click selected either", async () => {
    // a move of three seconds: the keys below come while it runs, however slow the machine is
    document.documentElement.style.setProperty(MOTION_TOKEN, "3s");
    const board = await mount(BOARD_B, { host: createTestHost() });
    const { modeler, runtime } = board;
    await expect.poll(() => runtime.mounted("n_order"), ARMED).toBe(true);
    // something to undo, so that an undo key the board took would show
    modeler.board.store.gesture((tx) => tx.update("n_remark", { text: "Changed." }));
    const before = modeler.exportText();
    const pane = focusedPane(board);
    const fitted = modeler.getViewState();

    doubleClick(board.node("n_order"));
    await expect.poll(() => modeler.elements.selection()).toEqual(["n_order"]);
    await expect.poll(() => modeler.getViewState()).not.toEqual(fitted);
    expect(key(pane, "Delete").defaultPrevented).toBe(false);
    expect(key(pane, "z", { ctrlKey: true }).defaultPrevented).toBe(false);
    await board.settle();
    expect(modeler.exportText()).toBe(before);
    // the board is still on its way, and Escape is the one key that ends the move
    expect(runtime.armedId()).toBeNull();
    const on = modeler.getViewState();
    key(pane, "Escape");
    await board.settle();
    expect(modeler.getViewState()).toEqual(on);
    expect(runtime.armedId()).toBeNull();
  });

  it("gives the pane back as it was when the board goes: no focus stop, no name, no key", async () => {
    const board = await mount(BOARD_A);
    await reveal(board, "n_note_b");
    const pane = focusedPane(board);
    key(pane, "Delete");
    await expect.poll(() => board.modeler.exportText()).toBe(WITHOUT_NOTE_B);

    board.destroy();
    // the canvas is unmounted a microtask after destroy()
    await board.settle();
    expect(pane.isConnected).toBe(false);
    expect(pane.hasAttribute("tabindex")).toBe(false);
    expect(pane.hasAttribute("aria-label")).toBe(false);
    // there was a delete to undo: a listener left on the pane would take the key
    expect(key(pane, "z", { ctrlKey: true }).defaultPrevented).toBe(false);
  });

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

/** a board with its model armed by a double-click, at rest, the editor in the layer with the keys */
async function armTheModel(text = BOARD_B): Promise<ArmedBoard> {
  const host = createTestHost();
  const board = await mount(text, { host });
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

/** a model and a note that fit the board side by side at zoom 1, with an arrow, in the canonical form */
const MODEL_AND_NOTE = `${[
  `{"format":"structured-model","meta":{"title":"A model and a note","version":1},"version":1}`,
  `{"id":"e_remark_to_order","kind":"edge","source":"n_remark","sourceHandle":"left","target":"n_order","targetHandle":"right"}`,
  `{"file":"${MODEL_PATH}","height":200,"id":"n_order","kind":"node","type":"model","width":300,"x":0,"y":0,"z":"a"}`,
  `{"height":120,"id":"n_remark","kind":"node","text":"Beside the model.","type":"text","width":200,"x":340,"y":0,"z":"b"}`,
].join("\n")}\n`;

describe("a box selection that holds the armed model", () => {
  /** React Flow selects the arrows of the nodes in the rectangle with them */
  const BOX_SELECTED = ["e_remark_to_order", "n_order", "n_remark"];

  /** the model armed, then a rectangle drawn around it and the note with Shift held */
  async function boxSelectTheModelAndTheNote(): Promise<ArmedBoard & { rectangle: HTMLElement }> {
    const armed = await armTheModel(MODEL_AND_NOTE);
    const { board } = armed;
    // A click in the editor first. The board drops what React Flow selects while that click is
    // dispatched, and no longer: the rectangle below selects after it
    click(armed.editor);
    // React Flow takes an arrow into a box selection once it has measured the arrow's nodes
    await expect
      .poll(() => board.element.querySelector(".react-flow__edge g.board-arrow"))
      .not.toBeNull();
    const pane = board.pane();
    const [model, note] = ["n_order", "n_remark"].map((id) =>
      board.node(id).getBoundingClientRect(),
    );
    if (!model || !note) throw new Error("the board shows no model and note");

    // Shift is React Flow's key for a box selection, the one key of its own the board leaves on
    const shift = { bubbles: true, composed: true, view: window, key: "Shift", code: "ShiftLeft" };
    window.dispatchEvent(new KeyboardEvent("keydown", { ...shift, shiftKey: true }));
    try {
      await board.settle();
      const pointer = (type: string, clientX: number, clientY: number, buttons: number): void =>
        void pane.dispatchEvent(
          new PointerEvent(type, {
            ...mouseAt(pane),
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons,
            shiftKey: true,
            clientX,
            clientY,
          }),
        );
      const end = [note.right + 12, Math.max(model.bottom, note.bottom) + 12] as const;
      // A commit after each event, as between two events of a real pointer: React Flow's pane
      // reads what it rendered last, and its store what React committed last
      pointer("pointerdown", model.left - 12, model.top - 12, 1);
      await board.settle();
      pointer("pointermove", model.left + 20, model.top + 20, 1);
      await board.settle();
      pointer("pointermove", ...end, 1);
      await board.settle();
      pointer("pointerup", ...end, 0);
      // the click a browser sends after the release: React Flow's pane takes it for the end of
      // the selection, and the next click on the pane is a click again
      const [clientX, clientY] = end;
      pane.dispatchEvent(
        new MouseEvent("click", { ...mouseAt(pane), button: 0, shiftKey: true, clientX, clientY }),
      );
    } finally {
      window.dispatchEvent(new KeyboardEvent("keyup", shift));
    }
    const shown = (): HTMLElement | null =>
      board.element.querySelector<HTMLElement>(".react-flow__nodesselection-rect");
    await expect.poll(shown).not.toBeNull();
    // the rectangle takes the focus, and it lies in the pane
    await expect.poll(() => document.activeElement).toBe(shown());
    const rectangle = shown();
    if (!rectangle) throw new Error("the board shows no selection rectangle");
    expect(pane.contains(rectangle)).toBe(true);
    expect([...board.modeler.elements.selection()].sort()).toEqual(BOX_SELECTED);
    return { ...armed, rectangle };
  }

  it("loses its rectangle with the delete key, which removes the note and leaves the model", async () => {
    const { board, rectangle } = await boxSelectTheModelAndTheNote();
    const { modeler, runtime } = board;

    expect(key(rectangle, "Delete").defaultPrevented).toBe(true);
    await expect
      .poll(() => modeler.elements.list().map((element) => element.id))
      .toEqual(["n_order"]);
    await board.settle();
    // The armed model cannot be deleted and stays selected. React Flow drops the rectangle by
    // itself only when nothing is selected any more
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.elements.selection()).toEqual(["n_order"]);
    expect(rectangle.isConnected).toBe(false);
    expect(document.activeElement).toBe(board.pane());
  });

  it("keeps its rectangle when a drag out of the editor ends on the pane", async () => {
    const { board, editor, rectangle } = await boxSelectTheModelAndTheNote();
    const { modeler, runtime } = board;

    // React Flow's pane answers the click with an empty selection and no rectangle
    press(editor);
    releaseAndClick(board.pane());
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");
    expect([...modeler.elements.selection()].sort()).toEqual(BOX_SELECTED);
    expect(rectangle.isConnected).toBe(true);
  });
});

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

  it("without a press of its own is the board's, whatever was pressed before it: a key or a script made it", async () => {
    const { board, editor } = await armTheModel();
    const { runtime } = board;
    const pane = board.pane();
    click(editor);
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");

    pane.dispatchEvent(new MouseEvent("click", { ...mouseAt(pane), button: 0, detail: 0 }));
    await expect.poll(() => runtime.armedId()).toBeNull();
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

  const noteIsGone = (board: MountedBoard): Promise<void> =>
    expect
      .poll(() =>
        board.modeler.elements
          .list()
          .map((element) => element.id)
          .sort(),
      )
      .toEqual(["n_image", "n_order"]);
  const focusOnThePage = (): void => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
  };

  it("leaves the delete to the board after a press in the editor once the pane has the focus", async () => {
    const { board, editor } = await armTheModel();
    await reveal(board, "n_remark");

    click(editor);
    // as a Tab into the board leaves it: the key is aimed at the board, not at the page
    expect(key(focusedPane(board), "Delete").defaultPrevented).toBe(true);
    await noteIsGone(board);
  });

  it("leaves the delete to the board once nothing is armed, whatever was pressed last", async () => {
    const { board, editor } = await armTheModel();
    const { modeler, runtime } = board;
    await reveal(board, "n_remark");

    click(editor);
    // disarmed without a press on the board: a zoom by the host
    modeler.setViewState({ ...(modeler.getViewState() as object), zoom: 0.5 });
    expect(runtime.armedId()).toBeNull();
    focusOnThePage();
    expect(key(board.pane(), "Delete").defaultPrevented).toBe(true);
    await noteIsGone(board);
  });

  it("counts a press in the editor only when it is the primary button's", async () => {
    const { board, editor } = await armTheModel();
    await reveal(board, "n_remark");

    // the press that opens a context menu: no click follows it
    const init = { ...mouseAt(editor), button: 2, buttons: 2 };
    editor.dispatchEvent(
      new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse" }),
    );
    editor.dispatchEvent(new MouseEvent("mousedown", init));
    focusOnThePage();
    expect(key(board.pane(), "Delete").defaultPrevented).toBe(true);
    await noteIsGone(board);
  });
});
