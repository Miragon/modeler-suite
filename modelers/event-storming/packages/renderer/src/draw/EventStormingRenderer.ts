import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { append as svgAppend, create as svgCreate, attr as svgAttr } from "tiny-svg";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { ElementLike, ShapeLike, ConnectionLike } from "diagram-js/lib/model/Types";
import type { Point } from "diagram-js/lib/util/Types";
import {
  COLORS,
  DRAWING_INK,
  FONT,
  NOTE_BULLET_INDENT,
  NOTE_STYLE,
  PROVISIONAL_STICKY,
  STICKY_CHAR_WIDTH,
  STICKY_LINE_HEIGHT,
  STICKY_PADDING,
  STICKY_RADIUS,
  STICKY_SHADOW,
  STICKY_STYLES,
} from "./styles.js";
import { strokeNeedsUnderlayOnDark, textColorOn } from "./contrast.js";
import {
  ARROWHEAD_CLASS,
  CANVAS_ROLE,
  UNDERLAY_EXTRA_WIDTH,
  withCanvasRoles,
} from "../theme/canvas-roles.js";
import { parseNoteMarkdown, type NoteLine, type NoteRun } from "./note-markdown.js";
import {
  HOTSPOT_ROTATION_DEG,
  LINK_LABEL_FONT_SIZE,
  LINK_LABEL_TEXT_RENDERING,
  connectionEndpoints,
  linkLabelAnchor,
} from "./extent.js";
import {
  isEventStormingConnection,
  isEventStormingShape,
  isStickyKind,
  type EventStormingConnection,
  type EventStormingShape,
} from "../model/di-types.js";
import type EventStormingViewOptions from "../view-options/EventStormingViewOptions.js";

/** BaseRenderer default is 1000; 1500 wins the render.shape/render.connection event. */
const RENDER_PRIORITY = 1500;

const DRAWING_STROKE_WIDTH = 2;

/** Class of the small kind caption at a sticky's bottom (selector contract for tests/e2e). */
export const KIND_CAPTION_CLASS = "event-storming-kind-caption";

/**
 * Caption typography: small and light so it never competes with the user's label. The colour is
 * the label's — a grey would fall below 4.5:1 on the hotspot fill; the weight sets it apart.
 */
const CAPTION_FONT_SIZE = 9;
const CAPTION_FONT_WEIGHT = 300;
/** Caption baseline sits this many px above the sticky's bottom edge. */
const CAPTION_BOTTOM_OFFSET = 7;

/** Soft drop shadow that makes stickies read as paper on the board (defs id, per canvas SVG). */
export const STICKY_SHADOW_FILTER_ID = "event-storming-sticky-shadow";

/**
 * Installs the shadow filter into the owning SVG's defs (once per SVG — the export clones the
 * whole SVG, so the defs travel into saved files). Returns false while the visual group is not
 * attached yet: a `filter="url(#…)"` pointing at a missing def would make the element invisible,
 * so callers must only reference the filter when this succeeded.
 */
function ensureStickyShadowFilter(visuals: SVGElement): boolean {
  const svg = visuals.closest("svg");
  if (!svg) return false;
  if (svg.querySelector(`#${STICKY_SHADOW_FILTER_ID}`)) return true;
  const drop = svgAttr(svgCreate("feDropShadow"), {
    dx: 0,
    dy: STICKY_SHADOW.dy,
    stdDeviation: STICKY_SHADOW.blur,
    "flood-color": STICKY_SHADOW.color,
    "flood-opacity": STICKY_SHADOW.opacity,
  });
  // Widened filter region: the default -10%/120% box would clip the soft blur below the sticky.
  const filter = svgAttr(svgCreate("filter"), {
    id: STICKY_SHADOW_FILTER_ID,
    x: "-40%",
    y: "-40%",
    width: "180%",
    height: "180%",
  });
  svgAppend(filter, drop);
  const defs = svgCreate("defs");
  svgAppend(defs, filter);
  svg.insertBefore(defs, svg.firstChild);
  return true;
}

type Attrs = Record<string, string | number>;

export default class EventStormingRenderer extends BaseRenderer {
  static $inject = ["eventBus", "eventStormingViewOptions"];

  constructor(
    eventBus: EventBus,
    private readonly viewOptions: EventStormingViewOptions,
  ) {
    super(eventBus, RENDER_PRIORITY);
  }

  override canRender(element: ElementLike): boolean {
    return isEventStormingShape(element) || isEventStormingConnection(element);
  }

  override drawShape(visuals: SVGElement, element: ShapeLike): SVGElement {
    const shape = element as unknown as EventStormingShape;
    if (shape.eventStormingType === "drawing") return this.drawDrawing(visuals, shape);
    return this.drawSticky(visuals, shape);
  }

  /**
   * Freeform drawing: polyline/polygon from relative points (see EventStormingDrawTool). The
   * default ink follows the text role; a colour the user set stays as stored and, where it falls
   * below 3:1 on the dark plot, lies on an underlay that only a dark carrier shows (guide §10.6).
   */
  private drawDrawing(visuals: SVGElement, shape: EventStormingShape): SVGElement {
    const pts = shape.drawingPoints ?? [];
    const dash =
      shape.strokeStyle === "dashed" ? "8 5" : shape.strokeStyle === "dotted" ? "2 4" : undefined;
    const line = (stroke: string, width: number): SVGElement =>
      svgAttr(svgCreate(shape.closed ? "polygon" : "polyline"), {
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
        fill: "none",
        stroke,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...(dash ? { "stroke-dasharray": dash } : {}),
      });
    if (!shape.color) {
      const path = withCanvasRoles(line(DRAWING_INK, DRAWING_STROKE_WIDTH), CANVAS_ROLE.strokeText);
      svgAppend(visuals, path);
      return path;
    }
    if (strokeNeedsUnderlayOnDark(shape.color)) {
      const underlay = line("none", DRAWING_STROKE_WIDTH + UNDERLAY_EXTRA_WIDTH);
      svgAppend(visuals, withCanvasRoles(underlay, CANVAS_ROLE.underlay));
    }
    const path = line(shape.color, DRAWING_STROKE_WIDTH);
    svgAppend(visuals, path);
    return path;
  }

  /**
   * Every sticky (and the free note) is a rounded rectangle with centered, wrapped text inside —
   * the label lives IN the sticky, never beside it. A user-picked `color` overrides the kind's
   * fill and turns the text black or white, whichever reads better on it; the border stays the
   * kind's own (so the type remains recognizable). A sticky is paper on the board: its fill,
   * border and text look the same on a dark board (guide §10.6), so it takes no canvas class.
   */
  private drawSticky(visuals: SVGElement, shape: EventStormingShape): SVGElement {
    const kind = shape.eventStormingType;
    const style = isStickyKind(kind) ? STICKY_STYLES[kind] : NOTE_STYLE;
    // A provisional (blank append) sticky renders as a neutral dashed shell — its placeholder
    // kind must not leak: no kind colors, no caption, no text (the label is empty anyway).
    const provisional = shape.provisional === true;

    // Hotspots are tilted like a hastily slapped-on sticky; rotate the whole visual group
    // around the center so rect and text stay together.
    let parent = visuals;
    if (kind === "hotspot") {
      const group = svgAttr(svgCreate("g"), {
        transform: `rotate(${HOTSPOT_ROTATION_DEG} ${shape.width / 2} ${shape.height / 2})`,
      });
      svgAppend(visuals, group);
      parent = group;
    }

    const fill = shape.color ?? style.fill;
    const rect = svgAttr(svgCreate("rect"), {
      x: 0,
      y: 0,
      width: Math.max(shape.width, 1),
      height: Math.max(shape.height, 1),
      rx: STICKY_RADIUS,
      fill: provisional ? PROVISIONAL_STICKY.fill : fill,
      stroke: provisional ? PROVISIONAL_STICKY.stroke : style.stroke,
      "stroke-width": 1.5,
      ...(provisional ? { "stroke-dasharray": PROVISIONAL_STICKY.dash } : {}),
    });
    // Attribute (not tiny-svg attr, which routes `filter` into inline style) so exports carry it.
    if (ensureStickyShadowFilter(visuals)) {
      rect.setAttribute("filter", `url(#${STICKY_SHADOW_FILTER_ID})`);
    }
    svgAppend(parent, rect);

    if (provisional) return rect;

    const textColor = textColorOn(fill);
    if (kind === "note") drawNoteText(parent, shape, textColor);
    else drawStickyText(parent, shape, textColor);

    // Small kind caption at the bottom — the 8 sticky kinds only (a note explains itself,
    // drawings never reach this method). Appended to `parent` so it tilts with a hotspot.
    if (isStickyKind(kind) && this.viewOptions.typeCaptionsVisible()) {
      const caption = label(
        STICKY_STYLES[kind].label,
        shape.width / 2,
        shape.height - CAPTION_BOTTOM_OFFSET,
        {
          "text-anchor": "middle",
          "font-size": CAPTION_FONT_SIZE,
          fill: textColor,
        },
      );
      // Plain attributes (tiny-svg attr routes `font-weight` into inline style): the class is
      // the test/e2e selector contract, and exports must carry both as-is.
      caption.setAttribute("class", KIND_CAPTION_CLASS);
      caption.setAttribute("font-weight", String(CAPTION_FONT_WEIGHT));
      svgAppend(parent, caption);
    }
    return rect;
  }

  override drawConnection(visuals: SVGElement, element: ConnectionLike): SVGElement {
    const conn = element as unknown as EventStormingConnection;
    const [start, end] = connectionEndpoints(conn);

    const path = withCanvasRoles(
      svgAttr(svgCreate("polyline"), {
        points: `${start.x},${start.y} ${end.x},${end.y}`,
        fill: "none",
        stroke: COLORS.arrow,
        "stroke-width": 1.5,
        "stroke-linecap": "round",
      }),
      CANVAS_ROLE.strokeKontur,
    );
    svgAppend(visuals, path);
    svgAppend(
      visuals,
      withCanvasRoles(connectionArrow(start, end, COLORS.arrow, 11, 5), ARROWHEAD_CLASS),
    );

    // Arrow annotation (`; …`) at the midpoint.
    if (conn.linkLabel) {
      const anchor = linkLabelAnchor(conn);
      svgAppend(
        visuals,
        withCanvasRoles(
          label(conn.linkLabel, anchor.x, anchor.y, {
            "text-anchor": "middle",
            "font-size": LINK_LABEL_FONT_SIZE,
            "font-style": "italic",
            "text-rendering": LINK_LABEL_TEXT_RENDERING,
            fill: COLORS.inkSoft,
          }),
          CANVAS_ROLE.fillTextLeise,
        ),
      );
    }
    return path;
  }

  override getShapePath(shape: ShapeLike): string {
    const { x, y, width, height } = shape;
    return `M${x},${y}l${width},0l0,${height}l${-width},0z`;
  }

  override getConnectionPath(connection: ConnectionLike): string {
    const [first, ...rest] = connection.waypoints;
    if (!first) return "";
    return `M${first.x},${first.y}` + rest.map((p: Point) => `L${p.x},${p.y}`).join("");
  }
}

/** Word-wraps one paragraph to `maxChars` (estimated monospace-ish width, like noteMetrics). */
function wrapParagraph(paragraph: string, maxChars: number): string[] {
  const words = paragraph.split(/\s+/).filter((w) => w.length);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    // Hard-break unbreakable over-long words (e.g. PascalCase identifiers) into maxChars chunks —
    // an over-wide single line would spill outside the fixed sticky box.
    if (word.length > maxChars) {
      if (current) lines.push(current);
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Centered multi-line text inside the sticky: explicit line breaks are honored, long lines are
 * word-wrapped into the padded box, and overflowing lines are clipped (fixed-size stickies never
 * grow). Notes render via `drawNoteText` instead.
 */
function drawStickyText(parent: SVGElement, shape: EventStormingShape, color: string): void {
  const innerWidth = shape.width - 2 * STICKY_PADDING;
  const maxChars = Math.max(1, Math.floor(innerWidth / STICKY_CHAR_WIDTH));
  const maxLines = Math.max(
    1,
    Math.floor((shape.height - 2 * STICKY_PADDING) / STICKY_LINE_HEIGHT),
  );

  const lines = (shape.eventStormingLabel ?? "")
    .split("\n")
    .flatMap((paragraph) => wrapParagraph(paragraph, maxChars))
    .slice(0, maxLines);

  const cx = shape.width / 2;
  // Center the block of lines vertically in the box (+4 ~ baseline offset for 13px).
  const y0 = shape.height / 2 - ((lines.length - 1) * STICKY_LINE_HEIGHT) / 2 + 4;
  lines.forEach((line, i) => {
    svgAppend(
      parent,
      label(line, cx, y0 + i * STICKY_LINE_HEIGHT, {
        "text-anchor": "middle",
        fill: color,
      }),
    );
  });
}

/**
 * Chars the '• ' prefix occupies in the estimate — matches `plainNoteText`, so the wrap budget
 * stays consistent with the `noteMetrics` box.
 */
const BULLET_PREFIX_CHARS = 2;

/**
 * Baseline offset within a line row — chosen so a middle-anchored block sits exactly where the
 * old centered note layout put it (`height/2 - (n-1)*LH/2 + 4`).
 */
const NOTE_ROW_BASELINE = STICKY_LINE_HEIGHT / 2 + 4;

interface NoteRow {
  readonly runs: NoteRun[];
  /** First row of a bullet line — rendered with the leading '• ' marker. */
  readonly marker: boolean;
  /** Wrapped continuation row of a bullet line — keeps the hanging indent (left alignment). */
  readonly indent: boolean;
}

/**
 * Note text is a small document, not a centered label: markdown runs (bold/italic tspans) and
 * bullet lines with a '•' hanging indent, laid out per the note's alignment — horizontal per
 * line (anchor at padding / center / width-minus-padding), vertical anchoring the whole block
 * top/middle/bottom inside `STICKY_PADDING`. Defaults: left/top. Wrapping (hand-shrunken boxes)
 * splits runs at the wrap point so styling survives; overflowing rows are clipped like stickies.
 */
function drawNoteText(parent: SVGElement, shape: EventStormingShape, color: string): void {
  const innerWidth = shape.width - 2 * STICKY_PADDING;
  const maxChars = Math.max(1, Math.floor(innerWidth / STICKY_CHAR_WIDTH));
  const maxLines = Math.max(
    1,
    Math.floor((shape.height - 2 * STICKY_PADDING) / STICKY_LINE_HEIGHT),
  );

  const rows = parseNoteMarkdown(shape.eventStormingLabel ?? "")
    .flatMap((line) => wrapNoteLine(line, maxChars))
    .slice(0, maxLines);

  const horizontal = shape.alignHorizontal ?? "left";
  const vertical = shape.alignVertical ?? "top";
  const anchor = horizontal === "left" ? "start" : horizontal === "center" ? "middle" : "end";
  const blockHeight = rows.length * STICKY_LINE_HEIGHT;
  const blockTop =
    vertical === "top"
      ? STICKY_PADDING
      : vertical === "middle"
        ? (shape.height - blockHeight) / 2
        : shape.height - STICKY_PADDING - blockHeight;

  rows.forEach((row, i) => {
    // The hanging indent only exists as an x-offset when lines share a left edge; centered/right
    // rows are anchored like any other line (the '• ' marker still sticks to its row's start).
    const x =
      horizontal === "left"
        ? STICKY_PADDING + (row.indent ? NOTE_BULLET_INDENT : 0)
        : horizontal === "center"
          ? shape.width / 2
          : shape.width - STICKY_PADDING;
    const text = svgAttr(svgCreate("text"), {
      x,
      y: blockTop + i * STICKY_LINE_HEIGHT + NOTE_ROW_BASELINE,
      "font-family": FONT.family,
      "font-size": FONT.label,
      fill: color,
      "text-anchor": anchor,
    });
    const runs: NoteRun[] = row.marker
      ? [{ text: "• ", bold: false, italic: false }, ...row.runs]
      : row.runs;
    for (const run of runs) {
      const tspan = svgCreate("tspan");
      tspan.textContent = run.text;
      // Plain attributes (like the kind caption): exports and e2e selectors see them directly.
      if (run.bold) tspan.setAttribute("font-weight", "600");
      if (run.italic) tspan.setAttribute("font-style", "italic");
      svgAppend(text, tspan);
    }
    svgAppend(parent, text);
  });
}

/** Wraps one markdown line into rows; bullet rows reserve the '• ' prefix in their budget. */
function wrapNoteLine(line: NoteLine, maxChars: number): NoteRow[] {
  const budget = Math.max(1, maxChars - (line.bullet ? BULLET_PREFIX_CHARS : 0));
  return wrapRuns(line.runs, budget).map((runs, i) => ({
    runs,
    marker: line.bullet && i === 0,
    indent: line.bullet && i > 0,
  }));
}

/**
 * Word-wraps styled runs by wrapping their concatenated plain text into index ranges and
 * slicing the runs along them — a run split by the wrap point keeps its styling on both rows.
 * A line that fits stays verbatim (auto-sized boxes always hit this path via noteMetrics).
 */
function wrapRuns(runs: NoteRun[], maxChars: number): NoteRun[][] {
  const plain = runs.map((run) => run.text).join("");
  if (plain.length <= maxChars) return [runs];
  return wrapRanges(plain, maxChars).map(([start, end]) => sliceRuns(runs, start, end));
}

/**
 * Greedy word wrap as index ranges over the original string (same semantics as
 * `wrapParagraph`, incl. hard-breaking over-long words) — whitespace only collapses AT the
 * wrap points, so run offsets stay valid.
 */
function wrapRanges(plain: string, maxChars: number): Array<[number, number]> {
  const words = [...plain.matchAll(/\S+/g)];
  if (!words.length) return [[0, 0]];
  const rows: Array<[number, number]> = [];
  let start = -1;
  let end = -1;
  const flush = () => {
    if (start >= 0) rows.push([start, end]);
    start = end = -1;
  };
  for (const match of words) {
    let wordStart = match.index;
    const wordEnd = wordStart + match[0].length;
    if (match[0].length > maxChars) {
      flush();
      while (wordEnd - wordStart > maxChars) {
        rows.push([wordStart, wordStart + maxChars]);
        wordStart += maxChars;
      }
      start = wordStart;
      end = wordEnd;
      continue;
    }
    if (start < 0 || wordEnd - start <= maxChars) {
      if (start < 0) start = wordStart;
      end = wordEnd;
      continue;
    }
    flush();
    start = wordStart;
    end = wordEnd;
  }
  flush();
  return rows;
}

/** The runs overlapping [start, end) of the concatenated plain text, cut at the boundaries. */
function sliceRuns(runs: NoteRun[], start: number, end: number): NoteRun[] {
  const out: NoteRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runStart = offset;
    offset += run.text.length;
    const from = Math.max(start, runStart);
    const to = Math.min(end, offset);
    if (from >= to) continue;
    out.push({
      text: run.text.slice(from - runStart, to - runStart),
      bold: run.bold,
      italic: run.italic,
    });
  }
  return out;
}

function label(content: string, x: number, y: number, attrs: Attrs = {}): SVGElement {
  const el = svgAttr(svgCreate("text"), {
    x,
    y,
    "font-family": FONT.family,
    "font-size": FONT.label,
    fill: COLORS.ink,
    ...attrs,
  });
  el.textContent = content;
  return el;
}

function connectionArrow(from: Point, to: Point, color: string, len = 10, w = 5): SVGElement {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const bx = to.x - len * Math.cos(angle);
  const by = to.y - len * Math.sin(angle);
  const points =
    `${to.x},${to.y} ` +
    `${bx - w * Math.sin(angle)},${by + w * Math.cos(angle)} ` +
    `${bx + w * Math.sin(angle)},${by - w * Math.cos(angle)}`;
  return svgAttr(svgCreate("polygon"), { points, fill: color });
}
