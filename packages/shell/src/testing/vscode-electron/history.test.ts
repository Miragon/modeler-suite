import { describe, expect, it } from "vitest";

import {
  checkHistory,
  replacedEveryId,
  sameView,
  selectionChange,
  type HistoryCheckOptions,
  type HistorySession,
} from "./history.js";
import { platformKeys } from "./launch.js";
import type { CanvasFacts, ViewFacts } from "./webview.js";

const ORIGINAL: CanvasFacts = { shapes: 3, connections: 2, positions: ["0,0", "100,0", "200,0"] };
const EDITED: CanvasFacts = {
  shapes: 4,
  connections: 2,
  positions: ["0,0", "100,0", "200,0", "300,0"],
};
const ORIGINAL_ELEMENTS = ["conn-1", "conn-2", "shape-a", "shape-b", "shape-c"];
const EDITED_ELEMENTS = [...ORIGINAL_ELEMENTS, "shape-d"];

function view(overrides: Partial<ViewFacts> = {}): ViewFacts {
  return {
    scale: 1,
    translateX: 0,
    translateY: 0,
    elements: ORIGINAL_ELEMENTS,
    selected: [],
    ...overrides,
  };
}

const OPTIONS: HistoryCheckOptions = {
  edited: EDITED,
  original: ORIGINAL,
  steps: 1,
  canvasTimeoutMs: 50,
  effectTimeoutMs: 30,
  graceMs: 0,
  intervalMs: 5,
};

interface FakeVsCodeOptions {
  /** Document edits the edit made; the document shows the edit once the redo was pressed that often. */
  steps?: number | undefined;
  /** The import after this key puts the view back to the fit, as a modeler that refits would. */
  refitsAfter?: "redo" | "undo" | undefined;
  /** With `refitsAfter`: the refit comes only after the view was read this many times, so the first reads still match. */
  refitsAfterReads?: number | undefined;
  /** The import after this key drops the selection. */
  dropsSelectionAfter?: "redo" | "undo" | undefined;
  /** Every import gives the elements new ids and the selection is gone, as a modeler that numbers them anew would. */
  replacesIds?: boolean | undefined;
  /** The import after this key keeps the view and selection only after this many reads. */
  restoresAfterReads?: number | undefined;
  /** The redo brings the new element back selected. */
  selectsNewElement?: boolean | undefined;
  /** Chords the webview and VS Code do nothing for. */
  ignored?: readonly string[] | undefined;
  /** Zoom in stops at this scale. */
  maxScale?: number | undefined;
  canvasRefusesFocus?: boolean | undefined;
  /** VS Code still calls the document changed after the undo, until it is saved. */
  staysDirtyAfterUndo?: boolean | undefined;
  /** The redo shows the new element 1 px off, as a document round trip may place it. */
  placesNewElementOffBy?: number | undefined;
  /** The canvas once the edit is back; default `EDITED`. */
  editedCanvas?: CanvasFacts | undefined;
}

/**
 * VS Code with a modeler's webview, as the history step sees it. The zoom keys zoom the canvas,
 * select all selects what is drawn, and the redo and undo keys move through the document's history;
 * each move imports a text into the webview, which keeps the view and the selection of what it still
 * draws, unless an option says the modeler does not.
 */
function fakeVsCode(options: FakeVsCodeOptions = {}) {
  const keys = platformKeys("linux");
  const steps = options.steps ?? 1;
  const fit = 0.62;
  let position = 0;
  let scale = fit;
  let translate = { x: 12, y: -8 };
  let selected: string[] = [];
  let dirty = false;
  let readsSinceImport = Number.POSITIVE_INFINITY;
  let stale: ViewFacts | undefined;
  let readsUntilRefit: number | undefined;
  let generation = 0;
  const pressed: string[] = [];

  const drawn = () =>
    (position === steps ? EDITED_ELEMENTS : ORIGINAL_ELEMENTS).map((id) =>
      generation === 0 ? id : `${id}#${generation}`,
    );

  const current = (): ViewFacts => ({
    scale,
    translateX: translate.x,
    translateY: translate.y,
    elements: [...drawn()],
    selected: [...selected].sort(),
  });

  const importAfter = (key: "redo" | "undo") => {
    const before = current();
    const stillDrawn = new Set(drawn());
    selected = selected.filter((id) => stillDrawn.has(id));
    if (options.dropsSelectionAfter === key) selected = [];
    if (options.replacesIds) {
      generation += 1;
      selected = [];
    }
    if (options.selectsNewElement && key === "redo" && position === steps) selected.push("shape-d");
    if (options.refitsAfter === key && options.refitsAfterReads !== undefined) {
      readsUntilRefit = options.refitsAfterReads;
    } else if (options.refitsAfter === key) {
      scale = fit;
      translate = { x: 0, y: 0 };
    }
    if (options.restoresAfterReads !== undefined) {
      stale = { ...before, scale: fit, translateX: 0, translateY: 0 };
      readsSinceImport = 0;
    }
  };

  const session: HistorySession = {
    keys,
    press: async (chord) => {
      pressed.push(chord);
      if ((options.ignored ?? []).includes(chord)) return;
      if (chord === `${keys.modifier}+Equal`) {
        scale = Math.min(scale * 1.35, options.maxScale ?? 4);
      } else if (chord === `${keys.modifier}+Minus`) {
        scale = scale / 1.35;
      } else if (chord === `${keys.modifier}+KeyA`) {
        selected = [...drawn()];
      } else if (chord === keys.redo && position < steps) {
        position += 1;
        dirty = true;
        importAfter("redo");
      } else if (chord === keys.undo && position > 0) {
        position -= 1;
        dirty = options.staysDirtyAfterUndo === true;
        importAfter("undo");
      } else if (chord === keys.save) {
        dirty = false;
      }
    },
    focusCanvas: async () => !options.canvasRefusesFocus,
    canvas: async () => {
      if (position !== steps) return ORIGINAL;
      const edited = options.editedCanvas ?? EDITED;
      const offBy = options.placesNewElementOffBy ?? 0;
      return offBy === 0
        ? edited
        : { ...edited, positions: [...edited.positions.slice(0, 3), `${300 + offBy},0`] };
    },
    view: async () => {
      if (stale && readsSinceImport < (options.restoresAfterReads ?? 0)) {
        readsSinceImport += 1;
        return stale;
      }
      if (readsUntilRefit === 0) {
        scale = fit;
        translate = { x: 0, y: 0 };
        readsUntilRefit = undefined;
      } else if (readsUntilRefit !== undefined) {
        readsUntilRefit -= 1;
      }
      return current();
    },
    dirty: async () => dirty,
  };
  return { session, pressed };
}

describe("sameView", () => {
  it("allows the rounding of a zoom and of a restored viewbox, no more", () => {
    expect(sameView(view(), view({ scale: 1.0004, translateX: 0.9, translateY: -0.9 }))).toBe(true);
    expect(sameView(view(), view({ scale: 1.002 }))).toBe(false);
    expect(sameView(view(), view({ translateX: 1.5 }))).toBe(false);
    expect(sameView(view(), view({ translateY: -2 }))).toBe(false);
  });
});

describe("selectionChange", () => {
  it("names what a re-import deselected and what it selected", () => {
    const before = view({ selected: ["shape-a", "shape-b", "shape-d"] });
    const after = view({ selected: ["shape-a", "shape-c"] });

    expect(selectionChange(before, after)).toEqual({ lost: ["shape-b"], gained: ["shape-c"] });
  });

  it("does not count an element the import took away", () => {
    const before = view({
      elements: EDITED_ELEMENTS,
      selected: ["shape-a", "shape-d"],
    });
    const after = view({ selected: ["shape-a"] });

    expect(selectionChange(before, after)).toEqual({ lost: [], gained: [] });
  });
});

describe("replacedEveryId", () => {
  it("is true when something was selected and none of it is drawn any more", () => {
    const before = view({ selected: ["shape-a", "shape-b"] });

    expect(replacedEveryId(before, view({ elements: ["shape-a#1", "shape-b#1"] }))).toBe(true);
    expect(replacedEveryId(before, view({ elements: ["shape-b", "shape-d"] }))).toBe(false);
  });

  it("is false for an empty selection, which has no id to follow", () => {
    expect(replacedEveryId(view(), view({ elements: ["shape-a#1"] }))).toBe(false);
  });
});

describe("checkHistory", () => {
  it("passes a webview that keeps the view and the selection across the redo and the undo", async () => {
    const { session, pressed } = fakeVsCode();

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(pressed).toEqual(["Control+Equal", "Control+KeyA", "Control+y", "Control+z"]);
    expect(result).toEqual({
      before: { zoom: 84, selected: 5 },
      afterRedo: { zoom: 84, selected: 5 },
      afterUndo: { zoom: 84, selected: 5 },
    });
  });

  it("presses the redo and the undo key once per document edit of the edit", async () => {
    const { session, pressed } = fakeVsCode({ steps: 3 });

    const { failures } = await checkHistory(session, { ...OPTIONS, steps: 3 });

    expect(failures).toEqual([]);
    expect(pressed.slice(2)).toEqual([
      "Control+y",
      "Control+y",
      "Control+y",
      "Control+z",
      "Control+z",
      "Control+z",
    ]);
  });

  it("zooms out where the canvas does not zoom in any further", async () => {
    const { session, pressed } = fakeVsCode({ maxScale: 0.62 });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(pressed.slice(0, 2)).toEqual(["Control+Equal", "Control+Minus"]);
    expect(result.before?.zoom).toBe(46);
  });

  it("takes a redo that places the new element a pixel off, as a document round trip may", async () => {
    const { session } = fakeVsCode({ placesNewElementOffBy: 1 });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([]);
  });

  it("holds a redo to the exact positions where the edit moved a shape by less than the tolerance", async () => {
    const nudged: CanvasFacts = { ...ORIGINAL, positions: ["0,0", "100,0", "201,0"] };
    const options = { ...OPTIONS, edited: nudged };

    const passing = await checkHistory(fakeVsCode({ editedCanvas: nudged }).session, options);
    expect(passing.failures).toEqual([]);

    const ignored = await checkHistory(
      fakeVsCode({ editedCanvas: nudged, ignored: ["Control+y"] }).session,
      options,
    );
    expect(ignored.failures).toEqual([
      "Control+y did not bring the edit back: the canvas shows 3 shapes and 2 connections, after the edit 3 shapes and 2 connections",
    ]);
  });

  it("waits for a modeler that restores the view and the selection a moment after the import", async () => {
    const { session } = fakeVsCode({ restoresAfterReads: 2 });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([]);
  });

  it("fails a redo that refits the view", async () => {
    const { session } = fakeVsCode({ refitsAfter: "redo" });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+y moved the view: zoom 84% at 12, -8 before, zoom 62% at 0, 0 after",
    ]);
    expect(result.afterRedo).toEqual({ zoom: 62, selected: 5 });
  });

  it("fails a refit that follows the import after the view matched once", async () => {
    const { session } = fakeVsCode({ refitsAfter: "redo", refitsAfterReads: 1 });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+y moved the view: zoom 84% at 12, -8 before, zoom 62% at 0, 0 after",
    ]);
  });

  it("fails an undo that refits the view after it matched once", async () => {
    const { session } = fakeVsCode({ refitsAfter: "undo", refitsAfterReads: 1 });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+z moved the view: zoom 84% at 12, -8 before, zoom 62% at 0, 0 after",
    ]);
  });

  it("fails an undo that refits the view", async () => {
    const { session } = fakeVsCode({ refitsAfter: "undo" });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+z moved the view: zoom 84% at 12, -8 before, zoom 62% at 0, 0 after",
    ]);
  });

  it("fails an import that drops the selection, naming what stayed on the canvas", async () => {
    const { session } = fakeVsCode({ dropsSelectionAfter: "redo" });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+y dropped the selection of conn-1, conn-2, shape-a and 2 more, which are still on the canvas",
    ]);
    expect(result.afterRedo?.selected).toBe(0);
  });

  it("fails an import that gives every element a new id, which leaves no selection to follow", async () => {
    const { session } = fakeVsCode({ replacesIds: true });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+y gave every selected element a new id (conn-1, conn-2, shape-a and 2 more are not on the canvas any more), so the selection cannot be followed",
    ]);
  });

  it("fails a redo that selects the element it brings back, and does not blame the undo for taking it away", async () => {
    const { session } = fakeVsCode({ selectsNewElement: true });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual(["Control+y selected shape-d, which was not selected before"]);
    expect(result.afterRedo?.selected).toBe(6);
    expect(result.afterUndo?.selected).toBe(5);
  });

  it("names a redo that brought the edit back to no canvas, and still presses the undo", async () => {
    const { session, pressed } = fakeVsCode({ ignored: ["Control+y"] });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+y did not bring the edit back: the canvas shows 3 shapes and 2 connections, after the edit 4 shapes and 2 connections",
    ]);
    expect(pressed.at(-1)).toBe("Control+z");
    expect(result.afterRedo).toBeUndefined();
  });

  it("shows the redo reached the document where the edit left the canvas as it was", async () => {
    const options = { ...OPTIONS, edited: ORIGINAL };

    const working = await checkHistory(fakeVsCode({ editedCanvas: ORIGINAL }).session, options);
    expect(working.failures).toEqual([]);

    const ignored = await checkHistory(
      fakeVsCode({ editedCanvas: ORIGINAL, ignored: ["Control+y"] }).session,
      options,
    );
    expect(ignored.failures).toEqual([
      "Control+y did not change the document: VS Code does not call it changed, so the canvas did not come from the redo",
    ]);
  });

  it("names an undo that left the edit on the canvas", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+z"] });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+z after the redo did not bring the canvas back: it shows 4 shapes and 2 connections, before the edit 3 shapes and 2 connections",
    ]);
    expect(result.afterUndo).toBeUndefined();
  });

  it("reports a zoom key that did nothing, since the view would be the fit a refit restores", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+Equal", "Control+Minus"] });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+Equal and Control+Minus left the zoom at 62%, so the view the history has to keep is the one a refit would restore",
    ]);
  });

  it("reports a select all that selected nothing, since the selection would be empty", async () => {
    const { session } = fakeVsCode({ ignored: ["Control+KeyA"] });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([
      "Control+KeyA selected no element of the canvas, so the history has no selection to keep",
    ]);
  });

  it("saves a document VS Code still calls changed after the undo", async () => {
    const { session, pressed } = fakeVsCode({ staysDirtyAfterUndo: true });

    const { failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual([]);
    expect(pressed.at(-1)).toBe("Control+s");
  });

  it("leaves a document that is clean after the undo alone", async () => {
    const { session, pressed } = fakeVsCode();

    await checkHistory(session, OPTIONS);

    expect(pressed).not.toContain("Control+s");
  });

  it("ends at once when the canvas takes no focus", async () => {
    const { session, pressed } = fakeVsCode({ canvasRefusesFocus: true });

    const { result, failures } = await checkHistory(session, OPTIONS);

    expect(failures).toEqual(["the canvas <svg> did not take the focus"]);
    expect(pressed).toEqual([]);
    expect(result).toEqual({});
  });
});
