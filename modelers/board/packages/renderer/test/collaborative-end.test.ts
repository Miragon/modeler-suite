/**
 * The end of a board as far as it runs without a canvas: `board.unmounted` of the contract
 * factory on a board that was never attached, and the count of the editors a board asked its
 * host for, which the signal waits on. The editors' own `destroy()` on a mounted board, armed,
 * late and twice, is held in browser/overlay-surface.browser.test.tsx.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCollaborativeModeler } from "../src/collaborative/collaborative.js";
import { boardRuntimeOf } from "../src/collaborative/internals.js";
import { createBoardRuntime } from "../src/runtime/board-context.js";
import type { BoardOptions } from "../src/runtime/options.js";
import { createBoardStore } from "../src/store/board-store.js";

/** every microtask queued before it has run: what settles without a further event has settled */
const drained = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const PARAMS: BoardOptions = {
  viewport: { x: 0, y: 0, zoom: 1 },
  arm: null,
  armzoom: null,
  armedzoom: null,
  armreturn: null,
  armmotion: null,
};

/** what happened, in order: each settle of a signal is one entry */
function journal(): { entries: string[]; note(entry: string): () => void } {
  const entries: string[] = [];
  return { entries, note: (entry) => () => void entries.push(entry) };
}

describe("the end of a board that was never attached", () => {
  it("is pending until destroy(), and settles once after it", async () => {
    const modeler = createCollaborativeModeler();
    const { entries, note } = journal();
    void modeler.board.unmounted.then(note("unmounted"));
    await drained();
    expect(entries).toEqual([]);

    modeler.destroy();
    // the canvas would unmount a microtask later: destroy() returns before the end
    expect(entries).toEqual([]);
    await modeler.board.unmounted;
    expect(entries).toEqual(["unmounted"]);
  });

  it("settles once when destroy() is called twice, and stays the same promise", async () => {
    const modeler = createCollaborativeModeler();
    const signal = modeler.board.unmounted;
    const { entries, note } = journal();
    void signal.then(note("unmounted"));

    modeler.destroy();
    modeler.destroy();
    await signal;
    modeler.destroy();
    await drained();
    expect(modeler.board.unmounted).toBe(signal);
    expect(entries).toEqual(["unmounted"]);
  });

  it("waits for an editor that is still on its way, and settles after it was dealt with", async () => {
    const modeler = createCollaborativeModeler();
    // a surface asked the host for an editor whose answer has not come
    const answered = boardRuntimeOf(modeler).askEditor();
    const { entries, note } = journal();
    void modeler.board.unmounted.then(note("unmounted"));

    modeler.destroy();
    await drained();
    expect(entries).toEqual([]);

    note("the late editor destroyed")();
    answered();
    await modeler.board.unmounted;
    expect(entries).toEqual(["the late editor destroyed", "unmounted"]);
  });
});

describe("the editors a board asked its host for", () => {
  const runtime = () =>
    createBoardRuntime(PARAMS, { store: createBoardStore(new Y.Doc()), host: {} });

  it("are all answered at once while none was asked for", async () => {
    const { entries, note } = journal();
    void runtime().editorsAnswered().then(note("answered"));
    await drained();
    expect(entries).toEqual(["answered"]);
  });

  it("are answered once the last of them was dealt with, whatever the order", async () => {
    const board = runtime();
    const first = board.askEditor();
    const second = board.askEditor();
    const { entries, note } = journal();
    void board.editorsAnswered().then(note("answered"));

    second();
    await drained();
    expect(entries).toEqual([]);
    first();
    await drained();
    expect(entries).toEqual(["answered"]);
  });

  it("count an answer that is given twice once", async () => {
    const board = runtime();
    const first = board.askEditor();
    const second = board.askEditor();
    const { entries, note } = journal();
    void board.editorsAnswered().then(note("answered"));

    first();
    first();
    await drained();
    expect(entries).toEqual([]);
    second();
    await drained();
    expect(entries).toEqual(["answered"]);
  });

  it("tell every waiter, also one that came while an answer was still out", async () => {
    const board = runtime();
    const { entries, note } = journal();
    void board.editorsAnswered().then(note("before"));
    const answered = board.askEditor();
    void board.editorsAnswered().then(note("while out"));

    await drained();
    expect(entries).toEqual(["before"]);
    answered();
    await drained();
    expect(entries).toEqual(["before", "while out"]);
  });
});
