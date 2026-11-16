/**
 * The arm rules as pure functions: which zoom a node is armed at, where the board has to stand so
 * that the node is in the window, and how a move between two viewports runs. No DOM, no React
 * Flow, no clock: the board's arming feeds them and moves the board.
 *
 * A model on a board is shown as a preview, scaled with the board, and edited when it is ARMED:
 * exactly one node at a time takes input. Three rules say how:
 *
 *   armzoom    off | min1 | exact1   the board zoom a node is armed at
 *   armedzoom  free | disarm | lock  what a zoom of the board does while a node is armed
 *   armreturn  stay | back           whether Done and a click on the bare board bring the board back
 *
 * The default is exact1, disarm, stay: a model is edited at board zoom exactly 1, the one state
 * every embedded editor is built for (its pointer math, its popups, an HTML view that keeps 100 %
 * while its preview is scaled). Detail zoom is the editor's own zoom. The other values are what
 * the rule was measured against.
 */
import type { Box, Point } from "@miragon/board-schema-model";
import type { ArmAnchor, ArmedZoom, ArmReturn, ArmZoom, Viewport } from "./types.js";

/**
 * A board zoom this close to 1 counts as 1. A fit lands on values such as 0.9973 or 1.0004, and an
 * editor armed there differs from one armed at 1 in nothing a person chose: within 1 % an
 * 800 x 540 node is at most 8 x 5.4 px larger or smaller. But only at exactly 1 an HTML view (the
 * decision table keeps 100 % while its preview is scaled by the board) is its preview pixel for
 * pixel, and the host needs no snapping to device px. The smallest step a person makes on purpose
 * is far outside: 1.149 for one wheel notch, 1.2 for a toolbar step.
 */
export const ARM_ZOOM_TOLERANCE = 0.01;

/** px between the armed node and the edge of the box it is brought into: room for the selection ring and the resize handles */
export const ARM_MARGIN = 24;

/** a node that sticks out by less than this is in: a target is rounded to whole px, and a second look must not move it again */
const EDGE_SLACK = 0.5;

export interface ArmRuleSet {
  armzoom: ArmZoom;
  armedzoom: ArmedZoom;
  armreturn: ArmReturn;
}

/** the rules of a board whose host names none: a model is edited at board zoom exactly 1 */
export const DEFAULT_RULES: ArmRuleSet = {
  armzoom: "exact1",
  armedzoom: "disarm",
  armreturn: "stay",
};

/** the rules in effect: each one as the host gave it, else the default */
export function resolveRules(given: {
  [K in keyof ArmRuleSet]?: ArmRuleSet[K] | null | undefined;
}): ArmRuleSet {
  return {
    armzoom: given.armzoom ?? DEFAULT_RULES.armzoom,
    armedzoom: given.armedzoom ?? DEFAULT_RULES.armedzoom,
    armreturn: given.armreturn ?? DEFAULT_RULES.armreturn,
  };
}

/** the board zoom the rule arms at, coming from `zoom` */
export function targetZoom(zoom: number, rule: ArmZoom, tolerance = ARM_ZOOM_TOLERANCE): number {
  if (rule === "off") return zoom;
  if (rule === "exact1") return 1;
  // min1: anything below 1 goes up to 1, and what is nearly 1 from above becomes exactly 1
  return zoom <= 1 + tolerance ? 1 : zoom;
}

export interface ArmPlacement {
  /** where the board stands */
  viewport: Viewport;
  /** the node's whole wrapper (header and body) in flow units, absolute */
  node: Box;
  /** what a node may use of the board, in px of the board's own box: the box without the toolbar's band */
  box: Box;
  /** px of the board's own box: the point that keeps its place while the zoom changes (the pointer, or the node's centre) */
  anchor: Point;
  /**
   * What the anchor is (default centre). It decides the axis on which the wrapper is longer than
   * the box, and it belongs to the ARMING, not to one look: a second look at a node the pointer
   * placed is taken with pointer again, whatever point it is given.
   */
  anchorKind?: ArmAnchor;
  rule: ArmZoom;
  margin?: number;
  tolerance?: number;
}

/**
 * The shift that brings the stretch [start, start + size] into [low, low + span].
 * A stretch that fits: the least shift that puts all of it inside.
 * A stretch longer than the span, by the kind of anchor:
 *   centre   its start goes to `low`, wherever it lies;
 *   pointer  the least shift that leaves no gap: a start beyond `low` goes to it, an end short of
 *            the span's end goes to that end, and a stretch that covers the span is not moved.
 */
function shiftInto(
  start: number,
  size: number,
  low: number,
  span: number,
  anchorKind: ArmAnchor,
): number {
  if (size > span) {
    if (anchorKind === "centre") return Math.abs(start - low) <= EDGE_SLACK ? 0 : low - start;
    if (start > low + EDGE_SLACK) return low - start;
    const short = low + span - (start + size);
    return short > EDGE_SLACK ? short : 0;
  }
  if (start < low - EDGE_SLACK) return low - start;
  const over = start + size - (low + span);
  return over > EDGE_SLACK ? -over : 0;
}

/**
 * The viewport the node is armed at. The rule's zoom is applied about the anchor, then the board
 * is shifted per axis, and the zoom is never lowered to make a node fit.
 *
 * An axis on which the wrapper fits the box minus the margin: the least shift that puts the whole
 * wrapper inside.
 *
 * An axis on which the wrapper is longer than that, by the kind of anchor:
 * - centre (Edit, the keyboard, the hook, the URL): its start goes to the margin, so that the
 *   header's left end and the palette are in reach.
 * - pointer (the double-click): the least shift that leaves no gap between the wrapper and the
 *   box's margins. A wrapper that covers the box on that axis is not moved, so the point a person
 *   double-clicked stays under the pointer. Round 5 measured the rule before it (the start always
 *   to the margin): the double-clicked point moved 647 to 1811 px, once out of the board (README,
 *   section 12). The header may then lie outside the board: the way out is the board's own Done
 *   control (toolbar.tsx), which is in reach wherever the node lies.
 *
 * `off` returns the viewport as it is (the same object): arming moves nothing. So does every
 * rule when nothing has to change. A viewport that does change is rounded to whole px, so that a
 * preview and its armed editor lie on the same px.
 */
export function armViewport(placement: ArmPlacement): Viewport {
  const { viewport, node, box, anchor, rule } = placement;
  if (rule === "off") return viewport;
  const margin = placement.margin ?? ARM_MARGIN;
  const anchorKind = placement.anchorKind ?? "centre";
  const zoom = targetZoom(viewport.zoom, rule, placement.tolerance);
  // the flow point under the anchor stays under it; no arithmetic when the zoom stays, so nothing drifts
  const zoomed =
    zoom === viewport.zoom
      ? { x: viewport.x, y: viewport.y }
      : {
          x: anchor.x - ((anchor.x - viewport.x) / viewport.zoom) * zoom,
          y: anchor.y - ((anchor.y - viewport.y) / viewport.zoom) * zoom,
        };
  const [low, span] = [
    { x: box.x + margin, y: box.y + margin },
    { x: box.width - 2 * margin, y: box.height - 2 * margin },
  ];
  const dx = shiftInto(zoomed.x + node.x * zoom, node.width * zoom, low.x, span.x, anchorKind);
  const dy = shiftInto(zoomed.y + node.y * zoom, node.height * zoom, low.y, span.y, anchorKind);
  if (zoom === viewport.zoom && dx === 0 && dy === 0) return viewport;
  return { x: Math.round(zoomed.x + dx), y: Math.round(zoomed.y + dy), zoom };
}

export const sameViewport = (a: Viewport, b: Viewport): boolean =>
  a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/** the viewport at `t` of the way (0 to 1): linear in x, y and zoom, so a point that ends where it began never moves */
export function viewportBetween(from: Viewport, to: Viewport, t: number): Viewport {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  };
}

/**
 * Whether a wheel event changes the board zoom, as d3-zoom decides it (the zoom is multiplied by
 * 2 ^ (-deltaY x a positive factor) and kept inside the board's range): a wheel with no vertical
 * part, or one that pushes against the end of the range, changes nothing and starts no gesture.
 */
export function wheelChangesZoom(
  zoom: number,
  deltaY: number,
  minZoom: number,
  maxZoom: number,
): boolean {
  if (deltaY < 0) return zoom < maxZoom;
  if (deltaY > 0) return zoom > minZoom;
  return false;
}

// ── motion, read from the design tokens ──────────────────────────────────────

/** a CSS time ("250ms", "0.25s", "0") in ms; null for anything else */
export function parseDuration(token: string): number | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(ms|s)?$/.exec(token.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2] === "s" ? value * 1000 : value;
}

/** the timing function cubic-bezier(x1, y1, x2, y2) as CSS defines it: progress 0 to 1 in, eased value out */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const curve = (a: number, b: number, s: number): number =>
    3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // x is monotonic for x1 and x2 inside 0 to 1: bisect for the curve parameter at x = t
    let [low, high] = [0, 1];
    for (let round = 0; round < 40; round++) {
      const middle = (low + high) / 2;
      if (curve(x1, x2, middle) < t) low = middle;
      else high = middle;
    }
    return curve(y1, y2, (low + high) / 2);
  };
}

const linear = (t: number): number => Math.min(1, Math.max(0, t));

/** a CSS easing token as a function; anything but a cubic-bezier() with x inside 0 to 1 eases linearly */
export function parseEase(token: string): (t: number) => number {
  const match = /^cubic-bezier\(([^)]*)\)$/.exec(token.trim());
  if (!match) return linear;
  const parts = (match[1] ?? "").split(",").map((part) => Number(part.trim()));
  const [x1, y1, x2, y2] = parts;
  if (
    parts.length !== 4 ||
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  )
    return linear;
  if (!parts.every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return linear;
  return cubicBezier(x1, y1, x2, y2);
}
