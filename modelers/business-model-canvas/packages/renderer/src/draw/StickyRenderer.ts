import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { append as svgAppend, attr as svgAttr, create as svgCreate } from "tiny-svg";
import { tapeColor, type Sticky } from "@miragon/business-model-canvas-schema-model";
import { isStickyShape, type StickyShape } from "../model/di-types.js";
import { COLORS, FONT, NOTE_FOLD, STICKY_PADDING, STICKY_RADIUS, STICKY_SHADOW } from "./styles.js";
import { fittedText } from "./text.js";

/** Above diagram-js's default renderer (1000). */
const RENDER_PRIORITY = 1500;
const SHADOW_FILTER_ID = "bmc-paper-shadow";
/** A strip of tape across the top edge, in the sticky's colour or plain. */
const TAPE = { width: 44, height: 12, overhang: 5, tilt: -2 } as const;
/** Every sticky leans the same slight way, rising from bottom left to top right, as if pinned up. */
const STICKY_LEAN = -1;
/** Every sticky's text sits in the same band under its tape, so a colour never resizes it. */
const TEXT_BAND = { top: 10, bottom: 6 } as const;
const SMALLEST_FONT_SIZE = 11;

type Attributes = Record<string, string | number>;

function create(tag: string, attributes: Attributes): SVGElement {
  return svgAttr(svgCreate(tag), attributes);
}

/** One filter in the canvas's defs, set as an attribute so exports carry it. */
function ensureShadowFilter(visuals: SVGElement): boolean {
  const svg = visuals.closest("svg");
  if (!svg) return false;
  if (svg.querySelector(`#${SHADOW_FILTER_ID}`)) return true;
  const filter = create("filter", {
    id: SHADOW_FILTER_ID,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "160%",
  });
  filter.innerHTML =
    `<feDropShadow dx="0" dy="1" stdDeviation="0.5" flood-color="${STICKY_SHADOW.color}" flood-opacity="${STICKY_SHADOW.near}"/>` +
    `<feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="${STICKY_SHADOW.color}" flood-opacity="${STICKY_SHADOW.far}"/>`;
  const defs = svgCreate("defs");
  svgAppend(defs, filter);
  svg.insertBefore(defs, svg.firstChild);
  return true;
}

/** The paper's outline; a sticky with a note has its bottom right corner folded down. */
function paperPath(width: number, height: number, folded: boolean): string {
  const r = STICKY_RADIUS;
  const bottomRight = folded
    ? `V${height - NOTE_FOLD}L${width - NOTE_FOLD},${height}`
    : `V${height - r}a${r},${r} 0 0 1 ${-r},${r}`;
  return (
    `M${r},0H${width - r}a${r},${r} 0 0 1 ${r},${r}${bottomRight}` +
    `H${r}a${r},${r} 0 0 1 ${-r},${-r}V${r}a${r},${r} 0 0 1 ${r},${-r}Z`
  );
}

/** The full text and the notes of a sticky, for the hover tooltip and an exported `<title>`. */
function stickyDescription(sticky: Sticky): string {
  return [sticky.text, ...sticky.notes.map((note) => note.text)]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * A sticky is a white paper note. Its colour, when it has one, shows as tape across the top edge;
 * its notes as the folded bottom right corner.
 */
export default class StickyRenderer extends BaseRenderer {
  static $inject = ["eventBus"];

  constructor(eventBus: EventBus) {
    super(eventBus, RENDER_PRIORITY);
  }

  override canRender(element: Element): boolean {
    return isStickyShape(element);
  }

  override drawShape(visuals: SVGElement, element: Shape): SVGElement {
    const shape = element as StickyShape;
    const { sticky } = shape;
    const folded = sticky.notes.length > 0;
    const paper = create("path", {
      d: paperPath(shape.width, shape.height, folded),
      fill: COLORS.plot,
      stroke: "none",
    });
    if (ensureShadowFilter(visuals)) svgAttr(paper, { filter: `url(#${SHADOW_FILTER_ID})` });
    svgAppend(visuals, paper);
    if (folded) {
      const [right, bottom] = [shape.width, shape.height];
      svgAppend(
        visuals,
        create("path", {
          class: "bmc-note-fold",
          d: `M${right},${bottom - NOTE_FOLD}L${right - NOTE_FOLD},${bottom - NOTE_FOLD}L${right - NOTE_FOLD},${bottom}Z`,
          fill: COLORS.line,
          stroke: COLORS.outline,
          "stroke-width": 1,
          "stroke-linejoin": "round",
        }),
      );
    }
    this.drawTape(visuals, shape, tapeColor(sticky.color));
    const truncated = this.drawText(visuals, shape);
    svgAttr(visuals, {
      transform: `rotate(${STICKY_LEAN} ${shape.width / 2} ${shape.height / 2})`,
    });
    svgAttr(visuals, { "data-bmc-description": stickyDescription(sticky) });
    if (truncated || folded) {
      svgAttr(visuals, { "data-bmc-tooltip": "true" });
    } else visuals.removeAttribute("data-bmc-tooltip");
    return paper;
  }

  /** Coloured tape carries the sticky's colour; plain tape only holds it up. */
  private drawTape(visuals: SVGElement, shape: StickyShape, tape: string | undefined): void {
    const strip = create("rect", {
      class: tape ? "bmc-tape" : "bmc-tape-plain",
      x: -TAPE.width / 2,
      y: -TAPE.overhang,
      width: TAPE.width,
      height: TAPE.height,
      fill: tape ?? COLORS.line,
      transform: `translate(${shape.width / 2}, 0) rotate(${TAPE.tilt})`,
    });
    svgAppend(visuals, strip);
  }

  /** Whether the text did not fit and ends in an ellipsis. */
  private drawText(visuals: SVGElement, shape: StickyShape): boolean {
    if (shape.sticky.text === "") return false;
    const { element, truncated } = fittedText(shape.sticky.text, {
      box: { width: shape.width, height: shape.height - TEXT_BAND.top - TEXT_BAND.bottom },
      align: "center-middle",
      fontSize: FONT.sticky,
      smallestFontSize: SMALLEST_FONT_SIZE,
      fontWeight: 500,
      fill: COLORS.ink,
      padding: STICKY_PADDING,
      verticalPadding: 0,
    });
    svgAttr(element, { transform: `translate(0, ${TEXT_BAND.top})` });
    svgAppend(visuals, element);
    return truncated;
  }

  override getShapePath(shape: Shape): string {
    const { x, y, width, height } = shape;
    return `M${x},${y}h${width}v${height}h${-width}z`;
  }
}
