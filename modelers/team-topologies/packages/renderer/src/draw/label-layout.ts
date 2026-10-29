/**
 * Where and how each element's text is laid out. Shared by the SVG renderer and
 * the inline label editor, so the editor sits exactly on top of the rendered
 * label and uses the same typography.
 */

import { TEAM_TYPE_SPECS } from "@miragon/team-topologies-schema-model";
import {
  isTtAnnotation,
  isTtFlow,
  isTtInteraction,
  type TtElement,
  type TtInteraction,
  type TtTeam,
} from "../model/di-types.js";
import { MIRAGON } from "../theme/index.js";
import type { CanvasTextRole } from "./canvas-roles.js";
import { contrastRatio, interactionPaint, parseHexColour } from "./colour.js";
import { FONT, INK, INK_MUTED } from "./styles.js";

/** Horizontal padding between a shape's outline and its centred label. */
const LABEL_INSET = 10;
const ANNOTATION_PADDING = { left: 10, right: 6, top: 6, bottom: 6 };
export const LINE_HEIGHT = 1.2;
/** The average glyph advance as a share of the font size, which the wrapping estimates with. */
const CHARACTER_WIDTH = 0.58;

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelLayout {
  /** The area the text is laid out in, relative to the element's top-left corner. */
  box: LabelBox;
  /** `center`: centred both ways (shape labels). `left-top`: flows from the top-left (annotations). */
  align: "center" | "left-top";
  fontSize: number;
  fontWeight: string;
  letterSpacing?: string;
  /** The light colour, which the SVG and its export carry. */
  fill: string;
  /** The role a label on the canvas ground follows in every mode; none on a fill. */
  role?: CanvasTextRole;
}

/** WCAG AA for body text. */
const MIN_TEXT_CONTRAST = 4.5;

/**
 * Label colour for text on an opaque `fill`: schwarz while it stays readable (every official
 * notation fill), weiss on dark custom fills.
 */
export function readableTextColour(fill: string): string {
  const fillRgb = parseHexColour(fill);
  const ink = parseHexColour(INK);
  const paper = parseHexColour(MIRAGON.weiss);
  if (!fillRgb || !ink || !paper) return INK;
  const inkContrast = contrastRatio(ink, fillRgb);
  if (inkContrast >= MIN_TEXT_CONTRAST) return INK;
  return contrastRatio(paper, fillRgb) > inkContrast ? MIRAGON.weiss : INK;
}

function shapeTextColour(element: TtTeam | TtInteraction): string {
  if (isTtInteraction(element)) return readableTextColour(interactionPaint(element).fill);
  const spec = TEAM_TYPE_SPECS[element.teamType] ?? TEAM_TYPE_SPECS["stream-aligned"];
  return readableTextColour(element.fill ?? spec.fill);
}

/** Width of the flow arrow's head; the label stays on the shaft. */
export function flowHeadWidth(width: number, height: number): number {
  return Math.min(width * 0.16, height * 1.1);
}

export function labelLayout(element: TtElement): LabelLayout {
  const width = Math.max(element.width, 1);
  const height = Math.max(element.height, 1);

  if (isTtAnnotation(element)) {
    return {
      box: {
        x: ANNOTATION_PADDING.left,
        y: ANNOTATION_PADDING.top,
        width: Math.max(width - ANNOTATION_PADDING.left - ANNOTATION_PADDING.right, 1),
        height: Math.max(height - ANNOTATION_PADDING.top - ANNOTATION_PADDING.bottom, 1),
      },
      align: "left-top",
      fontSize: FONT.annotation,
      fontWeight: "400",
      fill: INK,
      role: "text",
    };
  }

  if (isTtFlow(element)) {
    const shaftWidth = width - flowHeadWidth(width, height);
    return {
      box: { x: LABEL_INSET, y: 0, width: shaftWidth - 2 * LABEL_INSET, height },
      align: "center",
      fontSize: FONT.small,
      fontWeight: "600",
      letterSpacing: "0.06em",
      fill: INK_MUTED,
      role: "text-leise",
    };
  }

  return {
    box: { x: LABEL_INSET, y: 0, width: width - 2 * LABEL_INSET, height },
    align: "center",
    fontSize: isTtInteraction(element) ? FONT.small : FONT.label,
    fontWeight: "600",
    fill: shapeTextColour(element),
  };
}

/**
 * Greedy word-wrap into lines that roughly fit `maxWidth` at the font size.
 * Explicit line breaks are kept. Character-count based (not measured), so the
 * result is identical on every platform and exported SVGs stay stable.
 */
export function wrapLabel(text: string, maxWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * CHARACTER_WIDTH)));
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  return lines;
}

/**
 * Where the element's wrapped label is drawn, relative to the element's top-left corner, or
 * `undefined` without text. A word longer than a line, or more lines than the shape holds, reach
 * past the shape, and the editor does not grow it. Estimated from the characters like the wrapping
 * rather than measured, so it is the same at every zoom.
 */
export function labelTextBox(element: TtElement): LabelBox | undefined {
  const layout = labelLayout(element);
  const { box, fontSize } = layout;
  const lines = wrapLabel(element.ttLabel ?? "", box.width, fontSize);
  if (lines.length === 0) return undefined;
  const width = Math.max(...lines.map((line) => line.length)) * fontSize * CHARACTER_WIDTH;
  const height = lines.length * fontSize * LINE_HEIGHT;
  if (layout.align === "left-top") return { x: box.x, y: box.y, width, height };
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}
