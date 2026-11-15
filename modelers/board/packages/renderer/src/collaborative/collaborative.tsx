/**
 * The board as a MODULE a host mounts. `createCollaborativeModeler()` gives the React Flow board
 * under the contract every Miragon modeler implements (@miragon/modeler-api: text in, text out, a
 * change event, view state), so a host that holds the board file as text drives it like any other
 * modeler: a VS Code custom editor, the suite's web app, designIQ's text lane. The laws are the
 * contract's (L1 to L7); module/kit-main.ts runs the contract's own conformance kit against this.
 *
 * What the host brings: the files a board links, with their live text (`host`). What the board
 * owns: its document, its history and its view.
 */
import { MODELER_API_VERSION } from "@miragon/modeler-api";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";

import type { BoardArming } from "../arming/arming-api.js";
import { Board } from "../canvas/board.js";
import { setBoardEnded } from "../gestures/images.js";
import { createBoardRuntime, type HeldMoves } from "../runtime/board-context.js";
import type { BoardOptions } from "../runtime/options.js";
import { BOARD_AMEND, BOARD_LOCAL, boardText, createBoardStore } from "../store/board-store.js";
import { type BoardModelerOptions, type CollaborativeBoard, NOTATION } from "./api.js";
import { createElementsSurface } from "./elements.js";
import { createImportQueue } from "./imports.js";
import { registerBoardRuntime } from "./internals.js";
import { createSelectionMirror } from "./selection.js";
import { asViewport, type BoardSession, createViewControl } from "./view.js";

/** an embedded board: overlay with the product's editors, the final arm rules, the view the module sets */
const PARAMS: BoardOptions = {
  viewport: { x: 0, y: 0, zoom: 1 },
  arm: null,
  armzoom: null,
  armedzoom: null,
  armreturn: null,
  armmotion: null,
};

/**
 * A board as a collaborative modeler: the editing mount. `meta` is
 * `{ notation: NOTATION, apiVersion: MODELER_API_VERSION, editable: true }`.
 *
 * Text in, text out. `importText` reads a board file strictly and refuses what it could not
 * write back (L7), reconciles it into the live document without a change event (L1), empties
 * the history (L4) and resolves once the canvas has drawn it. Imports run one after another in
 * call order, each in a microtask of its own, so one called from a listener waits for the
 * command that called the listener. An accepted import gives up a move by the arrow keys that
 * still waits to be written, and leaves the view alone while a model is armed or the board moves
 * to arm one. `onContentChanged` reports this board's own gestures, its undo and its redo and
 * its amends (a model's path that follows a rename), and nothing else. View state is
 * `{ x, y, zoom }` (a `Viewport`), the zoom held between 0.1 and 4.
 *
 * `destroy()` stops every delivery at once, gives up an image that is still read or stored,
 * writes a move by the arrow keys that still waits into the document, and unmounts the canvas a
 * microtask later: a host may call it from a listener that a React event handler is still
 * running.
 *
 * Not offered yet: a viewer mount, `interaction`, `appearance`, an image export and a text merge.
 */
export function createCollaborativeModeler(options: BoardModelerOptions = {}): CollaborativeBoard {
  const doc = options.liveDocument ?? new Y.Doc();
  const store = createBoardStore(doc);
  const session: BoardSession = {
    flow: null,
    view: { x: 0, y: 0, zoom: 1 },
    host: null,
    element: null,
    root: null,
    destroyed: false,
    lastText: "",
  };
  /** the view a board starts with: still this object until an import or the host sets one */
  const firstView = session.view;
  let settleMounted!: () => void;
  const mounted = new Promise<void>((resolve) => {
    settleMounted = resolve;
  });
  let settleGone!: () => void;
  const gone = new Promise<void>((resolve) => {
    settleGone = resolve;
  });
  /** what the canvas hands in while it is mounted: the arm rules at work, the moves it holds back */
  let arming: BoardArming | null = null;
  let held: HeldMoves | null = null;

  const mirror = createSelectionMirror(session, store);

  const runtime = createBoardRuntime(PARAMS, {
    store,
    host: options.host ?? {},
    // a host that owns the document's history (VS Code) passes false, and the keys reach it
    undoRedoKeys: options.undoRedoKeys !== false,
    onFlow(instance) {
      if (!instance) {
        if (session.flow) session.view = session.flow.getViewport();
        session.flow = null;
        return;
      }
      session.flow = instance;
      // what an import's fit or the host asked for before the canvas existed
      void instance.setViewport(session.view);
      settleMounted();
    },
    onSelection: (ids) => void (session.destroyed || mirror.setSelection(ids)),
    onArming: (next) => void (arming = next),
    onHeldMoves: (next) => void (held = next),
  });
  // an import that waits for the canvas stops waiting when the board goes
  const view = createViewControl(session, store, options, Promise.race([mounted, gone]));

  // ── the document's change event (L3): this board's own gestures, its history and its amends, nothing else ──
  const listeners = new Set<() => void>();
  session.lastText = boardText(doc);
  /** a shared document that had no node when the canvas was attached: its first fit is still to come */
  let unfitted = false;
  const onTransaction = (transaction: Y.Transaction): void => {
    if (session.destroyed) return;
    const { origin } = transaction;
    const own = origin === BOARD_LOCAL || origin === store.undo || origin === BOARD_AMEND;
    if (unfitted && (session.view !== firstView || view.contentBounds())) {
      // Once, with the first node, unless the host or an import chose a view meanwhile. A node
      // this board's own gesture made stands where the person put it: no fit moves it
      unfitted = false;
      if (!own && session.view === firstView) view.setView(view.fitted());
    }
    if (!own) {
      // a peer's change of a shared document, or an import: no event, and the next gesture is
      // compared with the text as it is now
      session.lastText = boardText(doc);
      return;
    }
    // a gesture writes its attributes changed or not (board-doc.ts): one that left the text as it was is no change
    const text = boardText(doc);
    if (text === session.lastText) return;
    session.lastText = text;
    for (const listener of [...listeners]) {
      // a listener may destroy the board
      if (session.destroyed) return;
      // or take a later one off, which is then not called either (contract 1.6)
      if (!listeners.has(listener)) continue;
      listener();
    }
  };
  doc.on("afterTransaction", onTransaction);

  const importText = createImportQueue(session, store, options, view, {
    dropHeld: () => held?.drop(),
    // a node the import took away is edited no longer: isModel asks the document as it is now
    editsModel: () =>
      [runtime.armedId(), arming?.state().target].some(
        (id) => typeof id === "string" && runtime.isModel(id),
      ),
  });
  const elements = createElementsSurface(session, store, mirror, view);

  const modeler: CollaborativeBoard = {
    meta: { notation: NOTATION, apiVersion: MODELER_API_VERSION, editable: true },

    attachTo(target) {
      if (session.destroyed || session.root) return;
      session.host = target;
      // a shared document has its content before any import: fitted once, here, unless an import
      // or the host chose a view before. One that has no node yet (a provider hands its document
      // out before its first sync) is fitted when the first one arrives
      if (options.liveDocument && options.fitOnImport !== false && session.view === firstView) {
        if (view.contentBounds()) session.view = view.fitted();
        else unfitted = true;
      }
      session.element = document.createElement("div");
      session.element.className = "board-module";
      session.element.style.cssText = "width:100%;height:100%";
      target.appendChild(session.element);
      session.root = createRoot(session.element);
      session.root.render(<Board runtime={runtime} />);
    },

    importText,

    exportText: () => boardText(doc),

    onContentChanged(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    getViewState: () => (session.flow ? session.flow.getViewport() : { ...session.view }),
    setViewState(state) {
      const next = asViewport(state);
      if (next && !session.destroyed) view.setView(next);
    },

    contentBounds: view.contentBounds,
    elements,

    destroy() {
      if (session.destroyed) return;
      session.destroyed = true;
      listeners.clear();
      mirror.selectionListeners.clear();
      doc.off("afterTransaction", onTransaction);
      settleGone();
      // an image that is still read or stored is given up: it writes no node behind the board
      setBoardEnded(store);
      if (session.flow) session.view = session.flow.getViewport();
      const [mountedRoot, mountedElement] = [session.root, session.element];
      session.root = null;
      // not inside React's own work: a host may call this from a change listener that a React
      // event handler is still running
      queueMicrotask(() => {
        mountedRoot?.unmount();
        mountedElement?.remove();
        store.destroy();
        // a document the host handed in is the host's, and other people may still share it
        if (!options.liveDocument) doc.destroy();
      });
      // What the person moved is theirs: it reaches the document before the board goes, and no
      // listener is left to hear of it. Last and caught, since a shared document has observers
      // of the host's: one that throws at this write does not keep the board from going
      try {
        held?.write();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[board]", `the last write of a destroyed board failed: ${message}`, error);
      }
    },

    board: {
      store,
      undo: () => void store.undo.undo(),
      redo: () => void store.undo.redo(),
      mounted,
    },
  };
  registerBoardRuntime(modeler, runtime);
  return modeler;
}
