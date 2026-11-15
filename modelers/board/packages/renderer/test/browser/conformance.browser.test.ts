/**
 * The contract's conformance kit (@miragon/modeler-api) bound to the board's factory, twice: on a
 * board that keeps a document of its own, and on one that works on a live document of the host
 * (the option `liveDocument`), which a second document mirrors as a sync provider would.
 *
 * The suite's rule is zero skips: a renderer's test passes an `onSkip` that throws for every one.
 * The board deviates with the seven skips pinned in EXPECTED_SKIPS, each a case that needs
 * something the board does not have yet. Each is pinned with the reason the kit gives, word for
 * word: a case that newly leaves a part unverified changes its reason and not its name. The list
 * is checked in both directions: a skip that is not on it, or one with another reason, fails its
 * case, and a listed case that stops skipping fails the file until its name is taken off. The
 * list may only shrink: never add a name to make a run pass. The list is compared whole, so a
 * run of some cases only (`-t`) fails at its end.
 *
 * What each entry waits for:
 * - "L1 (recommended, 1.5)" and "drag start (recommended, 1.6)": the harness hook `startGesture`,
 *   a gesture a harness can hold and cancel.
 * - "drop (recommended, 1.6)": the same hook. The board meets the case itself: the last block of
 *   this file runs it alone, with a drag of a node that is held and dropped. It stays on the list
 *   because the kit has one `startGesture` for all three cases, and a hook that holds a move
 *   would switch on the other two, which the board does not meet.
 * - "destroy from a listener (recommended, 1.6)": the gesture hooks, for the legs it cannot check
 *   without them. One of them, a listener that an earlier listener of the same delivery
 *   unsubscribed, is checked in contract-edges.browser.test.ts instead.
 * - "interaction (when present, 1.5)": the `interaction` surface.
 * - "viewer (when shipped)": a viewer mount (the harness hook `createReadonly`).
 * - "appearance (when present, 1.5)": the `appearance` surface.
 *
 * Left unfilled on purpose, because the board lacks what they drive: `createReadonly`,
 * `startGesture`, `armTool` and `exportImage`. `probeTexts` and `settle` keep the kit's defaults.
 * One macrotask is enough for `settle` here: the one input the board writes later than it
 * happens is a move by the arrow keys on a focused node (400 ms after the last key), and the kit
 * presses its arrow keys on the pane, where they move nothing. That move under an import and
 * under a destroy is driven in contract-edges.browser.test.ts.
 */
import type { CollaborativeModeler } from "@miragon/modeler-api";
import {
  attachedHost,
  conformanceCases,
  type ConformanceHarness,
  type HeldGesture,
  registerConformance,
} from "@miragon/modeler-api/conformance";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import * as Y from "yjs";

import {
  addNode,
  boardText,
  type CollaborativeBoard,
  createCollaborativeModeler,
  NEW_NODE,
  writeDrop,
} from "../../src/index.js";
import {
  BOARD_A,
  BOARD_B,
  BOARD_EMPTY,
  BOARD_PROTO,
  FOREIGN,
  FOREIGN_MUST_SURVIVE,
  INVALID,
  LOOSE_A,
} from "../support/board-texts.js";
import { createTestHost } from "../support/test-host.js";

const DROP_CASE = "drop (recommended, 1.6)";

/** the cases the board may skip, by their name up to its first colon, each with the kit's own reason */
const EXPECTED_SKIPS: Readonly<Record<string, string>> = {
  "L1 (recommended, 1.5)":
    "startGesture is undefined — that an import cancels a running gesture (L1, RECOMMENDED since 1.5) was not checked",
  [DROP_CASE]:
    "startGesture is undefined — that an import from the change listener of a drop waits until the drop has ended (RECOMMENDED since 1.6) was not checked",
  "drag start (recommended, 1.6)":
    "startGesture is undefined — that an import from the selection listener at a drag's start runs once the drag has started and then ends it (RECOMMENDED since 1.6) was not checked",
  "interaction (when present, 1.5)":
    "the modeler exposes no interaction surface (optional, 1.5) — nothing to verify",
  "destroy from a listener (recommended, 1.6)":
    "startGesture is undefined — that a host may destroy the modeler from a listener while the user's input runs or inside an import that ends a held gesture, and that a listener unsubscribed during a delivery is not called (RECOMMENDED since 1.6), was not checked",
  "viewer (when shipped)": "createReadonly is undefined — the package ships no viewer mount",
  "appearance (when present, 1.5)":
    "the modeler exposes no appearance surface (optional, 1.5) — nothing to verify",
};
/**
 * What a board on a live document may skip: the same seven today, since the hooks are the same.
 * A list of its own, so that a case one of the two stops skipping leaves the other's pin alone.
 */
const EXPECTED_SKIPS_LIVE: Readonly<Record<string, string>> = { ...EXPECTED_SKIPS };

const boardOf = (modeler: CollaborativeModeler): CollaborativeBoard["board"] =>
  (modeler as CollaborativeBoard).board;

/** the element each board was attached to: the interactions below are found in its DOM */
const hosts = new WeakMap<CollaborativeModeler, HTMLElement>();
/** every element a case attached a board to, until the case is over */
const attached: HTMLElement[] = [];
/** every live document a case handed a board, with the document that mirrors it */
const shared: Array<{ doc: Y.Doc; mirror: Y.Doc }> = [];

afterEach(() => {
  for (const host of attached.splice(0)) host.parentElement?.remove();
  // whatever the case did to the host's document reached whoever shares it
  for (const { doc, mirror } of shared.splice(0)) expect(boardText(mirror)).toBe(boardText(doc));
});

/** every mutate adds a note with a text of its own, across instances */
let notes = 0;

const EDITED_NOTE = "n_note_b";
const TYPED = "Typed by the kit";
const noteEditor = (modeler: CollaborativeModeler): HTMLTextAreaElement | null =>
  hosts.get(modeler)?.querySelector<HTMLTextAreaElement>("textarea.board-text__editor") ?? null;

/**
 * An import does not wait for the lazily loaded parts of the canvas, so the harness does: as long
 * as mountBoard, since the first case that asks waits for the same first load from the dev server.
 */
const waitFor = async <T>(read: () => T | null | undefined, what: string): Promise<T> => {
  const started = performance.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (performance.now() - started > 10_000) throw new Error(`${what} did not appear within 10 s`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

/** one step of a held pan in screen px: past the distance up to which a press is still a click */
const PAN_STEP = 40;

/** a point of the pane with nothing of the board over it: where a person presses to pan */
const barePoint = (pane: Element): { x: number; y: number } => {
  const box = pane.getBoundingClientRect();
  for (let y = box.bottom - 12; y > box.top; y -= 24) {
    for (let x = box.left + 12; x < box.right; x += 24) {
      if (document.elementFromPoint(x, y) === pane) return { x, y };
    }
  }
  throw new Error("the pane has no bare point to press on");
};

// React Flow pans with d3-zoom, which binds the move and the release on the event's view
const mouse = (target: EventTarget, type: string, x: number, y: number): void => {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }),
  );
};

/** attached to a host element of the kit, with its canvas there */
async function mount(modeler: CollaborativeBoard): Promise<CollaborativeBoard> {
  const host = attachedHost();
  hosts.set(modeler, host);
  attached.push(host);
  modeler.attachTo(host);
  await modeler.board.mounted;
  return modeler;
}

const harness: ConformanceHarness = {
  create: () => mount(createCollaborativeModeler({ host: createTestHost() })),
  // the element that takes the board's keys: the pane that holds the nodes (board.tsx). It is a
  // div, which the kit's own search (a focusable svg) cannot find
  canvasElement: (modeler) => hosts.get(modeler)?.querySelector(".react-flow__pane"),
  // A first and B second: the drop case below imports these two and drags a note of board A
  canonicalTexts: [BOARD_A, BOARD_B, BOARD_EMPTY, BOARD_PROTO],
  looseTexts: [LOOSE_A, ""],
  invalidTexts: [...INVALID],
  foreignTexts: [{ text: FOREIGN, mustSurvive: [...FOREIGN_MUST_SURVIVE] }],
  viewState: { x: -150, y: 60, zoom: 0.5 },
  // The action the toolbar's Text button runs, called on the store, as moveElement below is: one
  // gesture, one entry of the history. The kit proves the document and the change event with
  // them, not that a click on the toolbar or a drag reaches the store: that is under the tests of
  // canvas-behaviour.browser.test.tsx
  mutate(modeler) {
    notes++;
    addNode(
      boardOf(modeler).store,
      { type: "text", text: `Kit note ${notes}`, ...NEW_NODE.text },
      { x: 1200 + notes * 24, y: 700 + notes * 16 },
    );
  },
  // the board has no setting outside its elements yet: the title of the header has no control.
  // So the kit's case for a change of the configuration loops over nothing: it passes and
  // verifies nothing
  configMutations: [],
  undo: (modeler) => boardOf(modeler).undo(),
  redo: (modeler) => boardOf(modeler).redo(),
  // what the end of a node drag writes: the note beside the group of board A, to a free place
  moveElement(modeler) {
    const { store } = boardOf(modeler);
    const note = store.getSnapshot().nodes.find((node) => node.id === "n_note_b");
    if (!note) throw new Error("board A has no n_note_b");
    writeDrop(store, { [note.id]: { x: note.attrs.x + 120, y: note.attrs.y + 240 } });
    return note.id;
  },
  // the board's own interaction: a note's editor, opened by a double-click, with input that is not committed
  async openInteraction(modeler) {
    const selector = `.react-flow__node[data-id="${EDITED_NOTE}"] .board-text`;
    const note = await waitFor(
      () => hosts.get(modeler)?.querySelector(selector),
      "the note of board A",
    );
    note.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }),
    );
    const area = await waitFor(() => noteEditor(modeler), "the note's editor");
    // as typing does: the element's own value, then the input event
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, TYPED);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  },
  interactionState(modeler) {
    const area = noteEditor(modeler);
    const elementId = area?.closest(".react-flow__node")?.getAttribute("data-id");
    return area && elementId ? { elementId, text: area.value } : undefined;
  },
  // leaving the editor commits (text-node.tsx): a blur where it has the focus, the event itself where it has not
  commitInteraction(modeler) {
    const area = noteEditor(modeler);
    if (!area) throw new Error("no note editor is open");
    if (document.activeElement === area) area.blur();
    else area.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  },
  // a pan as a person makes it: a press on the bare pane, held and moved one step at a time
  startPan(modeler) {
    const pane = hosts.get(modeler)?.querySelector(".react-flow__pane");
    if (!pane) throw new Error("the board has no pane");
    const start = barePoint(pane);
    let steps = 0;
    const move = (): void => {
      steps++;
      mouse(window, "mousemove", start.x + steps * PAN_STEP, start.y);
    };
    mouse(pane, "mousedown", start.x, start.y);
    move();
    return { move, drop: () => mouse(window, "mouseup", start.x + steps * PAN_STEP, start.y) };
  },
};

/** a board on a document of the host's, which a second document mirrors update by update */
const liveHarness: ConformanceHarness = {
  ...harness,
  create() {
    const doc = new Y.Doc();
    const mirror = new Y.Doc();
    doc.on("update", (update: Uint8Array) => Y.applyUpdate(mirror, update, "sync"));
    shared.push({ doc, mirror });
    return mount(createCollaborativeModeler({ host: createTestHost(), liveDocument: doc }));
  },
};

/** the kit's cases as tests of the current block, held against the skips that block may have */
function bindKit(bound: ConformanceHarness, expected: Readonly<Record<string, string>>): void {
  const skipped: Record<string, string> = {};
  registerConformance(bound, test, {
    onSkip(caseName, reason) {
      const colon = caseName.indexOf(":");
      const key = colon === -1 ? caseName : caseName.slice(0, colon);
      if (expected[key] !== reason) {
        throw new Error(
          `conformance case skipped: "${caseName}": ${reason}` +
            (key in expected ? `\nthe reason pinned for it: ${expected[key]}` : ""),
        );
      }
      skipped[key] = reason;
    },
    // the board follows every recommendation the kit checks on it: an advisory is a regression
    onAdvisory(caseName, advice) {
      throw new Error(`conformance advisory: "${caseName}": ${advice}`);
    },
  });

  // a listed case that no longer skips fails here until its name is taken off the list
  afterAll(() => {
    expect(skipped).toEqual(expected);
  });
}

describe("the board implements the collaborative-modeler contract", () => {
  bindKit(harness, EXPECTED_SKIPS);
});

describe("a board on a live document of the host implements it too", () => {
  bindKit(liveHarness, EXPECTED_SKIPS_LIVE);
});

describe("the kit's drop case, which the registered kit skips", () => {
  /** a drag of the note beside the group of board A, held past the threshold as a person holds it */
  const holdMove: NonNullable<ConformanceHarness["startGesture"]> = async (modeler, kind) => {
    if (kind !== "move") throw new Error(`the board has no "${kind}" gesture to hold`);
    const host = hosts.get(modeler);
    const note = await waitFor(
      () => host?.querySelector<HTMLElement>(`.react-flow__node[data-id="${EDITED_NOTE}"]`),
      "the note of board A",
    );
    // React Flow drags a node from its measured box, and draws an arrow only between measured nodes
    await waitFor(() => host?.querySelector(".react-flow__edge"), "the arrow of board A");
    const box = note.getBoundingClientRect();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    mouse(note, "mousedown", x, y);
    mouse(window, "mousemove", x + 20, y + 30);
    mouse(window, "mousemove", x + 40, y + 60);
    const held: HeldGesture = {
      drop: () => mouse(window, "mouseup", x + 40, y + 60),
      cancel() {
        throw new Error("the board cannot cancel a drag");
      },
    };
    return held;
  };

  /**
   * Two frames and 30 ms, as mountBoard's settle(). The case reveals the group of board A and
   * starts to listen for window errors right after its settle, and that reveal brings Chromium's
   * "ResizeObserver loop completed with undelivered notifications" with the next frame in most
   * runs (the board's guide has the line under Tests). One macrotask, the kit's default, ended a
   * millisecond after that frame in every run measured here, which is no margin to rest a test on.
   */
  const pastTheNextFrames = async (): Promise<void> => {
    for (let frame = 0; frame < 2; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  };

  test(`${DROP_CASE}: an import from the change listener of a drop waits until the drop has ended`, async () => {
    const drop = conformanceCases().find((one) => one.name.startsWith(`${DROP_CASE}:`));
    if (!drop) throw new Error(`the kit has no case "${DROP_CASE}"`);
    const outcome = await drop.run({
      ...harness,
      startGesture: holdMove,
      settle: pastTheNextFrames,
    });
    expect(outcome?.skipped).toBeUndefined();
    expect(outcome?.advisories ?? []).toEqual([]);
  });
});
