/**
 * The contract's conformance kit (@miragon/modeler-api) bound to the board's factory.
 *
 * The suite's rule is zero skips: a renderer's test passes an `onSkip` that throws for every one.
 * The board deviates with the seven skips pinned in EXPECTED_SKIPS, each a case that needs
 * something the board does not have yet. The list is checked in both directions: a skip that is
 * not on it fails its case, and a listed case that stops skipping fails the file until its name is
 * taken off. The list may only shrink: never add a name to make a run pass. The list is compared
 * whole, so a run of some cases only (`-t`) fails at its end.
 *
 * What each entry waits for:
 * - "L1 (recommended, 1.5)", "drop (recommended, 1.6)" and "drag start (recommended, 1.6)": the
 *   harness hook `startGesture`, a gesture a harness can hold and cancel.
 * - "destroy from a listener (recommended, 1.6)": the gesture hooks, for the legs it cannot check
 *   without them.
 * - "interaction (when present, 1.5)": the `interaction` surface.
 * - "viewer (when shipped)": a viewer mount (the harness hook `createReadonly`).
 * - "appearance (when present, 1.5)": the `appearance` surface.
 *
 * Left unfilled on purpose, because the board lacks what they drive: `createReadonly`,
 * `startGesture`, `armTool` and `exportImage`. `probeTexts` and `settle` keep the kit's defaults.
 */
import type { CollaborativeModeler } from "@miragon/modeler-api";
import {
  attachedHost,
  type ConformanceHarness,
  registerConformance,
} from "@miragon/modeler-api/conformance";
import { afterAll, afterEach, describe, expect, test } from "vitest";

import {
  addNode,
  type CollaborativeBoard,
  createCollaborativeModeler,
  NEW_NODE,
  writeDrop,
} from "../../src/index.js";
import {
  BOARD_A,
  BOARD_B,
  BOARD_EMPTY,
  FOREIGN,
  FOREIGN_MUST_SURVIVE,
  INVALID,
  LOOSE_A,
} from "../support/board-texts.js";
import { createTestHost } from "../support/test-host.js";

/** the cases the board may skip, by their name up to its first colon */
const EXPECTED_SKIPS: readonly string[] = [
  "L1 (recommended, 1.5)",
  "drop (recommended, 1.6)",
  "drag start (recommended, 1.6)",
  "interaction (when present, 1.5)",
  "destroy from a listener (recommended, 1.6)",
  "viewer (when shipped)",
  "appearance (when present, 1.5)",
];

const boardOf = (modeler: CollaborativeModeler): CollaborativeBoard["board"] =>
  (modeler as CollaborativeBoard).board;

/** the element each board was attached to: the interactions below are found in its DOM */
const hosts = new WeakMap<CollaborativeModeler, HTMLElement>();
/** every element a case attached a board to, until the case is over */
const attached: HTMLElement[] = [];

afterEach(() => {
  for (const host of attached.splice(0)) host.parentElement?.remove();
});

/** every mutate adds a note with a text of its own, across instances */
let notes = 0;

const EDITED_NOTE = "n_note_b";
const TYPED = "Typed by the kit";
const noteEditor = (modeler: CollaborativeModeler): HTMLTextAreaElement | null =>
  hosts.get(modeler)?.querySelector<HTMLTextAreaElement>("textarea.board-text__editor") ?? null;

/** an import does not wait for the lazily loaded parts of the canvas, so the harness does */
const waitFor = async <T>(read: () => T | null | undefined, what: string): Promise<T> => {
  const started = performance.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (performance.now() - started > 3000) throw new Error(`${what} did not appear within 3 s`);
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

const harness: ConformanceHarness = {
  async create() {
    const modeler = createCollaborativeModeler({ host: createTestHost() });
    const host = attachedHost();
    hosts.set(modeler, host);
    attached.push(host);
    modeler.attachTo(host);
    await modeler.board.mounted;
    return modeler;
  },
  // the element that takes the board's keys: the pane that holds the nodes (board.tsx). It is a
  // div, which the kit's own search (a focusable svg) cannot find
  canvasElement: (modeler) => hosts.get(modeler)?.querySelector(".react-flow__pane"),
  canonicalTexts: [BOARD_A, BOARD_B, BOARD_EMPTY],
  looseTexts: [LOOSE_A, ""],
  invalidTexts: [...INVALID],
  foreignTexts: [{ text: FOREIGN, mustSurvive: [...FOREIGN_MUST_SURVIVE] }],
  viewState: { x: -150, y: 60, zoom: 0.5 },
  // the toolbar's own add action: one gesture, one entry of the history
  mutate(modeler) {
    notes++;
    addNode(
      boardOf(modeler).store,
      { type: "text", text: `Kit note ${notes}`, ...NEW_NODE.text },
      { x: 1200 + notes * 24, y: 700 + notes * 16 },
    );
  },
  // the board has no setting outside its elements yet: the title of the header has no control
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

const skipped: string[] = [];

describe("the board implements the collaborative-modeler contract", () => {
  registerConformance(harness, test, {
    onSkip(caseName, reason) {
      const colon = caseName.indexOf(":");
      const key = colon === -1 ? caseName : caseName.slice(0, colon);
      if (!EXPECTED_SKIPS.includes(key)) {
        throw new Error(`conformance case skipped: "${caseName}": ${reason}`);
      }
      skipped.push(key);
    },
    // the board follows every recommendation the kit checks on it: an advisory is a regression
    onAdvisory(caseName, advice) {
      throw new Error(`conformance advisory: "${caseName}": ${advice}`);
    },
  });

  // a listed case that no longer skips fails here until its name is taken off the list
  afterAll(() => {
    expect([...skipped].sort()).toEqual([...EXPECTED_SKIPS].sort());
  });
});
