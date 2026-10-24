import { describe, expect, it } from "vitest";

import {
  EMPTY_DOCUMENTS,
  emptyDocumentSkips,
  emptyHintProblems,
  emptyNotInvalidProblems,
  emptyViewProblems,
  firstElementProblems,
  lastElementProblems,
  requiredEmptyDocuments,
  sameView,
  type FirstElementFacts,
} from "./empty-file-checks.js";
import type { EmptyHintFacts, EmptyViewFacts } from "./empty-file-facts.js";
import type { ShapeFacts } from "./facts.js";
import type { Rectangle } from "./geometry.js";

/** The free rectangle at 1280 × 900 in an IDE host: 88 top, 24 at the sides, 64 bottom. Centre (640, 462). */
const FREE: Rectangle = { left: 24, top: 88, right: 1256, bottom: 836 };

/** The hint's line, 260 × 20, centred on (640, 462). */
function hint(overrides: Partial<EmptyHintFacts> = {}): EmptyHintFacts {
  return {
    visible: true,
    text: "Pick a tool from the palette to start.",
    content: { left: 510, top: 452, width: 260, height: 20 },
    actions: [],
    startScreen: false,
    ...overrides,
  };
}

const AT_100: EmptyViewFacts = { zoom: 100, fitDisabled: true, view: "1 0 0 1 0 0" };
const PLOT_FITTED: EmptyViewFacts = { zoom: 96, fitDisabled: false, view: "0.96 0 0 0.96 40 90" };

/** A 120 × 80 element centred on (640, 462). */
function element(id: string, overrides: Partial<ShapeFacts> = {}): ShapeFacts {
  return {
    id,
    selected: true,
    transform: "matrix(1 0 0 1 580 422)",
    size: { width: 120, height: 80 },
    box: { left: 580, top: 422, width: 120, height: 80 },
    client: { x: 640, y: 462 },
    hit: true,
    ...overrides,
  };
}

function placed(overrides: Partial<FirstElementFacts> = {}): FirstElementFacts {
  return {
    entry: "create.box",
    before: [],
    after: [element("box_1")],
    hint: hint({ visible: false, content: null, text: "" }),
    viewBefore: AT_100,
    viewAfter: AT_100,
    free: FREE,
    ...overrides,
  };
}

describe("requiredEmptyDocuments and emptyDocumentSkips", () => {
  it("open the empty diagram first, then the file of zero bytes", () => {
    expect(EMPTY_DOCUMENTS).toEqual(["empty", "blank"]);
  });

  it("need the file of zero bytes only in the IDE host", () => {
    expect(requiredEmptyDocuments("ide")).toEqual(["empty", "blank"]);
    expect(requiredEmptyDocuments("web")).toEqual(["empty"]);
    expect(requiredEmptyDocuments("embedded")).toEqual(["empty"]);
  });

  it("skip each reserved key the harness lacks with hook documents", () => {
    expect(emptyDocumentSkips("ide", [])).toEqual([
      {
        hook: "documents",
        reason:
          'documents has no "empty": the empty diagram (100 %, the empty-file hint in the middle of the free rectangle, gone with the first element) was not verified',
      },
      {
        hook: "documents",
        reason:
          'documents has no "blank": a file of zero bytes, an empty file and not an invalid one, was not verified',
      },
    ]);
    expect(emptyDocumentSkips("ide", ["empty", "dark-style"]).map((skip) => skip.reason)).toEqual([
      'documents has no "blank": a file of zero bytes, an empty file and not an invalid one, was not verified',
    ]);
    expect(emptyDocumentSkips("web", ["empty"])).toEqual([]);
    expect(emptyDocumentSkips("embedded", ["blank"]).map((skip) => skip.hook)).toEqual([
      "documents",
    ]);
  });
});

describe("sameView", () => {
  it("takes a pixel of translation and a thousandth of scale as the same view", () => {
    expect(sameView("1 0 0 1 10 20", "1 0 0 1 10.8 19.2")).toBe(true);
    expect(sameView("0.96 0 0 0.96 40 90", "0.9605 0 0 0.9605 40 90")).toBe(true);
    expect(sameView(null, null)).toBe(true);
  });

  it("tells a moved or rescaled view apart", () => {
    expect(sameView("1 0 0 1 10 20", "1 0 0 1 12 20")).toBe(false);
    expect(sameView("1 0 0 1 10 20", "1.18 0 0 1.18 10 20")).toBe(false);
    expect(sameView("1 0 0 1 10 20", null)).toBe(false);
  });
});

describe("emptyViewProblems", () => {
  it("passes an empty diagram at 100 % with Fit disabled", () => {
    expect(emptyViewProblems(AT_100, undefined)).toEqual([]);
  });

  it("fails an empty diagram the import left zoomed", () => {
    expect(emptyViewProblems({ ...AT_100, zoom: 118 }, undefined)).toEqual([
      "zoom: the empty diagram opens at 118%, expected 100 %: with nothing to fit (Fit is aria-disabled) it opens at 100 %, without a fit (guide §5.9, §13.5)",
    ]);
  });

  it("passes a plot that always counts when it opened fitted: Fit keeps the view", () => {
    expect(emptyViewProblems(PLOT_FITTED, PLOT_FITTED)).toEqual([]);
    expect(
      emptyViewProblems(PLOT_FITTED, { ...PLOT_FITTED, view: "0.96 0 0 0.96 40.4 90" }),
    ).toEqual([]);
  });

  it("fails a plot that did not open fitted: Fit moves the view", () => {
    expect(
      emptyViewProblems(
        { zoom: 100, fitDisabled: false, view: "1 0 0 1 0 0" },
        { ...PLOT_FITTED, zoom: 50, view: "0.5 0 0 0.5 140 87" },
      ),
    ).toEqual([
      "zoom: Fit is enabled, so the content bounds hold a plot that always counts, but the empty diagram did not open fitted to it: a click on Fit moved the view from 100% to 50% (guide §5.9, §13.5)",
    ]);
    expect(emptyViewProblems(PLOT_FITTED, { ...PLOT_FITTED, view: "0.96 0 0 0.96 60 90" })).toEqual(
      [
        "zoom: Fit is enabled, so the content bounds hold a plot that always counts, but the empty diagram did not open fitted to it: a click on Fit moved the view from 96% to 96% (guide §5.9, §13.5)",
      ],
    );
  });

  it("fails without a readout", () => {
    expect(emptyViewProblems({ ...AT_100, zoom: null }, undefined)).toEqual([
      'zoom: no readout [data-zoom="actual"] showing a percentage',
    ]);
  });
});

describe("emptyHintProblems", () => {
  it("passes the hint in the middle of the free rectangle, with Insert example outside the web app", () => {
    expect(emptyHintProblems(hint(), FREE, "ide")).toEqual([]);
    expect(
      emptyHintProblems(
        hint({
          actions: ["Insert example"],
          content: { left: 510, top: 428, width: 260, height: 68 },
        }),
        FREE,
        "embedded",
      ),
    ).toEqual([]);
    expect(emptyHintProblems(hint(), FREE, "web")).toEqual([]);
  });

  it("allows a pixel off the middle and no more", () => {
    const content = { left: 511, top: 453, width: 260, height: 20 };
    expect(emptyHintProblems(hint({ content }), FREE, "ide")).toEqual([]);
    expect(emptyHintProblems(hint({ content: { ...content, top: 464 } }), FREE, "ide")).toEqual([
      "hint: its content is centred at (641, 474)px, expected the middle of the free rectangle at (640, 462)px (guide §5.9, §13.5)",
    ]);
  });

  it("fails a missing hint, naming the web app's rule there", () => {
    const missing = hint({ visible: false, text: "", content: null });
    expect(emptyHintProblems(missing, FREE, "ide")).toEqual([
      'hint: no visible empty-file hint (.cd-shell-hint) on the empty diagram; it says "Pick a tool from the palette to start." in the middle of the free rectangle (guide §13.5)',
    ]);
    expect(emptyHintProblems(missing, FREE, "web")).toEqual([
      'hint: no visible empty-file hint (.cd-shell-hint) on the empty diagram; it says "Pick a tool from the palette to start." in the middle of the free rectangle (guide §8, §13.5)',
    ]);
  });

  it("fails another text and a hint that shows nothing", () => {
    expect(emptyHintProblems(hint({ text: "Start here" }), FREE, "ide")).toEqual([
      'hint: reads "Start here", expected "Pick a tool from the palette to start." (guide §2, §13.5)',
    ]);
    expect(emptyHintProblems(hint({ content: null }), FREE, "ide")).toEqual([
      "hint: .cd-shell-hint is visible but shows nothing (guide §13.5)",
    ]);
  });

  it("fails Insert example in the web app and any other button elsewhere", () => {
    expect(emptyHintProblems(hint({ actions: ["Insert example"] }), FREE, "web")).toEqual([
      'hint: shows "Insert example" in the web app; there it has no "Insert example", the File group\'s "Show example" opens the example (guide §8)',
    ]);
    expect(emptyHintProblems(hint({ actions: ["Insert example", "Tour"] }), FREE, "ide")).toEqual([
      'hint: shows "Tour"; besides its line it holds only "Insert example" (guide §13.5)',
    ]);
  });

  it("fails a start screen card on the empty diagram", () => {
    expect(
      emptyHintProblems(
        hint({ visible: false, content: null, text: "", startScreen: true }),
        FREE,
        "web",
      ),
    ).toEqual([
      "start screen: the card still shows on the empty diagram; once it is gone the middle shows the empty-file hint (guide §8)",
      'hint: no visible empty-file hint (.cd-shell-hint) on the empty diagram; it says "Pick a tool from the palette to start." in the middle of the free rectangle (guide §8, §13.5)',
    ]);
    expect(emptyHintProblems(hint({ startScreen: true }), FREE, "ide")).toEqual([
      "start screen: a start screen card in the ide host; it shows the empty-file hint instead (guide §13.5)",
    ]);
  });
});

describe("emptyNotInvalidProblems", () => {
  it("passes an empty diagram without the invalid-file marks", () => {
    expect(emptyNotInvalidProblems({ readOnly: false, status: null })).toEqual([]);
  });

  it("fails an empty file shown as an invalid one", () => {
    expect(
      emptyNotInvalidProblems({
        readOnly: true,
        status: {
          tag: "div",
          description: 'div.cd-shell-status[data-chrome="status"]',
          attributes: { role: "alert" },
          text: "This file isn't a valid board right now.",
          visible: true,
          disabled: false,
        },
      }),
    ).toEqual([
      "invalid file: the empty diagram is read-only (data-readonly); an empty file is a new diagram, not an invalid one (guide §13.5)",
      'invalid file: the status box shows "This file isn\'t a valid board right now." on the empty diagram; an empty file is a new diagram, not an invalid one (guide §5.12, §13.5)',
    ]);
  });
});

describe("firstElementProblems", () => {
  it("passes one element in the middle of the free rectangle that took the hint away", () => {
    expect(firstElementProblems(placed())).toEqual([]);
  });

  it("accepts an element a grid snap moved by up to 12px", () => {
    const box = { left: 592, top: 410, width: 120, height: 80 };
    expect(firstElementProblems(placed({ after: [element("box_1", { box })] }))).toEqual([]);
    expect(
      firstElementProblems(placed({ after: [element("box_1", { box: { ...box, left: 604 } })] })),
    ).toEqual([
      'first element: "box_1" is centred at (664, 450)px, expected the middle of the free rectangle at (640, 462)px, where the hint stood: Enter places it there while that spot is free (guide §5.5, §5.9)',
    ]);
  });

  it("measures the element by its own bounds, not by a label beside it", () => {
    // a Wardley component: a 24px circle in the middle, its name to the right
    const labelled = element("component_1", {
      box: { left: 628, top: 450, width: 100, height: 24 },
    });
    const bounds = { left: 628, top: 450, width: 24, height: 24 };
    expect(firstElementProblems(placed({ after: [labelled], bounds }))).toEqual([]);
    expect(firstElementProblems(placed({ after: [labelled], bounds: null }))).toEqual([
      'first element: "component_1" is centred at (678, 462)px, expected the middle of the free rectangle at (640, 462)px, where the hint stood: Enter places it there while that spot is free (guide §5.5, §5.9)',
    ]);
  });

  it("fails a hint that stays with the first element", () => {
    expect(firstElementProblems(placed({ hint: hint() }))).toEqual([
      'hint: still visible after Enter on palette entry "create.box" placed "box_1"; the hint goes with the first element (guide §13.5)',
    ]);
  });

  it("fails a view that moves when the first element is placed", () => {
    expect(
      firstElementProblems(placed({ viewAfter: { ...AT_100, view: "1 0 0 1 -80 40" } })),
    ).toEqual([
      "view: placing the first element moved the view (100% before, 100% after); an element created on the canvas never fits (guide §5.9)",
    ]);
  });

  it("fails when Enter adds nothing or more than one element", () => {
    expect(firstElementProblems(placed({ after: [] }))).toEqual([
      'first element: Enter on palette entry "create.box" added no element, so the hint\'s leaving with the first element was not verified (guide §5.5)',
    ]);
    expect(firstElementProblems(placed({ after: [element("box_1"), element("box_2")] }))).toEqual([
      'first element: Enter on palette entry "create.box" added 2 elements (box_1, box_2), expected exactly one (guide §5.5)',
    ]);
  });

  it("counts only the elements Enter added, not a plot drawn as a shape", () => {
    const plot = element("plot", { box: { left: 0, top: 0, width: 1280, height: 900 } });
    expect(
      firstElementProblems(placed({ before: [plot], after: [plot, element("box_1")] })),
    ).toEqual([]);
  });
});

describe("lastElementProblems", () => {
  it("passes the hint back in the middle once the last element is gone", () => {
    expect(
      lastElementProblems({ id: "box_1", removed: true, hint: hint(), free: FREE }, "web"),
    ).toEqual([]);
  });

  it("fails a hint that does not return", () => {
    expect(
      lastElementProblems(
        { id: "box_1", removed: true, hint: hint({ visible: false, content: null }), free: FREE },
        "ide",
      ),
    ).toEqual([
      'after Delete removed the last element: hint: no visible empty-file hint (.cd-shell-hint) on the empty diagram; it says "Pick a tool from the palette to start." in the middle of the free rectangle (guide §13.5)',
    ]);
  });

  it("fails when Delete keeps the element", () => {
    expect(
      lastElementProblems({ id: "box_1", removed: false, hint: hint(), free: FREE }, "ide"),
    ).toEqual([
      'last element: Delete on the selected "box_1" kept it, so the hint\'s return on an emptied diagram was not verified',
    ]);
  });
});
