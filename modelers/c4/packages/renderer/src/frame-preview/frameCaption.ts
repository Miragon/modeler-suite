import type { Box } from "@miragon/c4-schema-model";
import { LUCIDE_STROKE_WIDTH, TRIANGLE_ALERT_NODES } from "../draw/lucide.js";
import { append, appendBand, svgElement } from "../draw/svg.js";
import type { SceneBoundary, SceneGroup } from "../scene/types.js";
import { boundaryTextLayout, groupTextLayout } from "../text/elementTextLayout.js";
import { canvasFont, textWidth } from "../text/textMetrics.js";
import { chipPlace, type ChipSurroundings } from "./chipPlace.js";

export const FRAME_CAPTION_CLASS = "c4-frame-preview-caption";
export const FRAME_WARNING_CHIP_CLASS = "c4-frame-preview-chip";

const CHIP_FONT = canvasFont(12, 500, 1.2);
const CHIP_HEIGHT = 24;
const CHIP_PADDING = 8;
const CHIP_ICON = 14;
const CHIP_GAP = 6;
/** Between the chip and the frame's top edge it names. */
const CHIP_OFFSET = 6;
const CHIP_RADIUS = 6;

/**
 * A boundary's caption where its previewed frame will be, as the boundary draws it (name, type
 * line, bottom left): with several frames on the move, each still says which one it is.
 */
export function appendBoundaryCaption(parent: SVGElement, look: SceneBoundary, box: Box): void {
  for (const band of boundaryTextLayout({ ...look, box }).bands) {
    appendBand(parent, band, { x: 0, y: 0 }, `c4-band ${FRAME_CAPTION_CLASS}`);
  }
}

/** A group's name where its previewed frame will be, top left as the group draws it. */
export function appendGroupCaption(parent: SVGElement, look: SceneGroup, box: Box): void {
  for (const band of groupTextLayout({ ...look, box }).bands) {
    appendBand(parent, band, { x: 0, y: 0 }, `c4-band ${FRAME_CAPTION_CLASS}`);
  }
}

/** "Overlaps Payment Provider", "Overlaps Payment Provider and 2 more". */
export function overlapText(names: readonly string[]): string {
  const [first, ...more] = names;
  if (first === undefined) return "";
  return more.length === 0 ? `Overlaps ${first}` : `Overlaps ${first} and ${more.length} more`;
}

/**
 * The warning's words and icon on a chip above the frame's top left (guide §3.3: a status never
 * shows by its colour alone): Lucide `triangle-alert` and what the frame would run over. With
 * `surroundings`, clear of the host's chrome (`chipPlace`).
 */
export function appendWarningChip(
  parent: SVGElement,
  frame: Box,
  text: string,
  options: { roomInside?: boolean; surroundings?: ChipSurroundings | undefined } = {},
): SVGGElement {
  const width = CHIP_PADDING + CHIP_ICON + CHIP_GAP + textWidth(text, CHIP_FONT) + CHIP_PADDING;
  const { x, y } = chipPlace(
    { box: frame, roomInside: options.roomInside === true },
    { width, height: CHIP_HEIGHT },
    CHIP_OFFSET,
    options.surroundings,
  );
  const chip = append(parent, svgElement("g", { class: FRAME_WARNING_CHIP_CLASS }));
  append(
    chip,
    svgElement("rect", {
      class: `${FRAME_WARNING_CHIP_CLASS}-ground`,
      x: x + 0.5,
      y: y + 0.5,
      width: width - 1,
      height: CHIP_HEIGHT - 1,
      rx: CHIP_RADIUS,
      "stroke-width": 1,
    }),
  );
  const scale = CHIP_ICON / 24;
  const icon = append(
    chip,
    svgElement("g", {
      class: `${FRAME_WARNING_CHIP_CLASS}-icon`,
      transform: `translate(${x + CHIP_PADDING} ${y + (CHIP_HEIGHT - CHIP_ICON) / 2}) scale(${scale})`,
      fill: "none",
      "stroke-width": LUCIDE_STROKE_WIDTH,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }),
  );
  for (const [tag, attributes] of TRIANGLE_ALERT_NODES) {
    append(icon, svgElement(tag as "path", attributes));
  }
  const label = append(
    chip,
    svgElement("text", {
      class: `${FRAME_WARNING_CHIP_CLASS}-text`,
      x: x + CHIP_PADDING + CHIP_ICON + CHIP_GAP,
      y: y + CHIP_HEIGHT / 2,
      "font-family": CHIP_FONT.family,
      "font-size": CHIP_FONT.size,
      "font-weight": CHIP_FONT.weight,
      "dominant-baseline": "central",
      "text-rendering": "geometricPrecision",
    }),
  );
  label.textContent = text;
  return chip;
}
