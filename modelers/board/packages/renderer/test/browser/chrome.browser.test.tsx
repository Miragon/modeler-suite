/**
 * What stands on the canvas and reads the host (src/canvas/toolbar.tsx, board-gestures.tsx,
 * board-presence.tsx, src/flow/board-flow.tsx): the model picker, the image actions, the Done
 * control, the arrows derived from the host's references, and the presence layer.
 */
import { afterEach, describe, expect, it } from "vitest";

import { FALLBACK_PRESENCE_COLOR } from "../../src/canvas/presence-format.js";
import type { BoardHost, BoardPeer } from "../../src/host/types.js";
import { BOARD_A, BOARD_B, BOARD_EMPTY, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { click, doubleClick } from "../support/pointer.js";
import { createTestHost, type TestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;

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
});

/** a part that is loaded lazily comes from the dev server on its first use in this file */
const LOADED = { timeout: 5000 };

const DISCOUNT_PATH = "decisions/discount.dmn";
const BILLING_PATH = "processes/billing.bpmn";
const ORDER = { title: "Order to cash", kind: "BPMN" };

/** two models side by side, in the canonical form */
const TWO_MODELS = `${[
  `{"format":"structured-model","meta":{"title":"Two models","version":1},"version":1}`,
  `{"file":"${BILLING_PATH}","height":300,"id":"n_billing","kind":"node","type":"model","width":400,"x":520,"y":0,"z":"b"}`,
  `{"file":"${MODEL_PATH}","height":300,"id":"n_order","kind":"node","type":"model","width":400,"x":0,"y":0,"z":"a"}`,
].join("\n")}\n`;

const SKETCH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><path d="M4 44 24 16l12 16 8-10 16 22z"/></svg>';

function countChanges(board: MountedBoard): () => number {
  let changes = 0;
  board.modeler.onContentChanged(() => void changes++);
  return () => changes;
}

function within<T extends Element>(board: MountedBoard, selector: string): T {
  const found = board.element.querySelector<T>(selector);
  if (!found) throw new Error(`the board has no ${selector}`);
  return found;
}

const nodesOfType = (board: MountedBoard, type: string): Array<{ id: string; file?: string }> =>
  board.modeler.board.store
    .getSnapshot()
    .nodes.filter((node) => node.attrs.type === type)
    .map((node) => ({
      id: node.id,
      ...(node.attrs.file === undefined ? {} : { file: node.attrs.file }),
    }));

/** how the browser writes a colour back that was set as an inline style */
function asInlineColour(colour: string): string {
  const probe = document.createElement("span");
  probe.style.color = colour;
  return probe.style.color;
}

function sketchFiles(name: string): FileList {
  const transfer = new DataTransfer();
  transfer.items.add(new File([SKETCH], name, { type: "image/svg+xml" }));
  return transfer.files;
}

/** a double-click arms the model of board B; resolves once the board rests and its editor has the keys */
async function armTheModel(board: MountedBoard, host: TestHost): Promise<HTMLElement> {
  await expect.poll(() => board.runtime.mounted("n_order"), LOADED).toBe(true);
  doubleClick(board.node("n_order"));
  await expect.poll(() => board.runtime.armedId(), LOADED).toBe("n_order");
  await expect.poll(() => host.events.at(-1)?.event, LOADED).toBe("focus");
  return within(board, ".board-overlay-layer > .board-engine [data-test-editor='n_order']");
}

describe("the model picker", () => {
  const offered = (board: MountedBoard): Array<[string, string | null]> =>
    [...within<HTMLSelectElement>(board, "select.board-toolbar__models").options].map((option) => [
      option.value,
      option.textContent,
    ]);

  it("lists the host's models by title and kind, and follows the host's list", async () => {
    const host = createTestHost({
      models: [MODEL_PATH, DISCOUNT_PATH],
      describe: { [MODEL_PATH]: ORDER },
    });
    const board = await mount(BOARD_EMPTY, { host });
    expect(offered(board)).toEqual([
      ["", "Model…"],
      [MODEL_PATH, "Order to cash (BPMN)"],
      // what the host does not describe goes by its file name, as a model
      [DISCOUNT_PATH, "discount (model)"],
    ]);

    host.setModels([DISCOUNT_PATH, "maps/landscape.wmap", MODEL_PATH]);
    await expect
      .poll(() => offered(board))
      .toEqual([
        ["", "Model…"],
        [DISCOUNT_PATH, "discount (model)"],
        ["maps/landscape.wmap", "landscape (model)"],
        [MODEL_PATH, "Order to cash (BPMN)"],
      ]);

    host.setModels([]);
    await expect.poll(() => offered(board)).toEqual([["", "Model…"]]);
  });

  it("offers no model where the host has none", async () => {
    const board = await mount(BOARD_EMPTY);
    expect(offered(board)).toEqual([["", "Model…"]]);
  });

  it("adds one model node with the chosen path, as one change", async () => {
    const host = createTestHost({ models: [MODEL_PATH, DISCOUNT_PATH] });
    const board = await mount(BOARD_EMPTY, { host });
    const changes = countChanges(board);
    const picker = within<HTMLSelectElement>(board, "select.board-toolbar__models");

    picker.value = DISCOUNT_PATH;
    picker.dispatchEvent(new Event("change", { bubbles: true }));

    await expect
      .poll(() => nodesOfType(board, "model").map((node) => node.file))
      .toEqual([DISCOUNT_PATH]);
    const [added] = nodesOfType(board, "model");
    if (!added) throw new Error("no model node was added");
    await expect.poll(() => board.modeler.elements.selection()).toEqual([added.id]);
    await expect
      .poll(() => host.events.map((entry) => entry.path), LOADED)
      .toEqual([DISCOUNT_PATH]);
    await expect
      .poll(() => board.node(added.id).querySelector(".board-node__title")?.textContent, LOADED)
      .toBe("discount");
    await board.settle();
    expect(board.element.querySelectorAll(".react-flow__node")).toHaveLength(1);
    expect(board.modeler.exportText()).toContain(`"file":"${DISCOUNT_PATH}"`);
    expect(changes()).toBe(1);
    // the picker is a menu, not a value: it shows its prompt again
    expect(picker.value).toBe("");
  });
});

describe("the image actions", () => {
  const imageButtons = (board: MountedBoard): HTMLButtonElement[] =>
    [...board.element.querySelectorAll<HTMLButtonElement>(".board-toolbar button")].filter(
      (button) => button.textContent?.trim() === "Image",
    );
  const notices = (board: MountedBoard): Array<[string | undefined, string | null]> =>
    [...board.element.querySelectorAll<HTMLElement>(".board-notice")].map((notice) => [
      notice.dataset.kind,
      notice.querySelector("span")?.textContent ?? null,
    ]);
  /** the board's paste and drop listeners are on, with the lazily loaded gestures */
  const gesturesAreOn = (board: MountedBoard): Promise<void> =>
    expect
      .poll(() => within<HTMLElement>(board, ".react-flow").dataset.boardView, LOADED)
      .toBe("near");
  const paste = (target: Element, files: FileList): ClipboardEvent => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    });
    target.dispatchEvent(event);
    return event;
  };

  it.each([
    ["a host without images", (): BoardHost => ({}), 0],
    ["a host whose images cannot be stored", (): BoardHost => createTestHost(), 0],
    ["a host that stores images", (): BoardHost => createTestHost({ canStore: true }), 1],
  ])("show an Image button only where the host stores one: %s", async (_name, host, buttons) => {
    const board = await mount(BOARD_EMPTY, { host: host() });
    expect(imageButtons(board)).toHaveLength(buttons);
    for (const button of imageButtons(board)) expect(button.title).toMatch(/^Add an image \(/);
    // the other add actions are there either way
    expect(within(board, ".board-toolbar button[title='Add a text note']")).toBeTruthy();
  });

  it("store a picked image through the host and show it as one selected node", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_EMPTY, { host });
    const changes = countChanges(board);
    const input = within<HTMLInputElement>(board, ".board-toolbar input[type='file']");

    input.files = sketchFiles("Site plan.svg");
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await expect
      .poll(() => host.stored.map((entry) => entry.path))
      .toEqual(["assets/site-plan.svg"]);
    await expect
      .poll(() => nodesOfType(board, "image").map((node) => node.file))
      .toEqual(["assets/site-plan.svg"]);
    const [added] = nodesOfType(board, "image");
    if (!added) throw new Error("no image node was added");
    await expect.poll(() => board.modeler.elements.selection()).toEqual([added.id]);
    await expect.poll(() => notices(board).map(([kind]) => kind)).toEqual(["added"]);
    expect(host.stored[0]?.bytes.type).toBe("image/svg+xml");
    await board.settle();
    expect(changes()).toBe(1);
  });

  it("take an image pasted onto the board, and leave a paste beside it to the page", async () => {
    const host = createTestHost({ canStore: true });
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board);

    expect(paste(document.body, sketchFiles("beside.svg")).defaultPrevented).toBe(false);
    await board.settle();
    expect(host.stored).toEqual([]);

    expect(paste(board.pane(), sketchFiles("pasted.svg")).defaultPrevented).toBe(true);
    await expect.poll(() => host.stored.map((entry) => entry.path)).toEqual(["assets/pasted.svg"]);
    await expect
      .poll(() => nodesOfType(board, "image").map((node) => node.file))
      .toEqual(["assets/pasted.svg"]);
  });

  it("answer a pasted image with a notice where the host stores none", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_EMPTY, { host });
    await gesturesAreOn(board);

    expect(paste(board.pane(), sketchFiles("pasted.svg")).defaultPrevented).toBe(true);
    await expect
      .poll(() => notices(board))
      .toEqual([
        ["refused", "This board cannot store a new image yet. Add it to the repository first."],
      ]);
    expect(host.stored).toEqual([]);
    expect(nodesOfType(board, "image")).toEqual([]);
    expect(board.modeler.exportText()).toBe(BOARD_EMPTY);
  });
});

describe("the Done control", () => {
  it.each([
    ["the host's title", { [MODEL_PATH]: ORDER }, "Order to cash"],
    ["its file name where the host gives no title", undefined, "order-to-cash"],
  ])(
    "is off while nothing is armed, names the armed model by %s and ends its editing",
    async (_name, describeModels, title) => {
      const host = createTestHost({ describe: describeModels });
      const board = await mount(BOARD_B, { host });
      const done = within<HTMLButtonElement>(board, "[data-board-done]");
      expect(done.disabled).toBe(true);
      expect(done.dataset.boardDone).toBe("");
      expect(done.getAttribute("aria-label")).toBe("Done editing: no model is being edited");
      expect(done.querySelector(".board-toolbar__done-model")).toBeNull();

      await armTheModel(board, host);
      await expect.poll(() => done.dataset.boardDone).toBe("n_order");
      expect(done.disabled).toBe(false);
      expect(done.getAttribute("aria-label")).toBe(`Done editing ${title}`);
      expect(done.querySelector(".board-toolbar__done-model")?.textContent).toBe(title);

      click(done);
      await expect.poll(() => board.runtime.armedId()).toBeNull();
      await expect.poll(() => done.disabled).toBe(true);
      expect(done.dataset.boardDone).toBe("");
      expect(host.events.at(-1)).toMatchObject({ event: "armed", armed: false });
    },
  );
});

describe("the arrows derived from the host's references", () => {
  const labels = (board: MountedBoard): Array<[string | undefined, string | null]> =>
    [...board.element.querySelectorAll<HTMLElement>(".board-derived-label")].map((label) => [
      label.dataset.rel,
      label.textContent,
    ]);
  const listed = (board: MountedBoard): string[] =>
    board.modeler.elements
      .list()
      .map((element) => element.id)
      .sort();

  it("are drawn between the nodes of the two files, follow the list and are never stored", async () => {
    const host = createTestHost({ models: [MODEL_PATH, BILLING_PATH] });
    const board = await mount(TWO_MODELS, { host });
    const changes = countChanges(board);
    expect(board.modeler.exportText()).toBe(TWO_MODELS);
    await board.settle();
    expect(labels(board)).toEqual([]);

    host.setReferences([{ from: MODEL_PATH, to: BILLING_PATH, relation: "calls" }]);
    await expect.poll(() => labels(board), LOADED).toEqual([["calls", "calls"]]);
    expect(board.element.querySelectorAll(".react-flow__edge")).toHaveLength(1);
    expect(board.modeler.exportText()).toBe(TWO_MODELS);
    expect(listed(board)).toEqual(["n_billing", "n_order"]);
    expect(board.modeler.board.store.getSnapshot().edges).toEqual([]);

    // a reference to a file that has no node draws nothing; a second relation a second arrow
    host.setReferences([
      { from: MODEL_PATH, to: BILLING_PATH, relation: "calls" },
      { from: BILLING_PATH, to: MODEL_PATH, relation: "decides" },
      { from: MODEL_PATH, to: DISCOUNT_PATH, relation: "decides" },
    ]);
    await expect
      .poll(() => labels(board).sort())
      .toEqual([
        ["calls", "calls"],
        ["decides", "decides"],
      ]);

    host.setReferences([]);
    await expect.poll(() => labels(board)).toEqual([]);
    await expect.poll(() => board.element.querySelectorAll(".react-flow__edge").length).toBe(0);
    expect(board.modeler.exportText()).toBe(TWO_MODELS);
    expect(listed(board)).toEqual(["n_billing", "n_order"]);
    expect(changes()).toBe(0);
  });

  it("are there from the start where the host knows the references already", async () => {
    const host = createTestHost({
      models: [MODEL_PATH, BILLING_PATH],
      references: [{ from: BILLING_PATH, to: MODEL_PATH, relation: "calls" }],
    });
    const board = await mount(TWO_MODELS, { host });
    await expect.poll(() => labels(board), LOADED).toEqual([["calls", "calls"]]);
    expect(board.modeler.exportText()).toBe(TWO_MODELS);
  });
});

describe("the presence layer", () => {
  const ADA: BoardPeer = {
    clientId: 7,
    user: { name: 'Ada "the\\Countess" Lovelace of the Analytical Engine', color: "#335DE5" },
    canvas: { cursor: { x: 120, y: 90 }, selection: ["n_note_b", "e_note_to_note"] },
  };
  const NAMELESS: BoardPeer = {
    clientId: 8,
    user: { name: "\u0007", color: "red; background: url(//example.org/x)" },
    canvas: { cursor: { x: 10, y: 20 }, selection: [] },
  };
  const ELSEWHERE: BoardPeer = { clientId: 9, user: { name: "Grace", color: "#22aa66" } };
  const AWAY: BoardPeer = {
    clientId: 10,
    user: { name: "Edsger", color: "#aa2266" },
    canvas: { cursor: null, selection: [] },
  };

  const cursors = (board: MountedBoard): Array<Record<string, string | null | undefined>> =>
    [...board.element.querySelectorAll<HTMLElement>(".board-presence__cursor")].map((cursor) => {
      const name = cursor.querySelector<HTMLElement>(".board-presence__name");
      return {
        peer: cursor.closest<HTMLElement>("[data-peer]")?.dataset.peer,
        name: name?.textContent,
        colour: cursor.style.color,
        chip: name?.style.backgroundColor,
      };
    });
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
  /** the layer is loaded lazily and listens from its first effect on */
  const layerIsOn = async (board: MountedBoard): Promise<void> => {
    await expect.poll(() => board.element.querySelector(".board-presence"), LOADED).not.toBeNull();
    await board.settle();
  };

  it("draws a peer's cursor with the sanitised name and colour, and outlines what the peer selected", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_A, { host });
    host.setPeers([ADA, NAMELESS, ELSEWHERE, AWAY]);

    const blue = asInlineColour("#335DE5");
    const fallback = asInlineColour(FALLBACK_PRESENCE_COLOR);
    await expect
      .poll(() => cursors(board), LOADED)
      .toEqual([
        { peer: "7", name: "Ada theCountess Lovelace", colour: blue, chip: blue },
        { peer: "8", name: "?", colour: fallback, chip: fallback },
      ]);
    expect(within<HTMLElement>(board, ".board-presence__cursor").style.transform).toMatch(
      /^translate\(120px, 90px\) scale\(/,
    );
    // an arrow has no box: only the node is outlined
    const outlines = [
      ...board.element.querySelectorAll<HTMLElement>(".board-presence__outline"),
    ].map(({ style }) => [style.left, style.top, style.width, style.height, style.outlineColor]);
    expect(outlines).toEqual([["760px", "80px", "240px", "160px", blue]]);

    host.setPeers([AWAY]);
    await expect.poll(() => cursors(board)).toEqual([]);
    expect(board.element.querySelectorAll(".board-presence__outline")).toHaveLength(0);
  });

  it("draws nothing where the host has no presence", async () => {
    // once with presence, so that the lazily loaded layer is there and its absence means something
    const withPresence = await mount(BOARD_A, { host: createTestHost() });
    await layerIsOn(withPresence);
    withPresence.destroy();

    const board = await mount(BOARD_A, { host: { models: createTestHost().models } });
    await board.settle();
    expect(board.element.querySelector(".board-presence")).toBeNull();
    expect(board.runtime.lines).toEqual([]);
  });

  it("publishes this person's pointer in board coordinates, and null when the board goes", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_A, { host });
    await layerIsOn(board);

    const flow = within(board, ".react-flow").getBoundingClientRect();
    const view = board.modeler.getViewState() as { x: number; y: number; zoom: number };
    const at = { clientX: flow.left + 300, clientY: flow.top + 200 };
    pointerMove(board.pane(), at.clientX, at.clientY);
    await expect.poll(() => host.published.at(-1)?.cursor).toBeTruthy();
    const last = host.published.at(-1);
    expect(last?.selection).toEqual([]);
    expect(last?.cursor?.x).toBeCloseTo((300 - view.x) / view.zoom, 1);
    expect(last?.cursor?.y).toBeCloseTo((200 - view.y) / view.zoom, 1);
    // the view is fitted, so this is not the client point by accident
    expect(view.zoom).not.toBe(1);

    board.destroy();
    await expect.poll(() => host.published.at(-1)).toBeNull();
  });

  it("publishes this person's selection, and takes the cursor back inside an armed editor", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    await layerIsOn(board);
    const editor = await armTheModel(board, host);
    await expect.poll(() => host.published.at(-1)?.selection).toEqual(["n_order"]);

    const flow = within(board, ".react-flow").getBoundingClientRect();
    pointerMove(board.pane(), flow.left + 40, flow.top + 500);
    await expect.poll(() => host.published.at(-1)?.cursor).toBeTruthy();

    // there the model's own editor publishes the pointer, in the model's coordinates
    pointerMove(editor, flow.left + 400, flow.top + 300);
    await expect
      .poll(() => host.published.at(-1))
      .toEqual({ cursor: null, selection: ["n_order"] });
  });
});
