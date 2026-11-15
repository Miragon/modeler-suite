/**
 * The board's store: the live document (document.ts) as a canvas reads and writes it. Every
 * finished gesture is ONE transaction that writes the attributes it names, so a peer's change of
 * another element, or of another attribute, stays. The store reads on every change, whatever its
 * origin (this client's gestures, a peer's, an undo, an import), and never writes by itself.
 */
import {
  decodeBoard,
  encodeBoard,
  fractionalIndexBetween,
  projectBoard,
  type BoardSnapshot,
  type BoardView,
  type EdgeAttrs,
  type ElementAttrs,
  type NodeAttrs,
} from "@miragon/board-schema-model";
import * as Y from "yjs";
import { elementsOf, metaOf, readSnapshot, reconcileSnapshot } from "./document.js";

/** origin of this client's board gestures: what the undo manager tracks */
export const BOARD_LOCAL = "board-local";

/** some of an element's attributes; one given as `undefined` is removed from the element */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface BoardTx {
  /** a new element under a collision-safe id (newId) */
  create(id: string, attrs: ElementAttrs): void;
  /** writes every attribute named, changed or not; `undefined` removes one. A no-op on an element that is gone */
  update(id: string, attrs: Patch<NodeAttrs> | Patch<EdgeAttrs>): void;
  remove(id: string): void;
}

export interface BoardStore {
  readonly doc: Y.Doc;
  /** useSyncExternalStore's pair: the view keeps its identity until the document changes */
  subscribe(listener: () => void): () => void;
  getSnapshot(): BoardView;
  /** one gesture, one transaction, origin BOARD_LOCAL */
  gesture(run: (tx: BoardTx) => void): void;
  /** a key above every node's (bring to front, a new node) */
  zOnTop(): string;
  /** the board file as it is at rest */
  text(): string;
  readonly undo: Y.UndoManager;
  destroy(): void;
}

export const newId = (prefix: "n" | "e"): string => `${prefix}_${crypto.randomUUID().slice(0, 13)}`;

/** the board's text at rest: one JSON line per element, sorted by id */
export const boardText = (doc: Y.Doc): string => encodeBoard(readSnapshot(doc));

/** a fresh board document holding `seed`: the one whole-document write a board ever gets */
export function createBoardDoc(seed: BoardSnapshot | string): Y.Doc {
  const doc = new Y.Doc();
  reconcileSnapshot(
    doc,
    typeof seed === "string"
      ? decodeBoard(seed)
      : { elements: { ...seed.elements }, meta: { ...seed.meta } },
  );
  return doc;
}

export function createBoardStore(doc: Y.Doc): BoardStore {
  const elements = elementsOf(doc);
  const meta = metaOf(doc);
  let view = projectBoard(readSnapshot(doc));
  const listeners = new Set<() => void>();
  // every origin: this client's gestures, a peer's, an undo. It reads, and never writes
  const onChange = (): void => {
    view = projectBoard(readSnapshot(doc), view);
    for (const listener of [...listeners]) listener();
  };
  elements.observeDeep(onChange);
  meta.observe(onChange);
  const undo = new Y.UndoManager([elements, meta], {
    trackedOrigins: new Set([BOARD_LOCAL]),
    captureTimeout: 0,
  });
  const tx: BoardTx = {
    create(id, attrs) {
      const element = new Y.Map<unknown>();
      // filled before it is attached: no observer sees a half-written element
      for (const [key, value] of Object.entries(attrs))
        if (value !== undefined) element.set(key, value);
      elements.set(id, element);
    },
    update(id, attrs) {
      // read at write time, never kept: a peer's create of the same id orphans a kept Y.Map (live.ts:17-21)
      const element = elements.get(id);
      if (!(element instanceof Y.Map)) return;
      for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined) element.delete(key);
        else element.set(key, value);
      }
    },
    remove: (id) => elements.delete(id),
  };
  return {
    doc,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    gesture: (run) => doc.transact(() => run(tx), BOARD_LOCAL),
    zOnTop: () =>
      fractionalIndexBetween(
        view.nodes.reduce((top, node) => (node.attrs.z > top ? node.attrs.z : top), ""),
      ),
    text: () => boardText(doc),
    undo,
    destroy() {
      elements.unobserveDeep(onChange);
      meta.unobserve(onChange);
      undo.destroy();
      listeners.clear();
    },
  };
}

/** where a node ended up: a move names its position, a resize its size too */
export interface Geometry {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * The end of a move or a resize, as one gesture. x AND y (and both sizes), changed or not: two
 * peers' concurrent drops then resolve to ONE peer's box, never to a mix of both (sync.md 4.2).
 */
export function writeGeometry(store: BoardStore, boxes: Readonly<Record<string, Geometry>>): void {
  store.gesture((tx) => {
    for (const [id, { x, y, width, height }] of Object.entries(boxes)) {
      tx.update(id, {
        x: Math.round(x),
        y: Math.round(y),
        ...(width !== undefined && height !== undefined
          ? { width: Math.round(width), height: Math.round(height) }
          : {}),
      });
    }
  });
}
