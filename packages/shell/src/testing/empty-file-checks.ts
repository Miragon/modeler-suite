import { defaultMessages, type ShellHost } from "../core/index.js";
import type { EmptyHintFacts, EmptyViewFacts } from "./empty-file-facts.js";
import type { ReadOnlyStateFacts, ShapeFacts } from "./facts.js";
import type { RelativeBox } from "./page-tools.js";
import { GEOMETRY_TOLERANCE_PX, type Rectangle } from "./geometry.js";
import type { EmptyDocument, ShellSkip } from "./harness.js";

/** The reserved keys of `ShellConformanceHarness.documents`, in the order the case opens them. */
export const EMPTY_DOCUMENTS: readonly EmptyDocument[] = ["empty", "blank"];

/**
 * Guide §5.5: Enter places an element in the middle of the free rectangle and 24px diagonally
 * further while that spot is taken. Half that step still reads as the middle; a snap to the
 * notation's grid stays inside it.
 */
export const FIRST_ELEMENT_TOLERANCE_PX = 12;

/** A view matrix ("a b c d e f") moved by more than this is a moved view. */
const VIEW_TOLERANCE_PX = 1;
const SCALE_TOLERANCE = 0.001;

/**
 * Every host has an empty diagram to start from; an IDE host also opens files of zero bytes,
 * which nothing but the user's own file system writes.
 */
export function requiredEmptyDocuments(host: ShellHost): EmptyDocument[] {
  return host === "ide" ? ["empty", "blank"] : ["empty"];
}

/** One skip per reserved key `documents` lacks on `host`. */
export function emptyDocumentSkips(host: ShellHost, documents: readonly string[]): ShellSkip[] {
  const what: Record<EmptyDocument, string> = {
    empty:
      "the empty diagram (100 %, the empty-file hint in the middle of the free rectangle, gone with the first element) was not verified",
    blank: "a file of zero bytes, an empty file and not an invalid one, was not verified",
  };
  return requiredEmptyDocuments(host)
    .filter((key) => !documents.includes(key))
    .map((key) => ({ hook: "documents", reason: `documents has no "${key}": ${what[key]}` }));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function centreOf(box: { left: number; top: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function freeCentre(free: Rectangle): { x: number; y: number } {
  return { x: (free.left + free.right) / 2, y: (free.top + free.bottom) / 2 };
}

function offCentre(point: { x: number; y: number }, free: Rectangle, tolerance: number): boolean {
  const centre = freeCentre(free);
  return (
    Math.abs(point.x - centre.x) > tolerance + 1e-6 ||
    Math.abs(point.y - centre.y) > tolerance + 1e-6
  );
}

function at(point: { x: number; y: number }): string {
  return `(${round(point.x)}, ${round(point.y)})px`;
}

/** Two views alike within a pixel of translation and a thousandth of scale. */
export function sameView(view: string | null, other: string | null): boolean {
  if (view === other) return true;
  const parse = (matrix: string | null) => matrix?.split(" ").map(Number) ?? [];
  const [a = NaN, b = NaN, c = NaN, d = NaN, e = NaN, f = NaN] = parse(view);
  const [a2 = NaN, b2 = NaN, c2 = NaN, d2 = NaN, e2 = NaN, f2 = NaN] = parse(other);
  return (
    [a - a2, b - b2, c - c2, d - d2].every((delta) => Math.abs(delta) <= SCALE_TOLERANCE) &&
    [e - e2, f - f2].every((delta) => Math.abs(delta) <= VIEW_TOLERANCE_PX)
  );
}

/**
 * Guide §5.9 and §13.5: an empty diagram opens at 100 %, without a fit. Where the content bounds
 * hold a plot that always counts (Wardley), Fit is enabled and the diagram opens fitted to it, so a
 * click on Fit (`refitted`) leaves the view as it was.
 */
export function emptyViewProblems(
  opened: EmptyViewFacts,
  refitted: EmptyViewFacts | undefined,
): string[] {
  if (opened.zoom === null) return ['zoom: no readout [data-zoom="actual"] showing a percentage'];
  if (opened.fitDisabled) {
    return opened.zoom === 100
      ? []
      : [
          `zoom: the empty diagram opens at ${opened.zoom}%, expected 100 %: with nothing to fit (Fit is aria-disabled) it opens at 100 %, without a fit (guide §5.9, §13.5)`,
        ];
  }
  if (!refitted) return [];
  if (refitted.zoom === opened.zoom && sameView(refitted.view, opened.view)) return [];
  return [
    `zoom: Fit is enabled, so the content bounds hold a plot that always counts, but the empty diagram did not open fitted to it: a click on Fit moved the view from ${opened.zoom}% to ${refitted.zoom ?? "?"}% (guide §5.9, §13.5)`,
  ];
}

/**
 * Guide §13.5 and, for the web app, §8 (design system 1.23.0): the empty-file hint stands in the
 * middle of the free rectangle, says "Pick a tool from the palette to start.", and in the web app
 * shows no "Insert example" (the File group has "Show example"); no start screen competes with it.
 */
export function emptyHintProblems(
  hint: EmptyHintFacts,
  free: Rectangle,
  host: ShellHost,
): string[] {
  const problems: string[] = [];
  const rule = host === "web" ? "guide §8, §13.5" : "guide §13.5";
  if (hint.startScreen) {
    problems.push(
      host === "web"
        ? "start screen: the card still shows on the empty diagram; once it is gone the middle shows the empty-file hint (guide §8)"
        : `start screen: a start screen card in the ${host} host; it shows the empty-file hint instead (guide §13.5)`,
    );
  }
  if (!hint.visible) {
    problems.push(
      `hint: no visible empty-file hint (.cd-shell-hint) on the empty diagram; it says "${defaultMessages.emptyHint}" in the middle of the free rectangle (${rule})`,
    );
    return problems;
  }
  if (hint.text !== defaultMessages.emptyHint) {
    problems.push(
      `hint: reads "${hint.text}", expected "${defaultMessages.emptyHint}" (guide §2, §13.5)`,
    );
  }
  if (!hint.content) {
    problems.push(`hint: .cd-shell-hint is visible but shows nothing (${rule})`);
  } else {
    const centre = centreOf(hint.content);
    if (offCentre(centre, free, GEOMETRY_TOLERANCE_PX)) {
      problems.push(
        `hint: its content is centred at ${at(centre)}, expected the middle of the free rectangle at ${at(freeCentre(free))} (guide §5.9, §13.5)`,
      );
    }
  }
  const foreign =
    host === "web"
      ? hint.actions
      : hint.actions.filter((action) => action !== defaultMessages.insertExample);
  if (foreign.length > 0) {
    problems.push(
      host === "web"
        ? `hint: shows ${foreign.map((action) => `"${action}"`).join(", ")} in the web app; there it has no "${defaultMessages.insertExample}", the File group's "${defaultMessages.showExample}" opens the example (guide §8)`
        : `hint: shows ${foreign.map((action) => `"${action}"`).join(", ")}; besides its line it holds only "${defaultMessages.insertExample}" (guide §13.5)`,
    );
  }
  return problems;
}

/** Guide §13.5: an empty file is a new diagram, never an invalid one (read-only with the status box). */
export function emptyNotInvalidProblems(state: ReadOnlyStateFacts): string[] {
  const problems: string[] = [];
  if (state.readOnly) {
    problems.push(
      "invalid file: the empty diagram is read-only (data-readonly); an empty file is a new diagram, not an invalid one (guide §13.5)",
    );
  }
  if (state.status?.visible) {
    problems.push(
      `invalid file: the status box shows "${state.status.text}" on the empty diagram; an empty file is a new diagram, not an invalid one (guide §5.12, §13.5)`,
    );
  }
  return problems;
}

export interface FirstElementFacts {
  /** The palette entry Enter was pressed on. */
  entry: string;
  before: readonly ShapeFacts[];
  after: readonly ShapeFacts[];
  /** The new element's own bounds (`elementBoundsProbe`); without them its visual box stands in. */
  bounds?: RelativeBox | null | undefined;
  hint: EmptyHintFacts;
  viewBefore: EmptyViewFacts;
  viewAfter: EmptyViewFacts;
  free: Rectangle;
}

/**
 * Guide §13.5: the hint goes with the first element; §5.5: Enter places it in the middle of the
 * free rectangle, where the hint stood; §5.9: an element created on the canvas never fits.
 */
export function firstElementProblems(facts: FirstElementFacts): string[] {
  const known = new Set(facts.before.map((shape) => shape.id));
  const added = facts.after.filter((shape) => !known.has(shape.id));
  const pressed = `Enter on palette entry "${facts.entry}"`;
  if (added.length === 0) {
    return [
      `first element: ${pressed} added no element, so the hint's leaving with the first element was not verified (guide §5.5)`,
    ];
  }
  if (added.length > 1) {
    return [
      `first element: ${pressed} added ${added.length} elements (${added.map((shape) => shape.id).join(", ")}), expected exactly one (guide §5.5)`,
    ];
  }
  const [shape] = added as [ShapeFacts];
  const problems: string[] = [];
  if (facts.hint.visible) {
    problems.push(
      `hint: still visible after ${pressed} placed "${shape.id}"; the hint goes with the first element (guide §13.5)`,
    );
  }
  if (
    facts.viewAfter.zoom !== facts.viewBefore.zoom ||
    !sameView(facts.viewAfter.view, facts.viewBefore.view)
  ) {
    problems.push(
      `view: placing the first element moved the view (${facts.viewBefore.zoom ?? "?"}% before, ${facts.viewAfter.zoom ?? "?"}% after); an element created on the canvas never fits (guide §5.9)`,
    );
  }
  const centre = centreOf(facts.bounds ?? shape.box);
  if (offCentre(centre, facts.free, FIRST_ELEMENT_TOLERANCE_PX)) {
    problems.push(
      `first element: "${shape.id}" is centred at ${at(centre)}, expected the middle of the free rectangle at ${at(freeCentre(facts.free))}, where the hint stood: Enter places it there while that spot is free (guide §5.5, §5.9)`,
    );
  }
  return problems;
}

export interface LastElementFacts {
  /** The element the case placed and then deleted. */
  id: string;
  /** Delete removed it from the canvas. */
  removed: boolean;
  hint: EmptyHintFacts;
  free: Rectangle;
}

/** Guide §8 (design system 1.23.0) and §13.5: deleting the last element empties the diagram again, and the hint returns. */
export function lastElementProblems(facts: LastElementFacts, host: ShellHost): string[] {
  if (!facts.removed) {
    return [
      `last element: Delete on the selected "${facts.id}" kept it, so the hint's return on an emptied diagram was not verified`,
    ];
  }
  return emptyHintProblems(facts.hint, facts.free, host).map(
    (problem) => `after Delete removed the last element: ${problem}`,
  );
}
