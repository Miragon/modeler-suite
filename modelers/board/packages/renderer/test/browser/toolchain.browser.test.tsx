/**
 * The canvas that moved here runs in the suite's toolchain: Vite serves its lazily loaded parts
 * and its sheet, React Flow measures its nodes in Chromium, and the test support (the mount, the
 * in-memory host, the synthetic input) drives it. What a part of the canvas does is checked in
 * that part's own file.
 */
import { afterEach, describe, expect, it } from "vitest";

import { BOARD_A, BOARD_B, BOARD_EMPTY, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { click, doubleClick, key } from "../support/pointer.js";
import { createTestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;

/** every test's board goes with the test, whether it passed or not */
async function mount(...args: Parameters<typeof mountBoard>): Promise<MountedBoard> {
  mounted = await mountBoard(...args);
  return mounted;
}

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
});

const shownNodes = (board: MountedBoard): string[] =>
  [...board.element.querySelectorAll(".react-flow__node")]
    .map((node) => node.getAttribute("data-id") ?? "")
    .sort();

describe("the board in the suite's toolchain", () => {
  it("shows the three nodes of a board of notes and a pane that takes the focus", async () => {
    const board = await mount(BOARD_A);
    expect(shownNodes(board)).toEqual(["n_group", "n_note_a", "n_note_b"]);
    expect(
      board.element.querySelector(".board-module > .board-root[data-embedded='true']"),
    ).not.toBeNull();
    for (const id of shownNodes(board)) {
      const box = board.node(id).getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
    // React Flow's sheet came with the board's own: without it a node is no positioned box
    expect(getComputedStyle(board.node("n_note_a")).position).toBe("absolute");

    const pane = board.pane();
    expect(pane.tabIndex).toBe(0);
    expect(pane.getAttribute("aria-label")).toBe("Board");
    pane.focus();
    expect(document.activeElement).toBe(pane);
    await board.settle();
    expect(board.runtime.lines).toEqual([]);
  });

  it("asks the host once for the editor of a model node and shows it in the node", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    const { runtime } = board;
    await expect.poll(() => runtime.mounted("n_order")).toBe(true);

    expect(host.events).toEqual([{ event: "open", nodeId: "n_order", path: MODEL_PATH }]);
    expect(runtime.counters.mounts).toEqual({ n_order: 1 });
    const engine = board.node("n_order").querySelector<HTMLElement>(".board-engine");
    expect(engine).not.toBeNull();
    expect(engine).toBe(host.contexts.get("n_order")?.element);
    expect({ ...engine?.dataset }).toEqual({
      strategy: "overlay",
      armed: "false",
      layout: "preview",
    });
    expect(engine?.querySelector("[data-test-editor='n_order']")?.textContent).toBe(MODEL_PATH);
    // the board's own sheet came with the entry: only there is the header a flex row
    const header = board.node("n_order").querySelector(".board-node__header");
    expect(header && getComputedStyle(header).display).toBe("flex");
    expect(runtime.lines).toEqual([]);
  });

  it.each([
    ["a board of notes", BOARD_A],
    ["a board with a model and an image, on a host that offers nothing", BOARD_B],
    ["an empty board", BOARD_EMPTY],
  ])("gives back the text of %s as it was imported", async (_name, text) => {
    const board = await mount(text);
    expect(board.modeler.exportText()).toBe(text);
  });
});

describe("the test support on a mounted board", () => {
  it("leaves nothing behind when the text is no board", async () => {
    await expect(mountBoard("not a board at all")).rejects.toThrow(/not a board/);
    expect(document.querySelector(".board-module")).toBeNull();
  });

  it.each([
    ["sync", true, MODEL_PATH],
    ["async", true, MODEL_PATH],
    ["none", false, `${MODEL_PATH} cannot be shown here`],
    ["reject", false, `${MODEL_PATH} was refused by the test host`],
  ] as const)("answers the board's open() as the seed says: %s", async (editors, shown, text) => {
    const host = createTestHost({ editors });
    const board = await mount(BOARD_B, { host });
    await expect.poll(() => board.runtime.mounted("n_order")).toBe(shown);
    const engine = host.contexts.get("n_order")?.element;
    expect(engine?.textContent).toBe(text);
    expect(engine?.classList.contains("board-engine--failed")).toBe(!shown);
    expect(host.events).toEqual([{ event: "open", nodeId: "n_order", path: MODEL_PATH }]);
  });

  it("holds an editor's ready until the test settles it", async () => {
    const host = createTestHost({ ready: "manual" });
    const board = await mount(BOARD_B, { host });
    await board.settle();
    expect(board.runtime.mounted("n_order")).toBeUndefined();
    host.settleReady("n_order");
    await expect.poll(() => board.runtime.mounted("n_order")).toBe(true);
    expect(() => host.settleReady("n_order")).toThrow(/no editor of n_order waits/);
  });

  it("clicks select and unselect, and a key on the pane is the board's", async () => {
    const board = await mount(BOARD_A);
    const { modeler } = board;
    click(board.node("n_note_b"));
    await expect.poll(() => modeler.elements.selection()).toEqual(["n_note_b"]);
    click(board.pane());
    await expect.poll(() => modeler.elements.selection()).toEqual([]);

    click(board.node("n_note_b"));
    await expect.poll(() => modeler.elements.selection()).toEqual(["n_note_b"]);
    expect(key(board.pane(), "a").defaultPrevented).toBe(false);
    expect(key(board.pane(), "Delete").defaultPrevented).toBe(true);
    await expect.poll(() => shownNodes(board)).toEqual(["n_group", "n_note_a"]);
  });

  it("records what the board does with a model's editor, from the double-click to the end", async () => {
    const host = createTestHost();
    const board = await mount(BOARD_B, { host });
    const { modeler, runtime } = board;
    await expect.poll(() => runtime.mounted("n_order")).toBe(true);
    const editor = { nodeId: "n_order", path: MODEL_PATH };
    const engine = host.contexts.get("n_order")?.element;
    expect(modeler.getViewState()).not.toMatchObject({ zoom: 1 });

    doubleClick(board.node("n_order"));
    await expect
      .poll(() => host.events.at(-1), { timeout: 5000 })
      .toEqual({ event: "focus", ...editor });
    expect(host.events.slice(1)).toEqual([
      { event: "armed", ...editor, armed: true },
      { event: "focus", ...editor },
    ]);
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.getViewState()).toMatchObject({ zoom: 1 });
    expect(engine?.parentElement?.classList.contains("board-overlay-layer")).toBe(true);
    expect(engine?.contains(document.activeElement)).toBe(true);

    modeler.setViewState({ x: 0, y: 0, zoom: 0.5 });
    await expect.poll(() => runtime.armedId()).toBeNull();
    await expect.poll(() => host.events.length).toBe(5);
    expect(host.events.slice(3)).toEqual([
      { event: "release", ...editor, armed: true },
      { event: "armed", ...editor, armed: false },
    ]);
    expect(engine?.closest(".react-flow__node")).toBe(board.node("n_order"));
    expect(engine?.contains(document.activeElement)).toBe(false);

    board.destroy();
    await expect.poll(() => host.events.at(-1)).toEqual({ event: "destroy", ...editor });
    expect(host.events.filter((entry) => entry.event === "destroy")).toHaveLength(1);
    expect(engine?.isConnected).toBe(false);
    expect(runtime.counters.arm.lateDisarms).toBe(0);
  });
});
