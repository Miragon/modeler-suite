import {
  CHROME_ISLANDS,
  LEGAL_LINE_HEIGHT,
  PALETTE_CLEARANCE,
  SHELL,
  legalLineHeight,
  toastStackBottom,
  toastStackWidth,
  zoomRowRaised,
  type BottomObstacle,
  type ChromeIsland,
  type Insets,
  type PaletteRow,
  type ShellHost,
  type Size,
} from "../core/index.js";
import type { PageLike } from "./page.js";
import { inPage, type RelativeBox, type ToolWindow } from "./page-tools.js";

/** Every island box must match within this many pixels (guide §13.4). */
export const GEOMETRY_TOLERANCE_PX = 1;

/**
 * `getBoundingClientRect()` relative to the shell root's padding box, where its absolutely
 * positioned islands anchor (a border on the root, as in a framed foreign page, does not count).
 */
export interface IslandBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChromeMeasurement {
  container: Size;
  /** From the root's `data-palette` attribute. */
  paletteRow: PaletteRow;
  /** The visible islands, found by `[data-chrome]`. */
  islands: Partial<Record<ChromeIsland, IslandBox>>;
  /**
   * State attributes of the root: `[data-legend="open"]`, `[data-inspector="open"]`,
   * `[data-problems="shown"]`, and in the web host `[data-empty-state="shown"]`,
   * `[data-primary="collapsed"]` and `[data-zoom-row="raised"]`.
   */
  open: {
    legend: boolean;
    inspector: boolean;
    problems: boolean;
    emptyState: boolean;
    primaryCollapsed: boolean;
    zoomRaised: boolean;
  };
  /** Width of the widest visible toast card (`[data-status]` in the stack); absent without a toast. */
  toastCardWidth?: number;
}

/** Constraints of one island; every given field must hold within `GEOMETRY_TOLERANCE_PX`. */
export interface ExpectedBox {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
  /** Horizontal centre relative to the root. */
  centerX?: number;
  /** Vertical centre relative to the root (the web app's empty-state card). */
  centerY?: number;
}

export const DEFAULT_ROOT = ".cd-shell";

/** `[−] [NN%] [+] | [Fit]` with a 56px readout (guide §5.1, §5.8): 1+3+32+2+56+2+32+2+5+2+32+3+1. */
export const ZOOM_PANEL_WIDTH = 173;

/** Height of one line of the web app's legal line under the bottom-left stack (guide §5.10). */
export const LEGAL_LINE = LEGAL_LINE_HEIGHT;

/** The web app's start screen card: `min(400px, 100% − 24px)` wide (guide §8). */
const EMPTY_STATE_MAX_WIDTH = 400;

/** The web app's problems list above the pill: `min(320px, 100% − 24px)` wide, at most 320 high (guide §5.10). */
const POPOVER_MAX_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 320;

/** Minimum width of the legend card (guide §5.10). */
const LEGEND_MIN_WIDTH = 184;

const STATUS_MAX_WIDTH = 560;
const DROPDOWN_MAX_WIDTH = 320;
const TOOLTIP_MAX_WIDTH = 280;
const SHEET_MAX_HEIGHT_SHARE = 0.45;

type MeasureResult = { error: string } | (ChromeMeasurement & { duplicates: string[] });

const measureProbe = ({
  root,
  islands,
}: {
  root: string;
  islands: readonly string[];
}): MeasureResult => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return { error: `no element matches the shell root selector "${root}"` };
  const boxes: Partial<Record<string, RelativeBox>> = {};
  const duplicates: string[] = [];
  for (const element of rootElement.querySelectorAll("[data-chrome]")) {
    const name = element.getAttribute("data-chrome") ?? "";
    if (!islands.includes(name) || !tools.visible(element)) continue;
    if (boxes[name]) {
      duplicates.push(name);
      continue;
    }
    boxes[name] = tools.box(element, rootElement);
  }
  const cardWidths = [
    ...rootElement.querySelectorAll<HTMLElement>('[data-chrome="toasts"] > [data-status]'),
  ]
    .filter((card) => tools.visible(card))
    .map((card) => card.getBoundingClientRect().width);
  return {
    ...(cardWidths.length > 0 ? { toastCardWidth: Math.max(...cardWidths) } : {}),
    container: tools.container(rootElement),
    paletteRow: rootElement.getAttribute("data-palette") === "second-row" ? "second-row" : "top",
    islands: boxes,
    open: {
      legend: rootElement.getAttribute("data-legend") === "open",
      inspector: rootElement.getAttribute("data-inspector") === "open",
      problems: rootElement.getAttribute("data-problems") === "shown",
      emptyState: rootElement.getAttribute("data-empty-state") === "shown",
      primaryCollapsed: rootElement.getAttribute("data-primary") === "collapsed",
      zoomRaised: rootElement.getAttribute("data-zoom-row") === "raised",
    },
    duplicates,
  };
};

/** Measures the islands of the shell under `root` (default `.cd-shell`) in the page. */
export async function measureChrome(
  page: PageLike,
  root: string = DEFAULT_ROOT,
): Promise<ChromeMeasurement> {
  const result = await inPage(page, measureProbe, { root, islands: CHROME_ISLANDS });
  if ("error" in result) throw new Error(`@miragon/modeler-shell conformance: ${result.error}`);
  if (result.duplicates.length > 0) {
    const names = [...new Set(result.duplicates)]
      .map((name) => `[data-chrome="${name}"]`)
      .join(", ");
    throw new Error(`@miragon/modeler-shell conformance: more than one visible ${names}`);
  }
  return {
    container: result.container,
    paletteRow: result.paletteRow,
    islands: result.islands,
    open: result.open,
    ...(result.toastCardWidth !== undefined ? { toastCardWidth: result.toastCardWidth } : {}),
  };
}

/** Upper and lower limits the guide gives as "at least" and "at most" (guide §5.4 to §5.15). */
export interface BoxLimits {
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  minLeft?: number;
  minRight?: number;
  minBottom?: number;
}

/** What the guide expects of the chrome in a measured state. */
export interface ChromeExpectations {
  boxes: Partial<Record<ChromeIsland, ExpectedBox>>;
  limits: Partial<Record<ChromeIsland, BoxLimits>>;
  /** Islands that must be visible. */
  required: ChromeIsland[];
  /** Islands that must not be visible, with the rule that hides them. */
  hidden: Partial<Record<ChromeIsland, string>>;
}

function isNarrow(container: Size): boolean {
  return container.width <= SHELL.narrow;
}

function isVeryNarrow(container: Size): boolean {
  return container.width <= SHELL.veryNarrow;
}

/** The open inspector is a bottom sheet up to `SHELL.narrow` (guide §5.11). */
function sheetOpen(measurement: ChromeMeasurement): boolean {
  return measurement.open.inspector && isNarrow(measurement.container);
}

/** The bottom of an island as `toastStackBottom` sees it (guide §8, the bottom row since design system 1.15.0). */
export function bottomObstacle(box: IslandBox, container: Size): BottomObstacle {
  return { left: box.left, right: box.left + box.width, top: container.height - box.top };
}

/** Why an island of the web column never shows in the IDE and embedded hosts (guide §5.2). */
const WEB_ONLY: Partial<Record<ChromeIsland, string>> = {
  primary: "the top right stays empty in IDE and embedded hosts (guide §5.7)",
  legal:
    "the legal line belongs to the web app; an IDE or an embedding host carries its own (guide §5.2)",
  "empty-state":
    "IDE and embedded hosts have no start screen; they show the empty-file hint (guide §13.5)",
  "drop-zone":
    "IDE and embedded hosts have no drop zone; their files belong to the host (guide §5.2)",
};

/** The work chrome the web app's start screen hides (guide §8: only the card and the legal line show). */
export const WORK_CHROME: readonly ChromeIsland[] = [
  "menu",
  "primary",
  "palette",
  "zoom",
  "problems",
  "legend",
  "status",
  "inspector",
];

/** The anchors and limits of guide §5.2 to §5.15 for `measurement` in `host`. */
export function chromeExpectations(
  measurement: ChromeMeasurement,
  host: ShellHost,
): ChromeExpectations {
  const { container, islands, open, paletteRow } = measurement;
  const { edge, gap, row, free, inspectorWidth } = SHELL;
  const web = host === "web";
  const startScreen = web && open.emptyState;
  const raised = web && open.zoomRaised;
  const secondRow = paletteRow === "second-row";
  const sheet = sheetOpen(measurement);
  const sideInspector = open.inspector && !isNarrow(container);
  // A narrow container wraps the legal line; the stack above it stands on its whole lines.
  const legalHeight = legalLineHeight(web ? islands.legal?.height : undefined);
  const boxes: Partial<Record<ChromeIsland, ExpectedBox>> = {};
  const limits: Partial<Record<ChromeIsland, BoxLimits>> = {};
  const hidden: Partial<Record<ChromeIsland, string>> = {};
  // Behind the start screen the work chrome is hidden; where it shows anyway, it still stands at its anchor.
  const required: ChromeIsland[] = startScreen ? ["empty-state"] : ["menu", "palette"];
  if (web) required.push("legal");

  boxes.menu = { left: edge, top: edge, width: row, height: row };

  boxes.palette = { top: secondRow ? free : edge, height: row, centerX: container.width / 2 };
  const menu = islands.menu;
  const primary = web ? islands.primary : undefined;
  if (secondRow) {
    limits.palette = { maxWidth: container.width - 2 * edge };
  } else {
    limits.palette = {};
    if (menu) limits.palette.minLeft = menu.left + menu.width + PALETTE_CLEARANCE;
    // Guide §5.15: 16px to every island of the top row, the primary action included.
    if (primary) limits.palette.minRight = container.width - primary.left + PALETTE_CLEARANCE;
  }

  if (sheet) {
    const reason = "hidden while the inspector is a bottom sheet (guide §5.11)";
    hidden.zoom = reason;
    hidden.problems = reason;
    hidden.legend = reason;
  } else {
    if (!startScreen) required.push("zoom");
    const legalStack = edge + legalHeight + gap;
    boxes.zoom = {
      right: edge,
      bottom: raised ? legalStack : edge,
      width: ZOOM_PANEL_WIDTH,
      height: row,
    };
    const stackBase = web ? legalStack : edge;
    if (islands.problems) boxes.problems = { left: edge, bottom: stackBase, height: row };
    if (islands.legend) {
      const besidePill = open.problems ? stackBase + row + gap : stackBase;
      const aboveBottomRow = (raised ? legalStack : edge) + row + gap;
      const bottom = isVeryNarrow(container) ? Math.max(besidePill, aboveBottomRow) : besidePill;
      boxes.legend = { left: edge, bottom };
      limits.legend = { minWidth: LEGEND_MIN_WIDTH };
    }
  }

  if (islands.inspector) {
    if (sheet) {
      boxes.inspector = { left: edge, right: edge, bottom: edge };
      limits.inspector = { maxHeight: container.height * SHEET_MAX_HEIGHT_SHARE };
    } else {
      boxes.inspector = { top: free, right: edge, width: inspectorWidth };
      limits.inspector = { minBottom: free };
    }
  }

  if (islands.status) {
    const strip = sideInspector ? container.width - edge - inspectorWidth : container.width;
    boxes.status = { top: secondRow ? free + row + edge : free, centerX: strip / 2 };
    limits.status = {
      minLeft: edge,
      maxWidth: Math.min(STATUS_MAX_WIDTH, container.width - 2 * edge),
    };
  }

  if (web) {
    if (primary) {
      boxes.primary = { top: edge, right: edge, height: row };
      if (open.primaryCollapsed) boxes.primary.width = row;
    }
    boxes.legal = { left: edge, bottom: edge, height: legalHeight };
    limits.legal = { maxWidth: container.width - 2 * edge };
    if (islands["empty-state"]) {
      boxes["empty-state"] = {
        centerX: container.width / 2,
        centerY: container.height / 2,
        width: Math.min(EMPTY_STATE_MAX_WIDTH, container.width - 2 * edge),
      };
    }
    if (islands["drop-zone"])
      boxes["drop-zone"] = { left: edge, top: edge, right: edge, bottom: edge };
    if (islands.toasts) {
      const obstacles = (["zoom", "legal", "problems"] as const).flatMap((name) => {
        const box = islands[name];
        return box ? [bottomObstacle(box, container)] : [];
      });
      boxes.toasts = {
        centerX: container.width / 2,
        width: toastStackWidth(container.width),
        bottom: toastStackBottom({
          containerWidth: container.width,
          obstacles,
          cardWidth: measurement.toastCardWidth,
        }),
      };
    }
  } else {
    Object.assign(hidden, WEB_ONLY);
    hidden.toasts =
      host === "ide"
        ? "the IDE host shows no toasts; the extension shows the host's notification (guide §13.5)"
        : "the embedded host shows no toasts; the embedding host shows its own feedback (guide §5.2, §9)";
  }

  if (host === "ide") {
    hidden["problems-popover"] =
      "the IDE host opens its Problems view, never a list of its own (guide §5.10)";
  } else {
    const pill = islands.problems;
    if (pill) {
      boxes["problems-popover"] = { left: edge, bottom: container.height - pill.top + gap };
      limits["problems-popover"] = {
        maxWidth: Math.min(POPOVER_MAX_WIDTH, container.width - 2 * edge),
        maxHeight: POPOVER_MAX_HEIGHT,
      };
    } else {
      hidden["problems-popover"] =
        "the problems list opens only above a visible pill (guide §5.10)";
    }
  }

  return { boxes, limits, required, hidden };
}

/** The boxes guide §5.2–§5.12 expects for what was measured (anchors per host and breakpoint). */
export function expectedChromeBoxes(
  measurement: ChromeMeasurement,
  host: ShellHost,
): Partial<Record<ChromeIsland, ExpectedBox>> {
  return chromeExpectations(measurement, host).boxes;
}

const round = (value: number): number => Math.round(value * 10) / 10;

function sides(box: IslandBox, container: Size): Required<ExpectedBox> {
  return {
    left: box.left,
    top: box.top,
    right: container.width - box.left - box.width,
    bottom: container.height - box.top - box.height,
    width: box.width,
    height: box.height,
    centerX: box.left + box.width / 2,
    centerY: box.top + box.height / 2,
  };
}

/** Every field of `expected` that `box` misses by more than `tolerance`, as readable problems. */
export function boxMismatches(
  name: string,
  box: IslandBox,
  expected: ExpectedBox,
  container: Size,
  tolerance: number = GEOMETRY_TOLERANCE_PX,
): string[] {
  const actual = sides(box, container);
  return (Object.keys(expected) as Array<keyof ExpectedBox>).flatMap((field) => {
    const want = expected[field];
    if (want === undefined) return [];
    const have = actual[field];
    return Math.abs(have - want) > tolerance + 1e-6
      ? [`${name}: ${field} is ${round(have)}px, expected ${round(want)}px (±${tolerance}px)`]
      : [];
  });
}

/** Every limit `box` breaks by more than `tolerance`. */
export function limitViolations(
  name: string,
  box: IslandBox,
  limits: BoxLimits,
  container: Size,
  tolerance: number = GEOMETRY_TOLERANCE_PX,
): string[] {
  const actual = sides(box, container);
  const problems: string[] = [];
  const atLeast = (field: string, have: number, limit: number | undefined) => {
    if (limit !== undefined && have < limit - tolerance - 1e-6) {
      problems.push(`${name}: ${field} is ${round(have)}px, at least ${round(limit)}px expected`);
    }
  };
  const atMost = (field: string, have: number, limit: number | undefined) => {
    if (limit !== undefined && have > limit + tolerance + 1e-6) {
      problems.push(`${name}: ${field} is ${round(have)}px, at most ${round(limit)}px expected`);
    }
  };
  atLeast("width", actual.width, limits.minWidth);
  atMost("width", actual.width, limits.maxWidth);
  atMost("height", actual.height, limits.maxHeight);
  atLeast("left", actual.left, limits.minLeft);
  atLeast("right", actual.right, limits.minRight);
  atLeast("bottom", actual.bottom, limits.minBottom);
  return problems;
}

/**
 * Every deviation of a measured state from guide §5.2 to §5.15: missing and unexpected islands,
 * boxes and limits, the palette row decision and the root's state attributes.
 */
export function geometryProblems(
  measurement: ChromeMeasurement,
  host: ShellHost,
  tolerance: number = GEOMETRY_TOLERANCE_PX,
): string[] {
  const { container, islands, open, paletteRow } = measurement;
  const expectations = chromeExpectations(measurement, host);
  const problems: string[] = [];
  const sheet = sheetOpen(measurement);

  for (const name of expectations.required) {
    if (!islands[name]) problems.push(`${name}: [data-chrome="${name}"] is missing or not visible`);
  }
  for (const name of CHROME_ISLANDS) {
    const box = islands[name];
    if (!box) continue;
    const expected = expectations.boxes[name];
    if (!expected) {
      const reason = expectations.hidden[name] ?? "no anchor of the guide applies";
      problems.push(`${name}: visible, but ${reason}`);
      continue;
    }
    problems.push(...boxMismatches(name, box, expected, container, tolerance));
    const limits = expectations.limits[name];
    if (limits) problems.push(...limitViolations(name, box, limits, container, tolerance));
  }

  if (isNarrow(container) && paletteRow !== "second-row") {
    problems.push(
      `palette: data-palette="${paletteRow}" in a ${round(container.width)}px wide container; up to ${SHELL.narrow}px it is "second-row" (guide §5.15)`,
    );
  }
  const palette = islands.palette;
  const menu = islands.menu;
  const primary = host === "web" ? islands.primary : undefined;
  if (paletteRow === "second-row" && !isNarrow(container) && palette && menu) {
    const clipped = palette.width >= container.width - 2 * SHELL.edge - tolerance;
    const topRowLeft = (container.width - palette.width) / 2;
    const toMenu = topRowLeft - menu.left - menu.width;
    // Guide §5.15: the primary action loses its label before the palette moves, so it counts icon only.
    const toPrimary = primary
      ? container.width - SHELL.edge - SHELL.row - (topRowLeft + palette.width)
      : Number.POSITIVE_INFINITY;
    const fits =
      toMenu >= PALETTE_CLEARANCE + tolerance && toPrimary >= PALETTE_CLEARANCE + tolerance;
    if (!clipped && fits) {
      const kept = primary
        ? `${round(toMenu)}px to the menu trigger and ${round(toPrimary)}px to the primary action's icon`
        : `${round(toMenu)}px to the menu trigger`;
      problems.push(
        `palette: in the second row although the top row keeps ${kept} (at least ${PALETTE_CLEARANCE}px suffice, guide §5.15)`,
      );
    }
  }

  const state = (
    island: ChromeIsland,
    flag: boolean,
    attribute: string,
    hiddenBySheet: boolean,
  ) => {
    const shown = Boolean(islands[island]);
    if (flag && !shown && !hiddenBySheet) {
      problems.push(`${island}: the root carries ${attribute}, but the island is not visible`);
    }
    if (!flag && shown) problems.push(`${island}: visible, but the root lacks ${attribute}`);
  };
  state("problems", open.problems, 'data-problems="shown"', sheet || open.emptyState);
  state("legend", open.legend, 'data-legend="open"', sheet || open.emptyState);
  state("inspector", open.inspector, 'data-inspector="open"', open.emptyState);
  state("empty-state", open.emptyState, 'data-empty-state="shown"', false);
  problems.push(...webRowProblems(measurement, host, tolerance));

  return problems;
}

/**
 * The web app's state attributes for its top and bottom rows: `data-primary="collapsed"` only with
 * a visible primary action, and `data-zoom-row="raised"` exactly when the zoom panel at
 * `bottom: 12px` would keep less than 8px to the legal line (`zoomRowRaised`, guide §5.10 since
 * design system 1.15.0).
 */
export function webRowProblems(
  measurement: ChromeMeasurement,
  host: ShellHost,
  tolerance: number = GEOMETRY_TOLERANCE_PX,
): string[] {
  const { container, islands, open } = measurement;
  const problems: string[] = [];
  if (host !== "web") {
    if (open.primaryCollapsed)
      problems.push('primary: the root carries data-primary="collapsed" outside the web app');
    if (open.zoomRaised)
      problems.push('zoom: the root carries data-zoom-row="raised" outside the web app');
    return problems;
  }
  if (open.primaryCollapsed && !islands.primary && !open.emptyState) {
    problems.push(
      'primary: the root carries data-primary="collapsed", but no primary action is visible',
    );
  }
  const legal = islands.legal;
  const zoom = islands.zoom;
  if (legal && zoom) {
    const legalRight = legal.left + legal.width;
    const gap = container.width - SHELL.edge - zoom.width - legalRight;
    const raised = zoomRowRaised({
      containerWidth: container.width,
      legalRight,
      zoomWidth: zoom.width,
    });
    // A gap within the tolerance of the 8px limit may go either way.
    const borderline = Math.abs(gap - SHELL.gap) <= tolerance;
    if (raised && !open.zoomRaised && !borderline) {
      problems.push(
        `zoom: ${round(gap)}px between the legal line and the zoom panel, but the root lacks data-zoom-row="raised" (below ${SHELL.gap}px the zoom panel stands above the legal line)`,
      );
    }
    if (!raised && open.zoomRaised && !borderline) {
      problems.push(
        `zoom: the root carries data-zoom-row="raised" although the zoom panel keeps ${round(gap)}px to the legal line (at least ${SHELL.gap}px)`,
      );
    }
  }
  return problems;
}

/**
 * The fit insets of guide §5.9 for what was measured, recomputed from the guide's table: top 88
 * (second row 140), sides 24, bottom 64 (web app with the pill or the zoom panel raised above the
 * legal line 92); right 12 + 288 + 24 with a side
 * inspector; left 12 + legend width + 24 with an open legend in a container wider than 440px; with
 * a bottom sheet the bottom is the distance to its top edge plus 12, and the legend does not count.
 */
export function expectedFitInsets(measurement: ChromeMeasurement, host: ShellHost): Insets {
  const { container, islands, open, paletteRow } = measurement;
  const insets: Insets = {
    top: paletteRow === "second-row" ? SHELL.fitInsetTopSecondRow : SHELL.fitInsetTop,
    right: SHELL.fitInsetSide,
    bottom:
      host === "web" && (open.problems || open.zoomRaised)
        ? SHELL.fitInsetBottomWeb + legalLineHeight(islands.legal?.height) - LEGAL_LINE
        : SHELL.fitInsetBottom,
    left: SHELL.fitInsetSide,
  };
  if (sheetOpen(measurement)) {
    const sheet = islands.inspector;
    insets.bottom = sheet ? container.height - sheet.top + SHELL.edge : SHELL.fitInsetBottom;
    return insets;
  }
  if (open.inspector) insets.right = SHELL.edge + SHELL.inspectorWidth + SHELL.fitInsetSide;
  const legend = islands.legend;
  if (open.legend && legend && legend.width > 0 && container.width > SHELL.veryNarrow) {
    insets.left = SHELL.edge + legend.width + SHELL.fitInsetSide;
  }
  return insets;
}

/** A rectangle relative to the shell root's padding box, by its edges. */
export interface Rectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The free rectangle of guide §5.9: the container minus `expectedFitInsets`. Where the insets
 * leave no room on an axis, that axis spans the whole container (as the fit centres there).
 */
export function freeRectangle(measurement: ChromeMeasurement, host: ShellHost): Rectangle {
  const { container } = measurement;
  const insets = expectedFitInsets(measurement, host);
  const horizontal = container.width - insets.left - insets.right > 0;
  const vertical = container.height - insets.top - insets.bottom > 0;
  return {
    left: horizontal ? insets.left : 0,
    top: vertical ? insets.top : 0,
    right: horizontal ? container.width - insets.right : container.width,
    bottom: vertical ? container.height - insets.bottom : container.height,
  };
}

/** Where the dropdown opens (guide §5.4): under the trigger, at least 248px, inside the container. */
export function dropdownProblems(
  box: IslandBox,
  container: Size,
  tolerance = GEOMETRY_TOLERANCE_PX,
): string[] {
  const { edge, gap, row, menuMinWidth } = SHELL;
  return [
    ...boxMismatches("dropdown", box, { top: edge + row + gap, left: edge }, container, tolerance),
    ...limitViolations(
      "dropdown",
      box,
      {
        minWidth: menuMinWidth,
        maxWidth: Math.min(DROPDOWN_MAX_WIDTH, container.width - 2 * edge),
        minBottom: edge,
      },
      container,
      tolerance,
    ),
  ];
}

/** Which island a tooltip belongs to decides its row (guide §5.6). */
export type TooltipRow = "top" | "second-row" | "bottom";

/**
 * Where the chrome tooltip of a control stands (guide §5.6, §5.15): 8px below the top row
 * (`top: 60px`) or the second row (`top: 112px`), 8px above the bottom row (`bottom: 60px`, above
 * the web app's raised zoom row `bottom: 88px`: give its `bottomRow` of 40); centred on its control
 * in every row, the second one included, and shifted to keep 12px to the sides.
 */
export function tooltipProblems(
  tooltip: IslandBox,
  anchor: IslandBox,
  row: TooltipRow,
  container: Size,
  tolerance = GEOMETRY_TOLERANCE_PX,
  bottomRow: number = SHELL.edge,
): string[] {
  const { edge, gap, row: rowHeight, free } = SHELL;
  const clamp = (centred: number) =>
    Math.max(edge, Math.min(centred, container.width - edge - tooltip.width));
  const expectedAt = (left: number): ExpectedBox =>
    row === "bottom"
      ? { left, bottom: bottomRow + rowHeight + gap }
      : { left, top: (row === "top" ? edge : free) + rowHeight + gap };
  return [
    ...boxMismatches(
      "tooltip",
      tooltip,
      expectedAt(clamp(anchor.left + anchor.width / 2 - tooltip.width / 2)),
      container,
      tolerance,
    ),
    ...limitViolations(
      "tooltip",
      tooltip,
      {
        minLeft: edge,
        minRight: edge,
        maxWidth: Math.min(TOOLTIP_MAX_WIDTH, container.width - 2 * edge),
      },
      container,
      tolerance,
    ),
  ];
}
