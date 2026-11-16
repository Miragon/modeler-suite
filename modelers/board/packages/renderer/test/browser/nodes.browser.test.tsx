/**
 * What a node and an arrow draw, and what their own controls write: the frame of a model node,
 * an image, a note with its Markdown and its editor, a group's name, an arrow's label. The editor
 * in a model node has its own file (overlay-surface.browser.test.tsx).
 */
import { Position } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import { arrowShape, pointAlong } from "../../src/edges/arrow-shape.js";
import { requestEdit } from "../../src/gestures/edit-request.js";
import { addNode, formatBytes, NEW_NODE } from "../../src/store/actions.js";
import { BOARD_LOCAL } from "../../src/store/board-store.js";
import { BOARD_A, BOARD_B, IMAGE_PATH, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { centreOf, click, doubleClick, key } from "../support/pointer.js";
import { createTestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;

async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  mounted = await mountBoard(...args);
  return mounted;
}

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
});

function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the board shows no ${what}`);
  return value;
}

const part = <T extends Element = HTMLElement>(within: Element, selector: string): T =>
  present(within.querySelector<T>(selector), selector);

const texts = (elements: Iterable<Element>): Array<string | null> =>
  [...elements].map((element) => element.textContent);

/** how many gestures the board wrote into its document since this was called */
function countWrites(board: MountedBoard): () => number {
  let writes = 0;
  board.modeler.board.store.doc.on("afterTransaction", (transaction: { origin: unknown }) => {
    if (transaction.origin === BOARD_LOCAL) writes += 1;
  });
  return () => writes;
}

const textOf = (board: MountedBoard, id: string): string | undefined =>
  board.modeler.board.store.getSnapshot().nodes.find((node) => node.id === id)?.attrs.text;

const labelOf = (board: MountedBoard, id: string): string | undefined =>
  board.modeler.board.store.getSnapshot().edges.find((edge) => edge.id === id)?.attrs.label;

/** where a node is in the board file: its box, relative to its group when it has one */
interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  parent: string | undefined;
}

function placedOf(board: MountedBoard, id: string): Placed {
  const nodes = board.modeler.board.store.getSnapshot().nodes;
  const { attrs, parentId } = present(
    nodes.find((node) => node.id === id),
    id,
  );
  return { x: attrs.x, y: attrs.y, width: attrs.width, height: attrs.height, parent: parentId };
}

/**
 * React Flow measures a node a frame after it mounts, which mountBoard does not wait for, and
 * draws an arrow only between measured nodes. A resize starts from that measure.
 */
async function drawnArrow(board: MountedBoard, id: string): Promise<SVGGElement> {
  const selector = `.react-flow__edge[data-id="${id}"] g.board-arrow`;
  await expect.poll(() => board.element.querySelector(selector)).not.toBeNull();
  return part<SVGGElement>(board.element, selector);
}

/** a drag as d3-drag hears it: the press on the element, the move and the release on the window */
function drag(handle: Element, by: { x: number; y: number }): void {
  const from = centreOf(handle);
  const to = { clientX: from.clientX + by.x, clientY: from.clientY + by.y };
  const init = { bubbles: true, cancelable: true, view: window, button: 0 };
  handle.dispatchEvent(new MouseEvent("mousedown", { ...init, ...from, buttons: 1 }));
  window.dispatchEvent(new MouseEvent("mousemove", { ...init, ...to, buttons: 1 }));
  window.dispatchEvent(new MouseEvent("mouseup", { ...init, ...to }));
}

describe("a model node", () => {
  const NODE = "n_order";
  const frameOf = (board: MountedBoard): HTMLElement => part(board.node(NODE), ".board-node");

  it("names its file as the host describes it", async () => {
    const host = createTestHost({
      describe: { [MODEL_PATH]: { title: "Order to cash", kind: "BPMN" } },
    });
    const board = await mount(BOARD_B, { host });
    const frame = frameOf(board);

    expect(frame.matches("[data-armed='false'][data-strategy='overlay']")).toBe(true);
    const header = part(frame, ":scope > header.board-node__header");
    expect(
      header.querySelector(
        ":scope > .board-node__grip + .board-node__title + .board-node__notation + button.board-node__arm",
      ),
    ).not.toBeNull();
    expect(part(header, ".board-node__title").textContent).toBe("Order to cash");
    expect(part(header, ".board-node__notation").textContent).toBe("BPMN");
    expect(part(header, ".board-node__arm").textContent).toBe("Edit");
    expect(frame.querySelector(":scope > header + .board-node__body")).not.toBeNull();
    expect(board.element.querySelector(".board-slot--error")).toBeNull();
  });

  const VERSIONED_PATH = "processes/order.v2.bpmn";

  it.each([
    ["has no describe", undefined],
    ["does not know the file", {}],
  ] as const)(
    "names its file by the name up to its first dot when the host %s",
    async (_how, describe) => {
      const host = createTestHost({ models: [VERSIONED_PATH], describe });
      const board = await mount(BOARD_B.replace(MODEL_PATH, VERSIONED_PATH), { host });
      const header = part(frameOf(board), ".board-node__header");

      expect(part(header, ".board-node__title").textContent).toBe("order");
      expect(part(header, ".board-node__notation").textContent).toBe("");
      expect(host.events).toEqual([{ event: "open", nodeId: NODE, path: VERSIONED_PATH }]);
    },
  );

  it("is inert as a preview and keeps the board out of its body while armed", async () => {
    const board = await mount(BOARD_B, { host: createTestHost() });
    const { runtime } = board;
    await expect.poll(() => runtime.mounted(NODE)).toBe(true);
    const frame = frameOf(board);
    const body = part(frame, ".board-node__body");
    const button = part(frame, ".board-node__arm");
    expect(body.className).toBe("board-node__body");
    expect(body.inert).toBe(true);

    click(button);
    await expect.poll(() => runtime.armedId(), { timeout: 5000 }).toBe(NODE);
    await expect.poll(() => frame.dataset.armed).toBe("true");
    expect(body.className).toBe("board-node__body nodrag nopan nowheel nokey");
    expect(body.inert).toBe(false);
    expect(button.textContent).toBe("Done");

    click(button);
    await expect.poll(() => runtime.armedId(), { timeout: 5000 }).toBeNull();
    await expect.poll(() => frame.dataset.armed).toBe("false");
    expect(body.className).toBe("board-node__body");
    expect(body.inert).toBe(true);
    expect(button.textContent).toBe("Edit");
  });

  it("says that the file cannot be shown on a host without models", async () => {
    const board = await mount(BOARD_B, { host: {} });
    const frame = frameOf(board);
    await expect.poll(() => board.runtime.mounted(NODE)).toBe(false);

    const block = part(frame, ".board-node__body > .board-slot.board-slot--error[role='alert']");
    expect(texts(block.children)).toEqual([MODEL_PATH, "cannot be shown here"]);
    expect(part(block, "strong").textContent).toBe(MODEL_PATH);
    expect(frame.querySelector(".board-surface, .board-engine")).toBeNull();
    expect(part(frame, ".board-node__title").textContent).toBe("order-to-cash");
    expect(part(frame, ".board-node__body").inert).toBe(true);
  });

  it("says that it names no file once its path is gone, and ends the editor", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    await expect.poll(() => board.runtime.mounted(NODE)).toBe(true);
    const frame = frameOf(board);

    board.modeler.board.store.gesture((tx) => tx.update(NODE, { file: undefined }));
    await expect.poll(() => board.runtime.mounted(NODE)).toBe(false);
    const block = part(frame, ".board-node__body > .board-slot--error");
    expect(texts(block.children)).toEqual(["", "names no file"]);
    expect(frame.querySelector(".board-surface, .board-engine")).toBeNull();
    expect(host.events.map((entry) => entry.event)).toEqual(["open", "destroy"]);
  });
});

describe("an image node", () => {
  const PICTURE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 6"><path d="M0 6 4 0l4 6z"/></svg>';
  const picture = (source = PICTURE): Blob => new Blob([source], { type: "image/svg+xml" });
  const figureOf = (board: MountedBoard): HTMLElement =>
    part(board.node("n_image"), "figure.board-image");
  const drawn = (figure: Element): HTMLImageElement | null =>
    figure.querySelector<HTMLImageElement>("img.board-image__picture");

  it("draws the bytes the host has for its path", async () => {
    const bytes = picture();
    const board = await mount(BOARD_B, {
      host: createTestHost({ images: { [IMAGE_PATH]: bytes } }),
    });
    const figure = figureOf(board);

    expect(figure.dataset.missing).toBe("false");
    const image = present(drawn(figure), "picture");
    expect(image.alt).toBe("sketch.svg");
    expect(image.draggable).toBe(false);
    expect(image.src).toMatch(/^blob:/);
    expect(await (await fetch(image.src)).text()).toBe(PICTURE);
    expect(figure.querySelector(".board-image__missing")).toBeNull();
    expect(texts(part(figure, "figcaption.board-image__caption").children)).toEqual([
      IMAGE_PATH,
      formatBytes(bytes.size),
    ]);
  });

  it("shows the missing figure until the host has the bytes, and follows every change of them", async () => {
    const host = createTestHost({ images: {} });
    const board = await mount(BOARD_B, { host });
    const figure = figureOf(board);

    expect(figure.dataset.missing).toBe("true");
    expect(drawn(figure)).toBeNull();
    const missing = part(figure, ".board-image__missing[role='img']");
    expect(missing.getAttribute("aria-label")).toBe(`${IMAGE_PATH} is missing`);
    expect(texts(part(figure, ".board-image__caption").children)).toEqual([IMAGE_PATH]);

    host.setImage(IMAGE_PATH, picture());
    await expect.poll(() => drawn(figure)?.src ?? "").toMatch(/^blob:/);
    const first = present(drawn(figure), "picture").src;
    expect(figure.dataset.missing).toBe("false");
    expect(figure.querySelector(".board-image__missing")).toBeNull();
    expect(await (await fetch(first)).text()).toBe(PICTURE);

    const other = PICTURE.replace("0 0 8 6", "0 0 16 12");
    host.setImage(IMAGE_PATH, picture(other));
    await expect.poll(() => drawn(figure)?.src).not.toBe(first);
    expect(await (await fetch(present(drawn(figure), "picture").src)).text()).toBe(other);
    // the address of the bytes that went is given back
    await expect(fetch(first)).rejects.toThrow();

    host.setImage(IMAGE_PATH, undefined);
    await expect.poll(() => figure.dataset.missing).toBe("true");
    expect(drawn(figure)).toBeNull();
  });

  it("shows the missing figure on a host without images", async () => {
    const board = await mount(BOARD_B, { host: {} });
    const figure = figureOf(board);
    expect(figure.dataset.missing).toBe("true");
    expect(drawn(figure)).toBeNull();
    expect(figure.querySelector(".board-image__missing")).not.toBeNull();
  });
});

describe("a note", () => {
  const NOTE = "n_note_b";
  const SOURCE = "## Second note\n\nWith a list:\n\n- one\n- two";
  const noteOf = (board: MountedBoard, id = NOTE): HTMLElement =>
    part(board.node(id), ".board-text");
  const editorOf = (note: Element): HTMLTextAreaElement | null =>
    note.querySelector<HTMLTextAreaElement>("textarea.board-text__editor");

  async function openEditor(note: HTMLElement): Promise<HTMLTextAreaElement> {
    doubleClick(note);
    await expect.poll(() => editorOf(note)).not.toBeNull();
    const area = present(editorOf(note), "note editor");
    await expect.poll(() => document.activeElement).toBe(area);
    return area;
  }

  it("renders its Markdown once the engine has loaded", async () => {
    const board = await mount(BOARD_A);
    const note = noteOf(board);
    const body = part(note, ".board-text__body");

    await expect.poll(() => body.querySelector("h2")?.textContent).toBe("Second note");
    expect(texts(body.querySelectorAll("ul > li"))).toEqual(["one", "two"]);
    expect(texts(body.querySelectorAll("p"))).toEqual(["With a list:"]);
    expect(body.dataset.empty).toBe("false");
    expect(note.className).toBe("board-text");
    expect({ ...note.dataset }).toEqual({ color: "plain", editing: "false" });
    const first = part(noteOf(board, "n_note_a"), ".board-text__body");
    expect(texts(first.children)).toEqual(["First note"]);
    expect(board.runtime.lines).toEqual([]);

    // a line break in the text is a line break in the note
    board.modeler.board.store.gesture((tx) =>
      tx.update("n_note_a", { text: "One line\nand the next" }),
    );
    await expect.poll(() => first.querySelectorAll("p > br").length).toBe(1);
    expect(first.textContent?.trim()).toBe("One line\nand the next");
  });

  it("draws no HTML, script or picture a note's text asks for, and opens a web link in a new tab", async () => {
    const board = await mount(BOARD_A);
    const body = part(noteOf(board), ".board-text__body");
    await expect.poll(() => body.querySelector("h2")).not.toBeNull();
    const hostile = [
      "<script>window.noteRan = true</script>",
      '<b onclick="window.noteRan = true">bold</b>',
      "![a picture](https://example.org/a.png)",
      "[a script](javascript:window.noteRan=true)",
      "[the web](https://example.org/page)",
      "[a mail](mailto:someone@example.org)",
      "[another file](other.md)",
    ].join("\n\n");

    board.modeler.board.store.gesture((tx) => tx.update(NOTE, { text: hostile }));
    await expect.poll(() => body.querySelectorAll("a").length).toBe(4);
    expect(body.querySelector("script, b, img, [onclick]")).toBeNull();
    expect(body.textContent).toContain("<script>window.noteRan = true</script>");
    expect(body.textContent).toContain("[a script](javascript:window.noteRan=true)");
    // a picture is a node of the board, never a part of a note: its address stays, as a link.
    // A link that is no web or mail address leads nowhere from a board and loses its address
    const newTab = ["_blank", "noopener noreferrer"];
    expect(
      [...body.querySelectorAll("a")].map((link) => [
        link.textContent,
        link.getAttribute("href"),
        link.target,
        link.rel,
      ]),
    ).toEqual([
      ["a picture", "https://example.org/a.png", ...newTab],
      ["the web", "https://example.org/page", ...newTab],
      ["a mail", "mailto:someone@example.org", ...newTab],
      ["another file", null, "", ""],
    ]);
    expect("noteRan" in window).toBe(false);
  });

  it("opens its source on a double-click and writes nothing when the text stayed", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const note = noteOf(board);

    const area = await openEditor(note);
    expect(area.value).toBe(SOURCE);
    expect(note.className).toBe("board-text nodrag nopan nowheel nokey");
    expect(note.dataset.editing).toBe("true");
    expect(note.querySelector(".board-text__body")).toBeNull();

    area.blur();
    await expect.poll(() => note.dataset.editing).toBe("false");
    expect(editorOf(note)).toBeNull();
    expect(note.className).toBe("board-text");
    await expect.poll(() => note.querySelector("h2")?.textContent).toBe("Second note");
    expect(writes()).toBe(0);
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });

  it("commits a changed text once when the textarea is left", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    let changes = 0;
    board.modeler.onContentChanged(() => void changes++);
    const note = noteOf(board);
    const changed = "## Changed\n\n- three";

    const area = await openEditor(note);
    area.value = changed;
    area.blur();
    await expect.poll(() => note.dataset.editing).toBe("false");
    expect(textOf(board, NOTE)).toBe(changed);
    expect(writes()).toBe(1);
    expect(changes).toBe(1);
    await expect.poll(() => note.querySelector("h2")?.textContent).toBe("Changed");
    expect(texts(note.querySelectorAll("li"))).toEqual(["three"]);

    board.modeler.board.undo();
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });

  it.each([
    ["Escape", {}],
    ["Enter", { ctrlKey: true }],
    ["Enter", { metaKey: true }],
  ] as const)(
    "commits once on %s %o, and no key typed in it leaves the note",
    async (name, init) => {
      const board = await mount(BOARD_A);
      const writes = countWrites(board);
      const note = noteOf(board);
      const heardByThePage: string[] = [];
      const listen = (event: KeyboardEvent): void => void heardByThePage.push(event.key);

      const area = await openEditor(note);
      expect(board.modeler.elements.selection()).toEqual([NOTE]);
      area.value = "Typed";
      document.addEventListener("keydown", listen);
      try {
        expect(key(area, "Enter").defaultPrevented).toBe(false);
        expect(key(area, "Backspace").defaultPrevented).toBe(false);
        await board.settle();
        expect(note.isConnected).toBe(true);
        expect(note.dataset.editing).toBe("true");
        expect(writes()).toBe(0);

        expect(key(area, name, init).defaultPrevented).toBe(true);
      } finally {
        document.removeEventListener("keydown", listen);
      }
      expect(heardByThePage).toEqual([]);
      await expect.poll(() => note.dataset.editing).toBe("false");
      expect(textOf(board, NOTE)).toBe("Typed");
      expect(writes()).toBe(1);
    },
  );

  it("does not write its old text over a change that came while it was open", async () => {
    const board = await mount(BOARD_A);
    const note = noteOf(board);
    const area = await openEditor(note);

    board.modeler.board.store.gesture((tx) => tx.update(NOTE, { text: "A peer's sentence" }));
    // the open note is drawn again with the new text before anyone leaves it
    await board.settle();
    let changes = 0;
    board.modeler.onContentChanged(() => void changes++);
    area.blur();
    await expect.poll(() => note.dataset.editing).toBe("false");
    await board.settle();
    expect(textOf(board, NOTE)).toBe("A peer's sentence");
    expect(changes).toBe(0);
    expect(note.querySelector("p")?.textContent).toBe("A peer's sentence");
  });

  it("offers its grounds and its editor while it is selected", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const note = noteOf(board);
    const toolbar = (): HTMLElement | null =>
      board.element.querySelector<HTMLElement>(".board-node-toolbar[role='toolbar']");
    expect(toolbar()).toBeNull();

    click(board.node(NOTE));
    await expect.poll(() => toolbar()).not.toBeNull();
    const swatches = [
      ...present(toolbar(), "note toolbar").querySelectorAll<HTMLElement>("button.board-swatch"),
    ];
    expect(swatches.map((swatch) => swatch.dataset.color)).toEqual([
      "plain",
      "amber",
      "green",
      "blue",
      "red",
    ]);
    expect(swatches.map((swatch) => swatch.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);

    click(present(swatches[1], "amber swatch"));
    await expect.poll(() => note.dataset.color).toBe("amber");
    expect(writes()).toBe(1);
    expect(board.modeler.exportText()).toContain(`"color":"amber"`);
    expect(board.modeler.elements.selection()).toEqual([NOTE]);

    click(part(present(toolbar(), "note toolbar"), "button.board-node-toolbar__button"));
    await expect.poll(() => editorOf(note)).not.toBeNull();
    expect(toolbar()).toBeNull();
    expect(writes()).toBe(1);
  });

  it("writes its new size once when a corner is dragged", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const before = placedOf(board, NOTE);
    const { zoom } = board.modeler.getViewState() as { zoom: number };
    await drawnArrow(board, "e_note_to_note");

    click(board.node(NOTE));
    const corner = ".react-flow__resize-control.handle.bottom.right";
    await expect.poll(() => board.node(NOTE).querySelector(corner)).not.toBeNull();
    drag(part(board.node(NOTE), corner), { x: 40 * zoom, y: 20 * zoom });
    await expect.poll(() => placedOf(board, NOTE).width).not.toBe(before.width);
    const after = placedOf(board, NOTE);
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    // the pointer is in screen px, the file in whole board units
    expect(Math.abs(after.width - before.width - 40)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height - 20)).toBeLessThanOrEqual(1);
    expect(writes()).toBe(1);
  });

  it("opens in its editor when it was asked for before the note mounted", async () => {
    const board = await mount(BOARD_A);
    const { store } = board.modeler.board;

    const id = addNode(store, { type: "text", ...NEW_NODE.text, text: "" }, { x: 1200, y: 400 });
    requestEdit(id);
    await expect
      .poll(() => board.element.querySelector(`.react-flow__node[data-id="${id}"] textarea`))
      .not.toBeNull();
    const note = noteOf(board, id);
    expect(note.dataset.editing).toBe("true");
    await expect.poll(() => document.activeElement).toBe(editorOf(note));
    expect(noteOf(board).dataset.editing).toBe("false");
    expect(noteOf(board, "n_note_a").dataset.editing).toBe("false");
  });
});

describe("a group", () => {
  const GROUP = "n_group";
  const MEMBER = "n_note_a";
  const CORNER = ".react-flow__resize-control.handle.top.left";
  const groupOf = (board: MountedBoard): HTMLElement => part(board.node(GROUP), ".board-group");

  it("shows its name on a frame of four edges that follows the board zoom", async () => {
    const board = await mount(BOARD_A);
    const group = groupOf(board);

    expect(group.dataset.receiving).toBe("false");
    expect(
      [...group.querySelectorAll<HTMLElement>(":scope > .board-group__edge")].map(
        (edge) => edge.dataset.side,
      ),
    ).toEqual(["top", "right", "bottom", "left"]);
    expect(part(group, ":scope > .board-group__label").textContent).toBe("Inbox");
    const { zoom } = board.modeler.getViewState() as { zoom: number };
    expect(group.style.getPropertyValue("--board-zoom")).toBe(String(zoom));

    board.modeler.setViewState({ x: 0, y: 0, zoom: 0.5 });
    expect(group.style.getPropertyValue("--board-zoom")).toBe("0.5");
  });

  it("is renamed where its name stands", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const group = groupOf(board);

    doubleClick(part(group, ".board-group__label"));
    await expect.poll(() => group.querySelector("input.board-group__label")).not.toBeNull();
    const input = part<HTMLInputElement>(group, "input.board-group__label");
    expect(input.value).toBe("Inbox");
    expect(input.getAttribute("aria-label")).toBe("Group name");
    await expect.poll(() => document.activeElement).toBe(input);

    input.value = "  Outbox ";
    expect(key(input, "Enter").defaultPrevented).toBe(true);
    await expect
      .poll(() => group.querySelector("span.board-group__label")?.textContent)
      .toBe("Outbox");
    expect(textOf(board, GROUP)).toBe("Outbox");
    expect(writes()).toBe(1);
  });

  /** selects the group and drags its top-left corner by board units; resolves with the group as written */
  async function dragCorner(board: MountedBoard, by: { x: number; y: number }): Promise<Placed> {
    const before = placedOf(board, GROUP);
    const { zoom } = board.modeler.getViewState() as { zoom: number };
    await drawnArrow(board, "e_note_to_note");
    click(board.node(GROUP));
    await expect.poll(() => board.node(GROUP).querySelector(CORNER)).not.toBeNull();
    drag(part(board.node(GROUP), CORNER), { x: by.x * zoom, y: by.y * zoom });
    await expect.poll(() => placedOf(board, GROUP).x).not.toBe(before.x);
    const after = placedOf(board, GROUP);
    // the pointer is in screen px, the file in whole board units
    expect(Math.abs(after.x - before.x - by.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y - by.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.x + after.width - before.x - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y + after.height - before.y - before.height)).toBeLessThanOrEqual(1);
    return after;
  }

  it("keeps a member where it is on the board when its top-left corner is dragged", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const [group, member] = [placedOf(board, GROUP), placedOf(board, MEMBER)];

    const moved = await dragCorner(board, { x: 20, y: 10 });
    // a member's place is relative to the corner that moved: it gets the opposite move
    expect(placedOf(board, MEMBER)).toEqual({
      ...member,
      x: member.x - (moved.x - group.x),
      y: member.y - (moved.y - group.y),
    });
    expect(writes()).toBe(1);

    board.modeler.board.undo();
    expect(board.modeler.exportText()).toBe(BOARD_A);
  });

  it("lets go of a member that its frame no longer holds, where it is on the board", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const [group, member] = [placedOf(board, GROUP), placedOf(board, MEMBER)];
    expect(member.parent).toBe(GROUP);

    await dragCorner(board, { x: 300, y: 200 });
    await expect.poll(() => placedOf(board, MEMBER).parent).toBeUndefined();
    expect(placedOf(board, MEMBER)).toEqual({
      ...member,
      x: group.x + member.x,
      y: group.y + member.y,
      parent: undefined,
    });
    expect(writes()).toBe(2);
    expect(board.modeler.exportText()).not.toContain(`"parent":"${GROUP}"`);
  });
});

describe("an arrow", () => {
  const labelLayer = (board: MountedBoard, id: string): HTMLElement | null =>
    board.element.querySelector<HTMLElement>(`.board-arrow-label[data-edge="${id}"]`);

  async function labelOfArrow(board: MountedBoard, id: string): Promise<HTMLElement> {
    await drawnArrow(board, id);
    await expect.poll(() => labelLayer(board, id)).not.toBeNull();
    return present(labelLayer(board, id), "arrow label");
  }

  async function inputOf(board: MountedBoard, id: string): Promise<HTMLInputElement> {
    const selector = "input.board-arrow-label__text";
    await expect.poll(() => labelLayer(board, id)?.querySelector(selector)).toBeTruthy();
    const input = part<HTMLInputElement>(present(labelLayer(board, id), "arrow label"), selector);
    await expect.poll(() => document.activeElement).toBe(input);
    return input;
  }

  it("draws a line with a filled head and its label beside it", async () => {
    const board = await mount(BOARD_A);
    const arrow = await drawnArrow(board, "e_note_to_note");

    expect(arrow.dataset.moving).toBe("false");
    const line = part<SVGPathElement>(arrow, "path.react-flow__edge-path.board-arrow__line");
    expect(line.getAttribute("d")).toMatch(/^M/);
    expect(part(arrow, "path.react-flow__edge-interaction").getAttribute("d")).toBe(
      line.getAttribute("d"),
    );
    const head = part<SVGPolygonElement>(arrow, "polygon.board-arrow__head");
    expect(head.points.numberOfItems).toBe(3);
    const label = await labelOfArrow(board, "e_note_to_note");
    expect(label.className).toBe("board-arrow-label nodrag nopan");
    expect(part(label, "span.board-arrow-label__text").textContent).toBe("leads to");
    expect(board.element.querySelector(".board-arrow-grip")).toBeNull();
  });

  it("opens its label on a double-click, and Enter writes it", async () => {
    const board = await mount(BOARD_A);
    const writes = countWrites(board);
    const id = "e_note_to_note";
    const label = await labelOfArrow(board, id);

    doubleClick(part(label, "span.board-arrow-label__text"));
    const input = await inputOf(board, id);
    expect(input.className).toBe(
      "board-arrow-label__text board-inline-input nodrag nopan nowheel nokey",
    );
    expect(input.value).toBe("leads to");
    expect(input.getAttribute("aria-label")).toBe("Arrow label");

    input.value = "follows";
    expect(key(input, "Enter").defaultPrevented).toBe(true);
    await expect.poll(() => label.querySelector("span")?.textContent).toBe("follows");
    expect(label.querySelector("input")).toBeNull();
    expect(labelOf(board, id)).toBe("follows");
    expect(writes()).toBe(1);
    expect(board.modeler.exportText()).toBe(BOARD_A.replace(`"leads to"`, `"follows"`));
  });

  it("opens an input on a double-click on its line, and an emptied label leaves the file", async () => {
    const board = await mount(BOARD_B, { host: createTestHost() });
    const id = "e_remark_to_order";
    const arrow = await drawnArrow(board, id);
    expect(labelLayer(board, id)).toBeNull();

    doubleClick(part(arrow, ".react-flow__edge-interaction"));
    const input = await inputOf(board, id);
    expect(input.value).toBe("");
    input.value = "blocks";
    key(input, "Enter");
    const shown = (): string | null | undefined =>
      labelLayer(board, id)?.querySelector("span.board-arrow-label__text")?.textContent;
    await expect.poll(shown).toBe("blocks");
    expect(labelOf(board, id)).toBe("blocks");
    expect(board.modeler.exportText()).toContain(`"label":"blocks"`);

    doubleClick(part(await labelOfArrow(board, id), "span.board-arrow-label__text"));
    const again = await inputOf(board, id);
    expect(again.value).toBe("blocks");
    again.value = "";
    key(again, "Enter");
    await expect.poll(() => board.modeler.exportText()).toBe(BOARD_B);
  });
});

describe("the shape of an arrow", () => {
  const source = { x: 0, y: 0, position: Position.Right };
  const target = { x: 200, y: 0, position: Position.Left };

  it("ends its line before the target, puts the head's tip on it and the label beside the line", () => {
    const shape = arrowShape(source, target, 10);
    expect(shape.path.startsWith("M0,0 C")).toBe(true);
    expect(shape.path.endsWith(" 190,0")).toBe(true);
    expect(shape.head).toEqual({ tip: "200,0", left: "189,-4.4", right: "189,4.4" });
    expect(shape.labelTransform).toMatch(/^translate\(-50%, -100%\) /);

    const down = arrowShape(
      { x: 0, y: 0, position: Position.Bottom },
      { x: 0, y: 200, position: Position.Top },
      0,
    );
    expect(down.path.endsWith(" 0,200")).toBe(true);
    expect(down.head).toEqual({ tip: "0,200", left: "4.4,189", right: "-4.4,189" });
    expect(down.labelTransform).toMatch(/^translate\(0, -50%\) /);
  });

  it("finds a point along the line from either end, and no further than its share of a short line", () => {
    const straight = "M0,0 C100,0 200,0 300,0";
    const from = (point: { x: number; y: number }): number[] => [Math.round(point.x), point.y];
    expect(from(pointAlong(straight, 30, false))).toEqual([30, 0]);
    expect(from(pointAlong(straight, 30, true))).toEqual([270, 0]);
    expect(from(pointAlong(straight, 500, false))).toEqual([90, 0]);
    expect(from(pointAlong(straight, 500, true, 0.5))).toEqual([150, 0]);
  });
});
