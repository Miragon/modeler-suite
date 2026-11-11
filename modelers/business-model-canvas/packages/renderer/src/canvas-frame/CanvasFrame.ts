import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import {
  append as svgAppend,
  attr as svgAttr,
  classes as svgClasses,
  clear as svgClear,
  create as svgCreate,
} from "tiny-svg";
import {
  BLOCK_HEADING_HEIGHT,
  BLOCK_PADDING,
  BLOCK_TITLES,
  blockOf,
  stickiesOf,
  titleOf,
  type BlockLayout,
  type CanvasDocument,
  type CanvasLayout,
  type Rect,
} from "@miragon/business-model-canvas-schema-model";
import { documentOf } from "../io/documentOf.js";
import { layoutOf } from "../io/layoutOf.js";
import {
  BLOCK_INSET,
  BLOCK_RADIUS,
  COLORS,
  FONT,
  SHEET_MARGIN,
  SHEET_RADIUS,
  STICKY_SHADOW,
} from "../draw/styles.js";
import { fittedText } from "../draw/text.js";
import { BLOCK_HINTS } from "./hints.js";

const FRAME_LAYER = "bmc-frame";
const BELOW_ELEMENTS = -1;
const SHEET_SHADOW_ID = "bmc-sheet-shadow";

/** Marks the header's title, so the canvas can open it to edit. */
export const TITLE_MARKER = "bmc-canvas-title";

export const ATTRIBUTION =
  "The Business Model Canvas by Strategyzer AG, strategyzer.com, CC BY-SA 3.0";

type Attributes = Record<string, string | number>;

function element(tag: string, attributes: Attributes, ...classNames: string[]): SVGElement {
  const created = svgAttr(svgCreate(tag), attributes);
  for (const name of classNames) svgClasses(created).add(name);
  return created;
}

function text(content: string, attributes: Attributes, ...classNames: string[]): SVGElement {
  const created = element(
    "text",
    { "font-family": FONT.family, fill: COLORS.ink, ...attributes },
    ...classNames,
  );
  created.textContent = content;
  return created;
}

function translated(child: SVGElement, x: number, y: number): SVGElement {
  const group = element("g", { transform: `translate(${x}, ${y})` });
  svgAppend(group, child);
  return group;
}

/** One soft shadow under the sheet, in the canvas's defs so exports carry it. */
function ensureSheetShadow(layer: SVGElement): void {
  const svg = layer.closest("svg");
  if (!svg || svg.querySelector(`#${SHEET_SHADOW_ID}`)) return;
  const filter = element("filter", {
    id: SHEET_SHADOW_ID,
    x: "-5%",
    y: "-5%",
    width: "110%",
    height: "110%",
  });
  filter.innerHTML = `<feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="${STICKY_SHADOW.color}" flood-opacity="${STICKY_SHADOW.near}"/>`;
  const defs = svgCreate("defs");
  svgAppend(defs, filter);
  svg.insertBefore(defs, svg.firstChild);
}

/**
 * A white sheet with the nine blocks on it as grey rounded fields, the header band above and the
 * attribution below: a background layer under the elements, drawn again with every document
 * change, never selectable.
 */
export default class CanvasFrame {
  static $inject = ["canvas", "eventBus", "elementRegistry"];

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
  ) {
    eventBus.on("elements.changed", () => this.render());
  }

  render(): void {
    const layer = this.canvas.getLayer(FRAME_LAYER, BELOW_ELEMENTS);
    svgClear(layer);
    const document = documentOf(this.elementRegistry);
    if (!document) return;
    const layout = layoutOf(document);
    this.drawHeader(layer, document, layout.header);
    this.drawSheet(layer, layout);
    for (const block of layout.blocks) this.drawBlock(layer, document, block);
    this.drawFooter(layer, layout);
  }

  private drawBlock(layer: SVGElement, document: CanvasDocument, block: BlockLayout): void {
    const { rect } = block;
    svgAppend(
      layer,
      element(
        "rect",
        {
          x: rect.x + BLOCK_INSET,
          y: rect.y + BLOCK_INSET,
          width: rect.width - 2 * BLOCK_INSET,
          height: rect.height - 2 * BLOCK_INSET,
          rx: BLOCK_RADIUS,
          fill: COLORS.surround,
        },
        "bmc-block",
      ),
    );
    svgAppend(
      layer,
      text(BLOCK_TITLES[block.blockId], {
        x: rect.x + BLOCK_PADDING,
        y: rect.y + 30,
        "font-size": FONT.blockTitle,
        "font-weight": 600,
      }),
    );
    const content = blockOf(document, block.blockId);
    if (stickiesOf(content).length === 0) this.drawHint(layer, block);
  }

  private drawSheet(layer: SVGElement, layout: CanvasLayout): void {
    const { topRow, footer } = layout;
    ensureSheetShadow(layer);
    svgAppend(
      layer,
      element(
        "rect",
        {
          x: topRow.x - SHEET_MARGIN,
          y: topRow.y - SHEET_MARGIN,
          width: topRow.width + 2 * SHEET_MARGIN,
          height: footer.y - topRow.y + 2 * SHEET_MARGIN,
          rx: SHEET_RADIUS,
          fill: COLORS.plot,
          filter: `url(#${SHEET_SHADOW_ID})`,
        },
        "bmc-sheet",
      ),
    );
  }

  private drawHint(layer: SVGElement, block: BlockLayout): void {
    const width = block.rect.width - 2 * BLOCK_PADDING;
    const hint = fittedText(BLOCK_HINTS[block.blockId], {
      box: { width, height: 3 * FONT.hint * FONT.lineHeight },
      fontSize: FONT.hint,
      fill: COLORS.quiet,
    });
    svgClasses(hint).add("bmc-hint");
    svgAppend(
      layer,
      translated(hint, block.rect.x + BLOCK_PADDING, block.rect.y + BLOCK_HEADING_HEIGHT - 6),
    );
  }

  private drawHeader(layer: SVGElement, document: CanvasDocument, header: Rect): void {
    const title = titleOf(document);
    svgAppend(
      layer,
      text(
        title ?? "Untitled canvas",
        {
          x: header.x,
          y: header.y + 30,
          "font-size": FONT.title,
          "font-weight": 700,
          "letter-spacing": "-0.02em",
          ...(title === undefined ? { fill: COLORS.quiet } : {}),
        },
        TITLE_MARKER,
      ),
    );
  }

  private drawFooter(layer: SVGElement, layout: CanvasLayout): void {
    svgAppend(
      layer,
      text(
        ATTRIBUTION,
        {
          x: layout.footer.x,
          y: layout.footer.y + SHEET_MARGIN + 20,
          "font-size": FONT.footer,
          fill: COLORS.quiet,
        },
        "bmc-attribution",
      ),
    );
  }
}
