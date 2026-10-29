import { describe, expect, it } from "vitest";

import {
  toastStackBottom,
  toastStackWidth,
  zoomRowRaised,
  type ChromeIsland,
  type PaletteRow,
  type Size,
} from "../core/index.js";
import {
  GEOMETRY_TOLERANCE_PX,
  ZOOM_PANEL_WIDTH,
  bottomObstacle,
  boxMismatches,
  chromeExpectations,
  dropdownProblems,
  expectedChromeBoxes,
  expectedFitInsets,
  freeRectangle,
  geometryProblems,
  limitViolations,
  tooltipProblems,
  webRowProblems,
  type ChromeMeasurement,
  type IslandBox,
} from "./geometry.js";

const WIDE: Size = { width: 1280, height: 900 };
const NARROW: Size = { width: 720, height: 700 };
const VERY_NARROW: Size = { width: 420, height: 700 };

/** A box from its anchor edges, the way the CSS places islands. */
function anchored(
  container: Size,
  size: { width: number; height: number },
  anchor: { left?: number; right?: number; top?: number; bottom?: number; centerX?: number },
): IslandBox {
  const left =
    anchor.left ??
    (anchor.right !== undefined
      ? container.width - anchor.right - size.width
      : (anchor.centerX ?? container.width / 2) - size.width / 2);
  const top = anchor.top ?? container.height - (anchor.bottom ?? 0) - size.height;
  return { left, top, width: size.width, height: size.height };
}

interface Layout {
  container?: Size;
  paletteRow?: PaletteRow;
  open?: Partial<ChromeMeasurement["open"]>;
  islands?: Partial<Record<ChromeIsland, IslandBox>>;
}

/** A conforming IDE measurement: menu, palette, zoom panel at their anchors. */
function measurement({
  container = WIDE,
  paletteRow,
  open = {},
  islands = {},
}: Layout = {}): ChromeMeasurement {
  const row = paletteRow ?? (container.width <= 760 ? "second-row" : "top");
  return {
    container,
    paletteRow: row,
    open: {
      legend: false,
      inspector: false,
      problems: false,
      emptyState: false,
      primaryCollapsed: false,
      zoomRaised: false,
      ...open,
    },
    islands: {
      menu: { left: 12, top: 12, width: 40, height: 40 },
      palette: anchored(container, { width: 160, height: 40 }, { top: row === "top" ? 12 : 64 }),
      zoom: anchored(container, { width: 173, height: 40 }, { right: 12, bottom: 12 }),
      ...islands,
    },
  };
}

describe("expectedChromeBoxes", () => {
  it("anchors menu, palette and zoom panel in a wide IDE container", () => {
    expect(expectedChromeBoxes(measurement(), "ide")).toEqual({
      menu: { left: 12, top: 12, width: 40, height: 40 },
      palette: { top: 12, height: 40, centerX: 640 },
      zoom: { right: 12, bottom: 12, width: ZOOM_PANEL_WIDTH, height: 40 },
    });
  });

  it("puts the palette in the second row at top 64 and the status box at top 116", () => {
    const status = anchored(NARROW, { width: 400, height: 48 }, { top: 116 });
    const boxes = expectedChromeBoxes(
      measurement({ container: NARROW, islands: { status } }),
      "ide",
    );
    expect(boxes.palette).toEqual({ top: 64, height: 40, centerX: 360 });
    expect(boxes.status).toEqual({ top: 116, centerX: 360 });
  });

  it("puts the status box at top 64 under a top-row palette", () => {
    const status = anchored(WIDE, { width: 400, height: 48 }, { top: 64 });
    expect(expectedChromeBoxes(measurement({ islands: { status } }), "ide").status).toEqual({
      top: 64,
      centerX: 640,
    });
  });

  it.each([
    ["ide", false, 12, 12],
    ["ide", true, 12, 60],
    ["embedded", true, 12, 60],
    ["web", false, 40, 40],
    ["web", true, 40, 88],
  ] as const)(
    "stacks pill and legend bottom-left (%s host, pill %s)",
    (host, pill, pillBottom, legendBottom) => {
      const islands: Partial<Record<ChromeIsland, IslandBox>> = {
        legend: anchored(WIDE, { width: 200, height: 120 }, { left: 12, bottom: legendBottom }),
      };
      if (pill)
        islands.problems = anchored(
          WIDE,
          { width: 120, height: 40 },
          { left: 12, bottom: pillBottom },
        );
      const boxes = expectedChromeBoxes(
        measurement({ islands, open: { legend: true, problems: pill } }),
        host,
      );
      expect(boxes.legend).toEqual({ left: 12, bottom: legendBottom });
      if (pill) expect(boxes.problems).toEqual({ left: 12, bottom: pillBottom, height: 40 });
      else expect(boxes.problems).toBeUndefined();
    },
  );

  it.each([
    ["ide", false, 60],
    ["ide", true, 60],
    ["web", false, 60],
    ["web", true, 88],
  ] as const)(
    "lifts the legend above the bottom row up to 440px (%s host, pill %s)",
    (host, pill, bottom) => {
      const islands: Partial<Record<ChromeIsland, IslandBox>> = {
        legend: anchored(VERY_NARROW, { width: 200, height: 120 }, { left: 12, bottom }),
      };
      if (pill) {
        islands.problems = anchored(
          VERY_NARROW,
          { width: 120, height: 40 },
          {
            left: 12,
            bottom: host === "web" ? 40 : 12,
          },
        );
      }
      const boxes = expectedChromeBoxes(
        measurement({ container: VERY_NARROW, islands, open: { legend: true, problems: pill } }),
        host,
      );
      expect(boxes.legend).toEqual({ left: 12, bottom });
    },
  );

  it("docks an open inspector on the right above 760px and centres the status box left of it", () => {
    const inspector = anchored(WIDE, { width: 288, height: 300 }, { top: 64, right: 12 });
    const status = anchored(WIDE, { width: 400, height: 48 }, { top: 64, centerX: 490 });
    const boxes = expectedChromeBoxes(
      measurement({ islands: { inspector, status }, open: { inspector: true } }),
      "ide",
    );
    expect(boxes.inspector).toEqual({ top: 64, right: 12, width: 288 });
    expect(boxes.status).toEqual({ top: 64, centerX: 490 });
  });

  it("turns the inspector into a bottom sheet up to 760px and hides zoom, pill and legend", () => {
    const inspector = anchored(NARROW, { width: 696, height: 200 }, { left: 12, bottom: 12 });
    const state = measurement({
      container: NARROW,
      islands: { inspector },
      open: { inspector: true, legend: true, problems: true },
    });
    const expectations = chromeExpectations(state, "ide");
    expect(expectations.boxes.inspector).toEqual({ left: 12, right: 12, bottom: 12 });
    expect(expectations.boxes.zoom).toBeUndefined();
    expect(expectations.required).toEqual(["menu", "palette"]);
    expect(Object.keys(expectations.hidden)).toEqual(
      expect.arrayContaining(["zoom", "problems", "legend"]),
    );
    expect(expectations.boxes.status).toBeUndefined();
  });

  it("anchors a web app's primary action top right and keeps that corner empty elsewhere", () => {
    const primary = anchored(WIDE, { width: 96, height: 40 }, { top: 12, right: 12 });
    expect(expectedChromeBoxes(measurement({ islands: { primary } }), "web").primary).toEqual({
      top: 12,
      right: 12,
      height: 40,
    });
    expect(
      expectedChromeBoxes(measurement({ islands: { primary } }), "ide").primary,
    ).toBeUndefined();
  });
});

describe("tolerance", () => {
  const box: IslandBox = { left: 1095, top: 848, width: 173, height: 40 };

  it("is 1px", () => {
    expect(GEOMETRY_TOLERANCE_PX).toBe(1);
  });

  it("accepts a box exactly 1px off and rejects one 1.5px or 2px off", () => {
    const expected = { right: 12, bottom: 12, width: 173, height: 40 };
    expect(boxMismatches("zoom", { ...box, left: box.left + 1 }, expected, WIDE)).toEqual([]);
    expect(boxMismatches("zoom", { ...box, left: box.left + 1.5 }, expected, WIDE)).toEqual([
      "zoom: right is 10.5px, expected 12px (±1px)",
    ]);
    expect(boxMismatches("zoom", { ...box, top: box.top - 2 }, expected, WIDE)).toEqual([
      "zoom: bottom is 14px, expected 12px (±1px)",
    ]);
  });

  it("checks the horizontal centre", () => {
    const palette = { left: 562, top: 12, width: 160, height: 40 };
    expect(boxMismatches("palette", palette, { centerX: 640 }, WIDE)).toEqual([
      "palette: centerX is 642px, expected 640px (±1px)",
    ]);
  });

  it("applies the tolerance to limits as well", () => {
    const legend = { left: 12, top: 700, width: 183, height: 100 };
    expect(limitViolations("legend", legend, { minWidth: 184 }, WIDE)).toEqual([]);
    expect(limitViolations("legend", { ...legend, width: 182.5 }, { minWidth: 184 }, WIDE)).toEqual(
      ["legend: width is 182.5px, at least 184px expected"],
    );
  });
});

describe("geometryProblems", () => {
  it("passes conforming layouts in every breakpoint", () => {
    expect(geometryProblems(measurement(), "ide")).toEqual([]);
    expect(geometryProblems(measurement({ container: NARROW }), "ide")).toEqual([]);
    expect(geometryProblems(measurement({ container: VERY_NARROW }), "embedded")).toEqual([]);
  });

  it("reports a missing required island", () => {
    const state = measurement();
    delete state.islands.zoom;
    expect(geometryProblems(state, "ide")).toEqual([
      'zoom: [data-chrome="zoom"] is missing or not visible',
    ]);
  });

  it("reports an island shifted by 2px", () => {
    const state = measurement();
    state.islands.zoom = { ...state.islands.zoom!, left: state.islands.zoom!.left + 2 };
    expect(geometryProblems(state, "ide")).toEqual(["zoom: right is 10px, expected 12px (±1px)"]);
  });

  it("requires the second row up to 760px", () => {
    const state = measurement({ container: NARROW, paletteRow: "top" });
    expect(geometryProblems(state, "ide")).toContain(
      'palette: data-palette="top" in a 720px wide container; up to 760px it is "second-row" (guide §5.15)',
    );
  });

  it("rejects the second row above 760px when the palette fits the top row", () => {
    const state = measurement({ paletteRow: "second-row" });
    expect(geometryProblems(state, "ide")).toEqual([
      "palette: in the second row although the top row keeps 508px to the menu trigger (at least 16px suffice, guide §5.15)",
    ]);
  });

  it("accepts the second row above 760px for a palette too wide for the top row", () => {
    const container = { width: 900, height: 900 };
    const state = measurement({
      container,
      paletteRow: "second-row",
      islands: { palette: { left: 12, top: 64, width: 876, height: 40 } },
    });
    expect(geometryProblems(state, "ide")).toEqual([]);
  });

  it("keeps 16px between the menu trigger and a top-row palette", () => {
    const container = { width: 800, height: 900 };
    const state = measurement({
      container,
      islands: { palette: anchored(container, { width: 680, height: 40 }, { top: 12 }) },
    });
    expect(geometryProblems(state, "ide")).toEqual([
      "palette: left is 60px, at least 68px expected",
    ]);
  });

  it("caps the second-row palette at the container width minus 24px", () => {
    const state = measurement({
      container: VERY_NARROW,
      islands: { palette: { left: 4, top: 64, width: 412, height: 40 } },
    });
    expect(geometryProblems(state, "ide")).toEqual([
      "palette: width is 412px, at most 396px expected",
    ]);
  });

  it("keeps the top right empty outside the web app", () => {
    const primary = anchored(WIDE, { width: 96, height: 40 }, { top: 12, right: 12 });
    expect(geometryProblems(measurement({ islands: { primary } }), "ide")).toEqual([
      "primary: visible, but the top right stays empty in IDE and embedded hosts (guide §5.7)",
    ]);
  });

  it("reports zoom, pill and legend left visible under an open bottom sheet", () => {
    const inspector = anchored(NARROW, { width: 696, height: 200 }, { left: 12, bottom: 12 });
    const state = measurement({
      container: NARROW,
      islands: { inspector },
      open: { inspector: true },
    });
    expect(geometryProblems(state, "ide")).toEqual([
      "zoom: visible, but hidden while the inspector is a bottom sheet (guide §5.11)",
    ]);
  });

  it("limits the bottom sheet to 45% of the container height", () => {
    const inspector = anchored(NARROW, { width: 696, height: 400 }, { left: 12, bottom: 12 });
    const state = measurement({
      container: NARROW,
      islands: { inspector },
      open: { inspector: true },
    });
    delete state.islands.zoom;
    expect(geometryProblems(state, "ide")).toEqual([
      "inspector: height is 400px, at most 315px expected",
    ]);
  });

  it("keeps the side inspector 64px above the bottom", () => {
    const inspector = anchored(WIDE, { width: 288, height: 800 }, { top: 64, right: 12 });
    const state = measurement({ islands: { inspector }, open: { inspector: true } });
    expect(geometryProblems(state, "ide")).toEqual([
      "inspector: bottom is 36px, at least 64px expected",
    ]);
  });

  it("checks the root's state attributes against what is visible", () => {
    const pill = anchored(WIDE, { width: 120, height: 40 }, { left: 12, bottom: 12 });
    expect(geometryProblems(measurement({ open: { problems: true } }), "ide")).toEqual([
      'problems: the root carries data-problems="shown", but the island is not visible',
    ]);
    expect(geometryProblems(measurement({ islands: { problems: pill } }), "ide")).toEqual([
      'problems: visible, but the root lacks data-problems="shown"',
    ]);
  });

  it("requires the legend to be at least 184px wide", () => {
    const legend = anchored(WIDE, { width: 150, height: 100 }, { left: 12, bottom: 12 });
    expect(
      geometryProblems(measurement({ islands: { legend }, open: { legend: true } }), "ide"),
    ).toEqual(["legend: width is 150px, at least 184px expected"]);
  });
});

describe("dropdownProblems", () => {
  it("opens 8px under the trigger, at least 248px wide", () => {
    expect(dropdownProblems({ left: 12, top: 60, width: 248, height: 300 }, WIDE)).toEqual([]);
    expect(dropdownProblems({ left: 12, top: 62, width: 200, height: 300 }, WIDE)).toEqual([
      "dropdown: top is 62px, expected 60px (±1px)",
      "dropdown: width is 200px, at least 248px expected",
    ]);
  });

  it("stays 12px above the bottom and within min(320px, 100% − 24px)", () => {
    expect(dropdownProblems({ left: 12, top: 60, width: 330, height: 640 }, NARROW)).toEqual([
      "dropdown: width is 330px, at most 320px expected",
      "dropdown: bottom is 0px, at least 12px expected",
    ]);
  });
});

describe("tooltipProblems", () => {
  const menu = { left: 12, top: 12, width: 40, height: 40 };

  it("stands under the top row at 60px, shifted to keep 12px to the side", () => {
    expect(
      tooltipProblems({ left: 12, top: 60, width: 60, height: 28 }, menu, "top", WIDE),
    ).toEqual([]);
    expect(tooltipProblems({ left: 2, top: 60, width: 60, height: 28 }, menu, "top", WIDE)).toEqual(
      [
        "tooltip: left is 2px, expected 12px (±1px)",
        "tooltip: left is 2px, at least 12px expected",
      ],
    );
  });

  it("stands under the second row at 112px, centred on its entry", () => {
    const entry = { left: 150, top: 68, width: 32, height: 32 };
    expect(
      tooltipProblems({ left: 136, top: 112, width: 60, height: 28 }, entry, "second-row", NARROW),
    ).toEqual([]);
    expect(
      tooltipProblems({ left: 136, top: 60, width: 60, height: 28 }, entry, "second-row", NARROW),
    ).toEqual(["tooltip: top is 60px, expected 112px (±1px)"]);
  });

  it("reports a second-row tooltip centred in the container instead of on its entry (guide §5.15)", () => {
    const entry = { left: 150, top: 68, width: 32, height: 32 };
    const centredInContainer = NARROW.width / 2 - 30;
    expect(
      tooltipProblems(
        { left: centredInContainer, top: 112, width: 60, height: 28 },
        entry,
        "second-row",
        NARROW,
      ),
    ).toEqual([`tooltip: left is ${centredInContainer}px, expected 136px (±1px)`]);
    expect(
      tooltipProblems({ left: 300, top: 112, width: 60, height: 28 }, entry, "second-row", NARROW),
    ).toEqual(["tooltip: left is 300px, expected 136px (±1px)"]);
  });

  it("ends 60px above the bottom over the bottom row", () => {
    const zoomIn = { left: 1182, top: 852, width: 32, height: 32 };
    const tooltip = { left: 1150, top: 812, width: 96, height: 28 };
    expect(tooltipProblems(tooltip, zoomIn, "bottom", WIDE)).toEqual([]);
    expect(tooltipProblems({ ...tooltip, top: 852 }, zoomIn, "bottom", WIDE)).toEqual([
      "tooltip: bottom is 20px, expected 60px (±1px)",
    ]);
  });
});

describe("expectedFitInsets and freeRectangle", () => {
  it("are the guide's table in the top row and the second row", () => {
    expect(expectedFitInsets(measurement(), "ide")).toEqual({
      top: 88,
      right: 24,
      bottom: 64,
      left: 24,
    });
    expect(freeRectangle(measurement(), "ide")).toEqual({
      left: 24,
      top: 88,
      right: 1256,
      bottom: 836,
    });
    expect(expectedFitInsets(measurement({ container: NARROW }), "embedded")).toEqual({
      top: 140,
      right: 24,
      bottom: 64,
      left: 24,
    });
  });

  it("count the web app's pill, never another host's", () => {
    const withPill = measurement({ open: { problems: true } });
    expect(expectedFitInsets(withPill, "web").bottom).toBe(92);
    expect(expectedFitInsets(withPill, "ide").bottom).toBe(64);
  });

  it("count an open legend above 440px and a side inspector", () => {
    const legend = anchored(WIDE, { width: 200, height: 120 }, { left: 12, bottom: 12 });
    const inspector = anchored(WIDE, { width: 288, height: 700 }, { right: 12, top: 64 });
    expect(
      expectedFitInsets(
        measurement({ open: { legend: true, inspector: true }, islands: { legend, inspector } }),
        "ide",
      ),
    ).toEqual({ top: 88, right: 324, bottom: 64, left: 236 });
    const narrowLegend = anchored(
      VERY_NARROW,
      { width: 200, height: 120 },
      { left: 12, bottom: 64 },
    );
    expect(
      expectedFitInsets(
        measurement({
          container: VERY_NARROW,
          open: { legend: true },
          islands: { legend: narrowLegend },
        }),
        "ide",
      ).left,
    ).toBe(24);
  });

  it("end at the bottom sheet's top edge plus 12, where the legend does not count", () => {
    const sheet = anchored(NARROW, { width: 696, height: 300 }, { left: 12, bottom: 12 });
    const legend = anchored(NARROW, { width: 200, height: 120 }, { left: 12, bottom: 12 });
    const facts = measurement({
      container: NARROW,
      open: { inspector: true, legend: true },
      islands: { inspector: sheet, legend },
    });
    expect(expectedFitInsets(facts, "ide")).toEqual({ top: 140, right: 24, bottom: 324, left: 24 });
  });

  it("span the whole container on an axis the insets leave no room on", () => {
    const low = measurement({ container: { width: 1280, height: 120 } });
    expect(freeRectangle(low, "ide")).toEqual({ left: 24, top: 0, right: 1256, bottom: 120 });
  });
});

describe("the web column (0.2)", () => {
  /** The legal line as the web demo renders it: about 380px of text at left 12, bottom 12. */
  const legal = (container: Size) =>
    anchored(container, { width: 380, height: 20 }, { left: 12, bottom: 12 });
  const primary = (container: Size, width = 94) =>
    anchored(container, { width, height: 40 }, { top: 12, right: 12 });
  /** A conforming web app: menu, palette, zoom panel, primary action and legal line at their anchors. */
  const web = (layout: Layout = {}): ChromeMeasurement => {
    const container = layout.container ?? WIDE;
    return measurement({
      ...layout,
      islands: { legal: legal(container), primary: primary(container), ...layout.islands },
    });
  };
  const raisedZoom = (container: Size) =>
    anchored(container, { width: 173, height: 40 }, { right: 12, bottom: 40 });

  it("passes a conforming web app in every breakpoint, the raised zoom row included", () => {
    expect(geometryProblems(web(), "web")).toEqual([]);
    expect(geometryProblems(web({ container: NARROW }), "web")).toEqual([]);
    const narrowest = web({
      container: VERY_NARROW,
      open: { zoomRaised: true },
      islands: { zoom: raisedZoom(VERY_NARROW) },
    });
    expect(geometryProblems(narrowest, "web")).toEqual([]);
  });

  it("anchors the primary action top right, 40 wide while collapsed", () => {
    const collapsed = web({
      open: { primaryCollapsed: true },
      islands: { primary: primary(WIDE, 40) },
    });
    expect(expectedChromeBoxes(collapsed, "web").primary).toEqual({
      top: 12,
      right: 12,
      height: 40,
      width: 40,
    });
    expect(geometryProblems(collapsed, "web")).toEqual([]);
    const labelled = web({ open: { primaryCollapsed: true } });
    expect(geometryProblems(labelled, "web")).toEqual([
      "primary: width is 94px, expected 40px (±1px)",
    ]);
  });

  it("keeps a top-row palette 16px from the primary action (guide §5.15)", () => {
    const container = { width: 1000, height: 900 };
    const wide = web({
      container,
      islands: { palette: anchored(container, { width: 800, height: 40 }, { top: 12 }) },
    });
    expect(chromeExpectations(wide, "web").limits.palette).toEqual({ minLeft: 68, minRight: 122 });
    expect(geometryProblems(wide, "web")).toEqual([
      "palette: right is 100px, at least 122px expected",
    ]);
  });

  it("accepts the second row above 760px only once even the icon keeps less than 16px", () => {
    const container = { width: 900, height: 900 };
    const fits = web({
      container,
      paletteRow: "second-row",
      islands: { palette: { left: 100, top: 64, width: 700, height: 40 } },
    });
    expect(geometryProblems(fits, "web")).toEqual([
      "palette: in the second row although the top row keeps 48px to the menu trigger and 48px to the primary action's icon (at least 16px suffice, guide §5.15)",
    ]);
    const tight = web({
      container,
      paletteRow: "second-row",
      islands: { palette: { left: 55, top: 64, width: 790, height: 40 } },
    });
    expect(geometryProblems(tight, "web")).toEqual([]);
  });

  it("stands the legal line at left 12, bottom 12, 20 high, required in the web app", () => {
    const off = web({ islands: { legal: { left: 12, top: 862, width: 380, height: 24 } } });
    expect(geometryProblems(off, "web")).toEqual([
      "legal: bottom is 14px, expected 12px (±1px)",
      "legal: height is 24px, expected 20px (±1px)",
    ]);
    const missing = web();
    delete missing.islands.legal;
    expect(geometryProblems(missing, "web")).toEqual([
      'legal: [data-chrome="legal"] is missing or not visible',
    ]);
  });

  it("raises the zoom panel to 40 and, up to 440px, the legend to 88 with data-zoom-row", () => {
    const legend = anchored(VERY_NARROW, { width: 200, height: 120 }, { left: 12, bottom: 88 });
    const state = web({
      container: VERY_NARROW,
      open: { zoomRaised: true, legend: true },
      islands: { zoom: raisedZoom(VERY_NARROW), legend },
    });
    const boxes = expectedChromeBoxes(state, "web");
    expect(boxes.zoom).toEqual({ right: 12, bottom: 40, width: ZOOM_PANEL_WIDTH, height: 40 });
    expect(boxes.legend).toEqual({ left: 12, bottom: 88 });
    expect(geometryProblems(state, "web")).toEqual([]);
  });

  it("reports a zoom row that does not follow zoomRowRaised (guide §5.10)", () => {
    const raisedWithRoom = web({ open: { zoomRaised: true }, islands: { zoom: raisedZoom(WIDE) } });
    expect(webRowProblems(raisedWithRoom, "web")).toEqual([
      'zoom: the root carries data-zoom-row="raised" although the zoom panel keeps 703px to the legal line (at least 8px)',
    ]);
    const meeting = web({ container: VERY_NARROW });
    const legalBox = meeting.islands.legal!;
    const zoomBox = meeting.islands.zoom!;
    const raised = zoomRowRaised({
      containerWidth: VERY_NARROW.width,
      legalRight: legalBox.left + legalBox.width,
      zoomWidth: zoomBox.width,
    });
    expect(webRowProblems(meeting, "web")).toEqual(
      raised
        ? [
            'zoom: -157px between the legal line and the zoom panel, but the root lacks data-zoom-row="raised" (below 8px the zoom panel stands above the legal line)',
          ]
        : [],
    );
  });

  it("leaves a gap within the tolerance of 8px to either decision", () => {
    const container = { width: 1280, height: 900 };
    const borderline = web({
      container,
      islands: { legal: { left: 12, top: 868, width: 1080 - 12 - 8.5, height: 20 } },
    });
    expect(webRowProblems(borderline, "web")).toEqual([]);
  });

  it("checks data-primary and data-zoom-row against what is visible", () => {
    const hidden = web({ open: { primaryCollapsed: true } });
    delete hidden.islands.primary;
    expect(webRowProblems(hidden, "web")).toEqual([
      'primary: the root carries data-primary="collapsed", but no primary action is visible',
    ]);
    expect(
      webRowProblems(measurement({ open: { primaryCollapsed: true, zoomRaised: true } }), "ide"),
    ).toEqual([
      'primary: the root carries data-primary="collapsed" outside the web app',
      'zoom: the root carries data-zoom-row="raised" outside the web app',
    ]);
  });

  it("opens the problems list 8px above the pill, at most min(320px, 100% − 24px) × 320", () => {
    const pill = anchored(WIDE, { width: 120, height: 40 }, { left: 12, bottom: 40 });
    const list = anchored(WIDE, { width: 320, height: 200 }, { left: 12, bottom: 88 });
    const state = web({
      open: { problems: true },
      islands: { problems: pill, "problems-popover": list },
    });
    expect(expectedChromeBoxes(state, "web")["problems-popover"]).toEqual({ left: 12, bottom: 88 });
    expect(geometryProblems(state, "web")).toEqual([]);
    const tooBig = web({
      open: { problems: true },
      islands: {
        problems: pill,
        "problems-popover": { ...list, width: 330, top: list.top - 140, height: 340 },
      },
    });
    expect(geometryProblems(tooBig, "web")).toEqual([
      "problems-popover: width is 330px, at most 320px expected",
      "problems-popover: height is 340px, at most 320px expected",
    ]);
    expect(
      chromeExpectations(
        web({ container: VERY_NARROW, open: { problems: true }, islands: { problems: pill } }),
        "web",
      ).limits["problems-popover"],
    ).toEqual({ maxWidth: 320, maxHeight: 320 });
    const alone = web({ islands: { "problems-popover": list } });
    expect(geometryProblems(alone, "web")).toEqual([
      "problems-popover: visible, but the problems list opens only above a visible pill (guide §5.10)",
    ]);
    expect(geometryProblems(measurement({ islands: { "problems-popover": list } }), "ide")).toEqual(
      [
        "problems-popover: visible, but the IDE host opens its Problems view, never a list of its own (guide §5.10)",
      ],
    );
  });

  it("centres the toast stack at toastStackBottom of the measured bottom row", () => {
    const state = web();
    const obstacles = [
      bottomObstacle(state.islands.zoom!, WIDE),
      bottomObstacle(state.islands.legal!, WIDE),
    ];
    const bottom = toastStackBottom({ containerWidth: WIDE.width, obstacles });
    const toasts = anchored(WIDE, { width: toastStackWidth(WIDE.width), height: 42 }, { bottom });
    state.islands.toasts = toasts;
    expect(expectedChromeBoxes(state, "web").toasts).toEqual({
      centerX: 640,
      width: toastStackWidth(WIDE.width),
      bottom,
    });
    expect(geometryProblems(state, "web")).toEqual([]);
    state.islands.toasts = { ...toasts, top: toasts.top - 10 };
    expect(geometryProblems(state, "web")).toEqual([
      `toasts: bottom is ${bottom + 10}px, expected ${bottom}px (±1px)`,
    ]);
    expect(geometryProblems(measurement({ islands: { toasts } }), "ide")).toEqual([
      "toasts: visible, but the IDE host shows no toasts; the extension shows the host's notification (guide §13.5)",
    ]);
    expect(geometryProblems(measurement({ islands: { toasts } }), "embedded")).toEqual([
      "toasts: visible, but the embedded host shows no toasts; the embedding host shows its own feedback (guide §5.2, §9)",
    ]);
  });

  it("stands the bottom-left stack and the raised zoom panel on a wrapped legal line", () => {
    const container = { width: 320, height: 700 };
    const wrapped = anchored(container, { width: 296, height: 40 }, { left: 12, bottom: 12 });
    const state = web({
      container,
      open: { problems: true, zoomRaised: true },
      islands: {
        legal: wrapped,
        primary: primary(container, 40),
        problems: anchored(container, { width: 120, height: 40 }, { left: 12, bottom: 60 }),
        zoom: anchored(container, { width: 173, height: 40 }, { right: 12, bottom: 60 }),
      },
    });
    const expected = expectedChromeBoxes(state, "web");
    expect(expected.legal).toEqual({ left: 12, bottom: 12, height: 40 });
    expect(expected.problems).toMatchObject({ bottom: 60 });
    expect(expected.zoom).toMatchObject({ bottom: 60 });
    expect(chromeExpectations(state, "web").limits.legal).toEqual({ maxWidth: 296 });
    expect(expectedFitInsets(state, "web").bottom).toBe(112);
    const overflowing = web({ container, islands: { legal: { ...wrapped, width: 380 } } });
    expect(geometryProblems(overflowing, "web")).toContain(
      "legal: width is 380px, at most 296px expected",
    );
  });

  it("lifts the toast stack only where its widest card would meet the bottom row", () => {
    // The legal line with a GitHub link ends 7.5px before the 480px stack's column.
    const state = web({
      islands: { legal: { left: 12, top: WIDE.height - 32, width: 380.5, height: 20 } },
    });
    const narrowCard = { ...state, toastCardWidth: 146 };
    narrowCard.islands = {
      ...state.islands,
      toasts: anchored(WIDE, { width: 480, height: 42 }, { bottom: 12 }),
    };
    expect(expectedChromeBoxes(narrowCard, "web").toasts?.bottom).toBe(12);
    expect(geometryProblems(narrowCard, "web")).toEqual([]);
    const wideCard = { ...narrowCard, toastCardWidth: 480 };
    expect(expectedChromeBoxes(wideCard, "web").toasts?.bottom).toBe(40);
  });

  it("reads an obstacle's top from the container's bottom", () => {
    expect(bottomObstacle({ left: 1095, top: 848, width: 173, height: 40 }, WIDE)).toEqual({
      left: 1095,
      right: 1268,
      top: 52,
    });
  });

  it("centres the start screen card both ways, the work chrome no longer required", () => {
    const card = { left: 440, top: 300, width: 400, height: 300 };
    const state = measurement({
      open: { emptyState: true },
      islands: { legal: legal(WIDE), "empty-state": card },
    });
    for (const name of ["menu", "palette", "zoom"] as const) delete state.islands[name];
    expect(chromeExpectations(state, "web").required).toEqual(["empty-state", "legal"]);
    expect(expectedChromeBoxes(state, "web")["empty-state"]).toEqual({
      centerX: 640,
      centerY: 450,
      width: 400,
    });
    expect(geometryProblems(state, "web")).toEqual([]);
    state.islands["empty-state"] = { ...card, left: 450, top: 302, width: 380 };
    expect(geometryProblems(state, "web")).toEqual([
      "empty-state: centerY is 452px, expected 450px (±1px)",
      "empty-state: width is 380px, expected 400px (±1px)",
    ]);
    const narrow = measurement({ container: VERY_NARROW, open: { emptyState: true } });
    expect(
      chromeExpectations({ ...narrow, islands: { "empty-state": card } }, "web").boxes[
        "empty-state"
      ],
    ).toEqual({
      centerX: 210,
      centerY: 350,
      width: 396,
    });
  });

  it("checks data-empty-state against the card", () => {
    const card = { left: 440, top: 300, width: 400, height: 300 };
    expect(geometryProblems(web({ islands: { "empty-state": card } }), "web")).toEqual([
      'empty-state: visible, but the root lacks data-empty-state="shown"',
    ]);
    const missing = measurement({ open: { emptyState: true }, islands: { legal: legal(WIDE) } });
    expect(geometryProblems(missing, "web")).toEqual([
      'empty-state: [data-chrome="empty-state"] is missing or not visible',
      'empty-state: the root carries data-empty-state="shown", but the island is not visible',
    ]);
  });

  it("insets the drop zone 12px on every side", () => {
    const zone = { left: 12, top: 12, width: 1256, height: 876 };
    expect(geometryProblems(web({ islands: { "drop-zone": zone } }), "web")).toEqual([]);
    expect(
      geometryProblems(web({ islands: { "drop-zone": { ...zone, width: 1260 } } }), "web"),
    ).toEqual(["drop-zone: right is 8px, expected 12px (±1px)"]);
  });

  it("never shows the web column in the IDE and embedded hosts", () => {
    const islands = {
      legal: legal(WIDE),
      "empty-state": { left: 440, top: 300, width: 400, height: 300 },
      "drop-zone": { left: 12, top: 12, width: 1256, height: 876 },
    };
    expect(geometryProblems(measurement({ islands }), "embedded")).toEqual([
      "legal: visible, but the legal line belongs to the web app; an IDE or an embedding host carries its own (guide §5.2)",
      "empty-state: visible, but IDE and embedded hosts have no start screen; they show the empty-file hint (guide §13.5)",
      "drop-zone: visible, but IDE and embedded hosts have no drop zone; their files belong to the host (guide §5.2)",
      'empty-state: visible, but the root lacks data-empty-state="shown"',
    ]);
  });

  it("keeps 92px at the bottom of the fit with the zoom panel raised", () => {
    expect(
      expectedFitInsets(web({ container: VERY_NARROW, open: { zoomRaised: true } }), "web").bottom,
    ).toBe(92);
    expect(expectedFitInsets(web({ container: VERY_NARROW }), "web").bottom).toBe(64);
  });

  it("stands the bottom-row tooltip 8px above a raised zoom row", () => {
    const zoomIn = { left: 330, top: 624, width: 32, height: 32 };
    const tooltip = { left: 298, top: 584, width: 96, height: 28 };
    expect(tooltipProblems(tooltip, zoomIn, "bottom", VERY_NARROW, undefined, 40)).toEqual([]);
    expect(tooltipProblems(tooltip, zoomIn, "bottom", VERY_NARROW)).toEqual([
      "tooltip: bottom is 88px, expected 60px (±1px)",
    ]);
  });
});
