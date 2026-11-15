/**
 * Beyond the kit, the two checks designIQ's kit page ran after its cases: a model node of an
 * embedded board gets the host's editor, and arming it follows the arm rules. designIQ ran them
 * with its product editors; here the editor is the test host's, which records what the board asks
 * of it.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { Viewport } from "../../src/arming/types.js";
import { BOARD_B, MODEL_PATH } from "../support/board-texts.js";
import { type MountedBoard, mountBoard } from "../support/mount-board.js";
import { centreOf } from "../support/pointer.js";
import { createTestHost } from "../support/test-host.js";

let mounted: MountedBoard | undefined;

afterEach(() => {
  mounted?.destroy();
  mounted = undefined;
});

const LAYERED = ".board-overlay-layer > .board-engine";
/** an editor answers and the board moves within a few frames, and slower on a busy machine */
const SOON = { timeout: 5000 };
const count = (board: MountedBoard, selector: string): number =>
  board.element.querySelectorAll(selector).length;

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
