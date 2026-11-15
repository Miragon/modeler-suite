/**
 * The option `liveDocument`: a board on a document the host shares with other people. The board
 * shows it without an import and fits it once (a document that is still empty when its first
 * node arrives), draws a peer's change without reporting one, imports into it, and leaves it
 * alone when it is destroyed.
 */
import { attachedHost } from "@miragon/modeler-api/conformance";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  addNode,
  type BoardModelerOptions,
  boardText,
  type CollaborativeBoard,
  createBoardDoc,
  createBoardStore,
  createCollaborativeModeler,
  ELEMENTS_KEY,
  NEW_NODE,
  writeDrop,
} from "../../src/index.js";
import { BOARD_A, BOARD_B, BOARD_EMPTY } from "../support/board-texts.js";
import { mountBoard } from "../support/mount-board.js";

interface LiveBoard {
  readonly modeler: CollaborativeBoard;
  /** the element the board was attached to */
  readonly element: HTMLElement;
  /** how often onContentChanged was called since the board was made */
  changes(): number;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** a board on `doc`, attached and mounted, with no import; `first` runs before it is attached */
async function mountLive(
  doc: Y.Doc,
  options: BoardModelerOptions = {},
  first?: (modeler: CollaborativeBoard) => void,
): Promise<LiveBoard> {
  const element = attachedHost();
  const modeler = createCollaborativeModeler({ ...options, liveDocument: doc });
  cleanups.push(() => {
    modeler.destroy();
    element.parentElement?.remove();
  });
  let changes = 0;
  modeler.onContentChanged(() => changes++);
  first?.(modeler);
  modeler.attachTo(element);
  await modeler.board.mounted;
  return { modeler, element, changes: () => changes };
}

/** a board that keeps a document of its own, filled by an import */
async function mountOwn(text: string): Promise<CollaborativeBoard> {
  const board = await mountBoard(text);
  cleanups.push(board.destroy);
  return board.modeler;
}

const shownNodes = (element: HTMLElement): string[] =>
  [...element.querySelectorAll(".react-flow__node")]
    .map((node) => node.getAttribute("data-id") ?? "")
    .sort();

/** a change as a sync provider applies it: a transaction that is not this board's own */
function asPeer(doc: Y.Doc, id: string, attrs: Record<string, unknown>): void {
  doc.transact(() => {
    const element = doc.getMap(ELEMENTS_KEY).get(id);
    if (!(element instanceof Y.Map)) throw new Error(`the document has no element ${id}`);
    for (const [key, value] of Object.entries(attrs)) element.set(key, value);
  }, "peer");
}

const microtask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

/** the canvas draws a change of the document some commits later, and slower on a busy machine */
const SOON = { timeout: 5000 };

describe("a board on a live document of the host", () => {
  it("shows the document without an import, fitted as an import fits it", async () => {
    const live = await mountLive(createBoardDoc(BOARD_A));
    await expect
      .poll(() => shownNodes(live.element), SOON)
      .toEqual(["n_group", "n_note_a", "n_note_b"]);

    const own = await mountOwn(BOARD_A);
    const fitted = own.getViewState();
    expect(fitted).not.toEqual({ x: 0, y: 0, zoom: 1 });
    expect(live.modeler.getViewState()).toEqual(fitted);
    expect(live.modeler.exportText()).toBe(BOARD_A);
    expect(live.changes()).toBe(0);
  });

  it("does not fit a document for a host that fits itself or that set a view before", async () => {
    const unfitted = await mountLive(createBoardDoc(BOARD_A), { fitOnImport: false });
    expect(unfitted.modeler.getViewState()).toEqual({ x: 0, y: 0, zoom: 1 });

    const chosen = { x: -150, y: 60, zoom: 0.5 };
    const viewed = await mountLive(createBoardDoc(BOARD_A), {}, (modeler) =>
      modeler.setViewState(chosen),
    );
    expect(viewed.modeler.getViewState()).toEqual(chosen);
  });

  /** board A as a provider's first sync brings it: one update, not this board's own */
  const syncBoardA = (doc: Y.Doc): void =>
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(createBoardDoc(BOARD_A)), "peer");
  const PLAIN = { x: 0, y: 0, zoom: 1 };

  it("fits a document that was empty at the attach once a peer gives it its first node", async () => {
    const doc = new Y.Doc();
    const live = await mountLive(doc);
    expect(live.modeler.getViewState()).toEqual(PLAIN);

    syncBoardA(doc);
    const fitted = (await mountOwn(BOARD_A)).getViewState();
    expect(fitted).not.toEqual(PLAIN);
    expect(live.modeler.getViewState()).toEqual(fitted);
    expect(live.modeler.exportText()).toBe(BOARD_A);
    expect(live.changes()).toBe(0);
    await expect
      .poll(() => shownNodes(live.element), SOON)
      .toEqual(["n_group", "n_note_a", "n_note_b"]);

    // once: what a peer changes afterwards moves no view
    asPeer(doc, "n_note_b", { x: 4000 });
    expect(live.modeler.getViewState()).toEqual(fitted);
  });

  it("fits it too when the first node arrives before the canvas is there", async () => {
    const doc = new Y.Doc();
    const element = attachedHost();
    const modeler = createCollaborativeModeler({ liveDocument: doc });
    cleanups.push(() => {
      modeler.destroy();
      element.parentElement?.remove();
    });
    modeler.attachTo(element);
    syncBoardA(doc);
    await modeler.board.mounted;
    expect(modeler.getViewState()).toEqual((await mountOwn(BOARD_A)).getViewState());
  });

  it("does not fit it late for a host that fits itself, set a view or imported meanwhile", async () => {
    const unfitted = await mountLive(new Y.Doc(), { fitOnImport: false });
    syncBoardA(unfitted.modeler.board.store.doc);
    expect(unfitted.modeler.getViewState()).toEqual(PLAIN);

    const chosen = { x: -150, y: 60, zoom: 0.5 };
    const viewed = await mountLive(new Y.Doc());
    viewed.modeler.setViewState(chosen);
    syncBoardA(viewed.modeler.board.store.doc);
    expect(viewed.modeler.getViewState()).toEqual(chosen);

    const imported = await mountLive(new Y.Doc());
    await imported.modeler.importText(BOARD_EMPTY);
    syncBoardA(imported.modeler.board.store.doc);
    expect(imported.modeler.getViewState()).toEqual(PLAIN);
  });

  it("does not fit it for a first node this board's own gesture made, nor for what follows", async () => {
    const doc = new Y.Doc();
    const live = await mountLive(doc);
    addNode(
      live.modeler.board.store,
      { type: "text", text: "Mine", ...NEW_NODE.text },
      { x: 900, y: 700 },
    );
    expect(live.changes()).toBe(1);
    expect(live.modeler.getViewState()).toEqual(PLAIN);

    syncBoardA(doc);
    expect(live.modeler.getViewState()).toEqual(PLAIN);
  });

  it("draws a peer's change and reports none, and reports this board's own gesture", async () => {
    const doc = createBoardDoc(BOARD_A);
    const live = await mountLive(doc);
    const { modeler } = live;
    await expect.poll(() => shownNodes(live.element), SOON).toHaveLength(3);

    // the peer: a document of its own with the same board, whose change arrives as an update
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const peerStore = createBoardStore(peer);
    const theirs = addNode(
      peerStore,
      { type: "text", text: "From a peer", ...NEW_NODE.text },
      { x: 400, y: 700 },
    );
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "peer");
    expect(live.changes()).toBe(0);
    expect(modeler.exportText()).toBe(peerStore.text());
    expect(modeler.exportText()).not.toBe(BOARD_A);
    await expect.poll(() => shownNodes(live.element), SOON).toContain(theirs);
    expect(live.changes()).toBe(0);

    const exported: string[] = [];
    modeler.onContentChanged(() => exported.push(modeler.exportText()));
    const mine = addNode(
      modeler.board.store,
      { type: "text", text: "Mine", ...NEW_NODE.text },
      { x: 900, y: 700 },
    );
    expect(live.changes()).toBe(1);
    // inside the listener the export already held the new node, next to the peer's
    expect(exported).toEqual([boardText(doc)]);
    expect(exported[0]).toContain(`"id":"${mine}"`);
    expect(exported[0]).toContain(`"id":"${theirs}"`);
    await expect.poll(() => shownNodes(live.element), SOON).toContain(mine);
  });

  it("compares a gesture with the text a peer left, not with the one it saw last", async () => {
    const doc = createBoardDoc(BOARD_A);
    const live = await mountLive(doc);
    const { store } = live.modeler.board;

    asPeer(doc, "n_note_b", { x: 900 });
    expect(live.changes()).toBe(0);
    // back to where the note was when this board was made: a change of the document as it stands
    writeDrop(store, { n_note_b: { x: 760, y: 80 } });
    expect(boardText(doc)).toBe(BOARD_A);
    expect(live.changes()).toBe(1);

    asPeer(doc, "n_note_b", { x: 900 });
    // the place the peer gave it already: written again, and no change
    writeDrop(store, { n_note_b: { x: 900, y: 80 } });
    expect(live.changes()).toBe(1);
  });

  it("imports into the document it was given, and only what differs", async () => {
    const doc = createBoardDoc(BOARD_A);
    const live = await mountLive(doc);
    const { modeler } = live;
    expect(modeler.board.store.doc).toBe(doc);
    // whoever shares the document gets an import as updates of it
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    doc.on("update", (update: Uint8Array) => Y.applyUpdate(peer, update));

    const untouched = doc.getMap(ELEMENTS_KEY).get("n_note_a");
    const moved = BOARD_A.replace(`"x":760`, `"x":800`);
    expect(moved).not.toBe(BOARD_A);
    await modeler.importText(moved);
    expect(boardText(doc)).toBe(moved);
    expect(boardText(peer)).toBe(moved);
    expect(doc.getMap(ELEMENTS_KEY).get("n_note_a")).toBe(untouched);

    await modeler.importText(BOARD_B);
    expect(boardText(doc)).toBe(BOARD_B);
    expect(boardText(peer)).toBe(BOARD_B);
    await expect
      .poll(() => shownNodes(live.element), SOON)
      .toEqual(["n_image", "n_order", "n_remark"]);
    expect(live.changes()).toBe(0);
  });

  it("leaves the document to the host when it is destroyed", async () => {
    const doc = createBoardDoc(BOARD_A);
    const live = await mountLive(doc);
    await expect.poll(() => shownNodes(live.element), SOON).toHaveLength(3);

    live.modeler.destroy();
    await microtask();
    // the teardown ran: the canvas is gone
    expect(live.element.querySelector(".board-module")).toBeNull();
    expect(doc.isDestroyed).toBe(false);
    expect(boardText(doc)).toBe(BOARD_A);
    // the host and its peers go on with it, and the board that is gone hears nothing of it
    asPeer(doc, "n_note_b", { x: 900 });
    expect(boardText(doc)).toBe(BOARD_A.replace(`"x":760`, `"x":900`));
    expect(live.changes()).toBe(0);

    // a document of the board's own goes with the board
    const own = await mountOwn(BOARD_A);
    const ownDoc = own.board.store.doc;
    own.destroy();
    await microtask();
    expect(ownDoc.isDestroyed).toBe(true);
  });
});
