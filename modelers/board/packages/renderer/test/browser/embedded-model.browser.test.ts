/**
 * Beyond the kit, the two checks designIQ's kit page ran after its cases: a model node of an
 * embedded board gets the host's editor, and arming it follows the arm rules. designIQ ran them
 * with its product editors; here the editor is the test host's, which records what the board asks
 * of it. And what an import does to a model that is edited in place: it leaves the view alone
 * while the model is armed or the board moves to arm it.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { Viewport } from "../../src/arming/types.js";
import { BOARD_A, BOARD_B, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { centreOf } from "../support/pointer.js";
import { createTestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;
const others: MountedBoard[] = [];

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
  for (const other of others.splice(0)) other.destroy();
});

const LAYERED = ".board-overlay-layer > .board-engine";
/** an editor answers and the board moves within a few frames, and slower on a busy machine */
const SOON = { timeout: 5000 };
const count = (board: MountedBoard, selector: string): number =>
  board.element.querySelectorAll(selector).length;

/** a double-click in the middle of a node, as a person arms a model */
function doubleClickNode(board: MountedBoard, id: string): void {
  const wrapper = board.node(id);
  wrapper.dispatchEvent(
    new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      view: window,
      ...centreOf(wrapper),
    }),
  );
}

/** board B as a peer left it: the remark moved, the model where it was */
const REMARK_MOVED = BOARD_B.replace(`"x":880,"y":0`, `"x":880,"y":200`);

describe("the model node of an embedded board", () => {
  it("mounts one editor of the host, in the node", async () => {
    const host = createTestHost();
    const board = (mounted = await mountBoard(BOARD_B, { host }));
    const { runtime } = board;
    await expect.poll(() => runtime.mounted("n_order"), SOON).toBe(true);

    expect(host.events).toEqual([{ event: "open", nodeId: "n_order", path: MODEL_PATH }]);
    expect(runtime.counters.mounts).toEqual({ n_order: 1 });
    expect(count(board, ".board-engine")).toBe(1);
    const editor = board.node("n_order").querySelector(".board-engine > [data-test-editor]");
    expect(editor?.getAttribute("data-test-editor")).toBe("n_order");
    expect(editor?.textContent).toBe(MODEL_PATH);
    expect(runtime.lines).toEqual([]);
  });

  it("is armed by a double-click at board zoom exactly 1, in the overlay layer", async () => {
    const board = (mounted = await mountBoard(BOARD_B, { host: createTestHost() }));
    const { modeler, runtime } = board;
    const zoom = (): number => (modeler.getViewState() as Viewport).zoom;
    await expect.poll(() => runtime.mounted("n_order"), SOON).toBe(true);
    // a fitted view at zoom 1 would not show the rule
    expect(zoom()).not.toBe(1);
    expect(count(board, LAYERED)).toBe(0);

    const wrapper = board.node("n_order");
    wrapper.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        view: window,
        ...centreOf(wrapper),
      }),
    );
    await expect.poll(() => runtime.armedId(), SOON).toBe("n_order");
    expect(zoom()).toBe(1);
    await expect
      .poll(() => count(board, `${LAYERED}[data-armed="true"][data-layout="overlay"]`), SOON)
      .toBe(1);
    // it stays so once the board rests
    await board.settle();
    expect(runtime.armedId()).toBe("n_order");
    expect(zoom()).toBe(1);
    expect(count(board, LAYERED)).toBe(1);

    // a zoom of the board makes it a preview again (the rule `disarm`), through the host's own
    // view call
    modeler.setViewState({ ...(modeler.getViewState() as Viewport), zoom: 0.5 });
    await expect.poll(() => runtime.armedId(), SOON).toBeNull();
    await expect.poll(() => count(board, LAYERED), SOON).toBe(0);
    expect(zoom()).toBe(0.5);
    expect(
      board
        .node("n_order")
        .querySelectorAll('.board-engine[data-armed="false"][data-layout="preview"]'),
    ).toHaveLength(1);
    expect(runtime.counters.arm.lateDisarms).toBe(0);
    expect(runtime.lines).toEqual([]);
  });
});

describe("an import while a model is edited in place", () => {
  it("leaves the view alone while the model is armed, and its editor hears nothing", async () => {
    const host = createTestHost();
    const board = (mounted = await mountBoard(BOARD_B, { host }));
    const { modeler, runtime } = board;
    await expect.poll(() => runtime.mounted("n_order"), SOON).toBe(true);
    const fitted = modeler.getViewState();
    doubleClickNode(board, "n_order");
    await expect.poll(() => runtime.armedId(), SOON).toBe("n_order");
    await board.settle();
    const armedView = modeler.getViewState();
    expect(armedView).not.toEqual(fitted);
    host.events.length = 0;

    // the host echoes the board file on every sync: the same text, then a peer's change of it
    expect(REMARK_MOVED).not.toBe(BOARD_B);
    await modeler.importText(BOARD_B);
    await modeler.importText(REMARK_MOVED);
    await board.settle();
    expect(modeler.exportText()).toBe(REMARK_MOVED);
    expect(runtime.armedId()).toBe("n_order");
    expect(modeler.getViewState()).toEqual(armedView);
    expect(host.events).toEqual([]);
    expect(count(board, `${LAYERED}[data-armed="true"]`)).toBe(1);
  });

  it("fits as usual when the import took the armed model away", async () => {
    const board = (mounted = await mountBoard(BOARD_B, { host: createTestHost() }));
    const { modeler, runtime } = board;
    await expect.poll(() => runtime.mounted("n_order"), SOON).toBe(true);
    doubleClickNode(board, "n_order");
    await expect.poll(() => runtime.armedId(), SOON).toBe("n_order");
    await board.settle();

    await modeler.importText(BOARD_A);
    await board.settle();
    const other = await mountBoard(BOARD_A);
    others.push(other);
    expect(modeler.getViewState()).toEqual(other.modeler.getViewState());
    expect(count(board, LAYERED)).toBe(0);
  });

  it("leaves the view alone while the board moves to arm the model, which is armed in the end", async () => {
    const board = (mounted = await mountBoard(BOARD_B, { host: createTestHost() }));
    const { modeler, runtime } = board;
    const zoom = (): number => (modeler.getViewState() as Viewport).zoom;
    await expect.poll(() => runtime.mounted("n_order"), SOON).toBe(true);
    const fitted = modeler.getViewState();
    // away from the fit, so that a fit would move the board under the arming
    modeler.setViewState({ x: -150, y: 60, zoom: 0.5 });
    await board.settle();

    doubleClickNode(board, "n_order");
    // the board moves first, and the node is a preview until it stands
    expect(runtime.counters.arm.transitions).toBe(1);
    expect(runtime.armedId()).toBeNull();
    await modeler.importText(REMARK_MOVED);
    expect(modeler.getViewState()).not.toEqual(fitted);
    await expect.poll(() => runtime.armedId(), SOON).toBe("n_order");
    expect(zoom()).toBe(1);
    expect(runtime.counters.arm.transitions).toBe(1);
    expect(modeler.exportText()).toBe(REMARK_MOVED);
  });
});
