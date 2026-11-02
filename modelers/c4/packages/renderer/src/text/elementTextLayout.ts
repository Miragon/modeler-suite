import type { Box, FieldName, Point, ResolvedElementStyle } from "@miragon/c4-schema-model";
import { readableTextOn } from "../draw/colour.js";
import { drillBadgeLayout } from "../draw/drillBadge.js";
import { drawnShape, textAreaOf } from "../draw/shapes.js";
import type {
  Scene,
  SceneBoundary,
  SceneElement,
  SceneGroup,
  SceneRelationship,
} from "../scene/types.js";
import { lineHeightOf, measurementGeneration, textWidth, type TextFont } from "./textMetrics.js";
import type { TextBand, TextBandName, TextBands, TextRole } from "./types.js";
import {
  BOUNDARY_CAPTION,
  BOUNDARY_FONTS,
  ELEMENT_FONTS,
  ELEMENT_GAPS,
  GROUP_CAPTION,
  GROUP_FONT,
  NAME_MAX_LINES,
  LABEL_REACH,
  RELATIONSHIP_FONTS,
  RELATIONSHIP_LABEL,
  TITLE_BLOCK,
  TITLE_FONTS,
  TYPE_LINE_MAX_LINES,
} from "./typography.js";
import {
  balanced,
  fitLines,
  singleLine,
  withoutLineBreaks,
  wrapText,
  type FittedLines,
} from "./wrap.js";

/** The text colour on a fill the author set, else undefined: the roles draw it (SPEC 6.4). */
export function selfSetTextColour(style: {
  readonly fill: string | undefined;
  readonly text: string | undefined;
}): string | undefined {
  if (style.text !== undefined) return style.text;
  return style.fill === undefined ? undefined : readableTextOn(style.fill);
}

interface PendingBand {
  readonly band: TextBandName;
  readonly field: FieldName | undefined;
  readonly font: TextFont;
  readonly fitted: FittedLines;
  /** What the band shows when nothing is cut: its tooltip once something is. */
  readonly text: string;
  readonly role: TextRole;
  /** Lines the band takes even when it has none: an empty name keeps its place for the editor. */
  readonly minimumLines: number;
  readonly gapBefore: number;
}

function heightOf(band: PendingBand): number {
  return Math.max(band.fitted.lines.length, band.minimumLines) * lineHeightOf(band.font);
}

function stackHeight(bands: readonly PendingBand[]): number {
  return bands.reduce(
    (sum, band, index) => sum + heightOf(band) + (index === 0 ? 0 : band.gapBefore),
    0,
  );
}

/** Places the bands one below the other from `top`, each the full `width` wide. */
function placeBands(
  bands: readonly PendingBand[],
  x: number,
  top: number,
  width: number,
  align: TextBand["align"],
  colour: string | undefined,
): TextBand[] {
  let y = top;
  return bands.map((band, index) => {
    if (index > 0) y += band.gapBefore;
    const height = heightOf(band);
    const placed: TextBand = {
      band: band.band,
      field: band.field,
      box: { x, y, width, height },
      font: band.font,
      lines: band.fitted.lines,
      truncated: band.fitted.truncated,
      fullText: band.fitted.truncated ? tooltipText(band.text) : undefined,
      align,
      role: band.role,
      colour,
    };
    y += height;
    return placed;
  });
}

function typeField(element: SceneElement): FieldName | undefined {
  if (element.kind === "container" || element.kind === "component") return "technology";
  return element.kind === "custom" ? "metadata" : undefined;
}

/** The area above the drill badge, unless the shape is too small to give anything up. */
function aboveBadge(area: Box, badgeTop: number, minimum: number): Box {
  const limit = badgeTop - 4;
  if (area.y + area.height <= limit) return area;
  const height = limit - area.y;
  return height >= minimum ? { ...area, height } : area;
}

const elementLayouts = new WeakMap<
  SceneElement,
  { readonly generation: number; readonly bands: TextBands }
>();

/**
 * The text stack of an element (SPEC 6.3): name, type line and description, centred in the shape's
 * text area, in diagram coordinates. The drawing, the label editor and its hit test read this one
 * layout, so the editor lies exactly over the band it edits.
 */
export function elementTextLayout(element: SceneElement): TextBands {
  const generation = measurementGeneration();
  const cached = elementLayouts.get(element);
  if (cached?.generation === generation) return cached.bands;
  const bands = layoutElement(element);
  elementLayouts.set(element, { generation, bands });
  return bands;
}

function layoutElement(element: SceneElement): TextBands {
  const shape = drawnShape(element.shape);
  const { x, y, width, height } = element.box;
  const nameLine = lineHeightOf(ELEMENT_FONTS.name);
  let area = textAreaOf(shape, width, height);
  const badge = drillBadgeLayout(element);
  if (badge) area = aboveBadge(area, badge.box.y - y, nameLine);
  const style: ResolvedElementStyle = element.style;

  const nameLines = Math.max(1, Math.min(NAME_MAX_LINES, Math.floor(area.height / nameLine)));
  const pending: PendingBand[] = [
    {
      band: "name",
      field: "name",
      font: ELEMENT_FONTS.name,
      fitted: fitLines(withoutLineBreaks(element.name), area.width, ELEMENT_FONTS.name, nameLines),
      text: element.name,
      role: "cd-c-fill-text",
      minimumLines: 1,
      gapBefore: 0,
    },
  ];

  const typeLine = lineHeightOf(ELEMENT_FONTS.type);
  const typeRoom = area.height - stackHeight(pending) - ELEMENT_GAPS.beforeType;
  if (style.metadata && element.typeLine.trim() !== "" && typeLine <= typeRoom) {
    const flat = withoutLineBreaks(element.typeLine);
    const lines = Math.min(TYPE_LINE_MAX_LINES, Math.floor(typeRoom / typeLine));
    pending.push({
      band: "type",
      field: typeField(element),
      font: ELEMENT_FONTS.type,
      fitted: balanced(
        fitLines(flat, area.width, ELEMENT_FONTS.type, lines),
        flat,
        area.width,
        ELEMENT_FONTS.type,
      ),
      text: element.typeLine,
      role: "cd-c-fill-text-leise",
      minimumLines: 1,
      gapBefore: ELEMENT_GAPS.beforeType,
    });
  }

  if (style.description && element.description.trim() !== "") {
    const room = area.height - stackHeight(pending) - ELEMENT_GAPS.beforeDescription;
    const lines = Math.floor(room / lineHeightOf(ELEMENT_FONTS.description));
    if (lines >= 1) {
      pending.push({
        band: "description",
        field: "description",
        font: ELEMENT_FONTS.description,
        fitted: fitLines(element.description, area.width, ELEMENT_FONTS.description, lines),
        text: element.description,
        role: "cd-c-fill-text",
        minimumLines: 0,
        gapBefore: ELEMENT_GAPS.beforeDescription,
      });
    }
  }

  const top = y + area.y + (area.height - stackHeight(pending)) / 2;
  const absoluteArea = { x: x + area.x, y: y + area.y, width: area.width, height: area.height };
  return {
    area: absoluteArea,
    bands: placeBands(pending, absoluteArea.x, top, area.width, "centre", selfSetTextColour(style)),
    backing: undefined,
  };
}

/**
 * A relationship's label (SPEC 6.3), centred on its label box: up to three description lines and
 * two of the `[technology]`, each band's lines balanced, on a ground just large enough for the text.
 * The ground keeps to the 160 wide slot while the text fits it in up to 72 high, and widens up to
 * 240 for the rest; only text that does not fit 240 × 72 is cut short.
 */
export function relationshipLabelLayout(relationship: SceneRelationship): TextBands {
  const generation = measurementGeneration();
  const cached = labelLayouts.get(relationship);
  if (cached?.generation === generation) return cached.bands;
  const bands = layoutLabel(relationship);
  labelLayouts.set(relationship, { generation, bands });
  return bands;
}

const labelLayouts = new WeakMap<
  SceneRelationship,
  { readonly generation: number; readonly bands: TextBands }
>();

function layoutLabel(relationship: SceneRelationship): TextBands {
  const slot = relationship.labelBox;
  const { style } = relationship;
  const { padding, groundPadding } = RELATIONSHIP_LABEL;
  const description =
    style.description && relationship.description.trim() !== ""
      ? relationship.description
      : undefined;
  const technology =
    style.metadata && relationship.technology.trim() !== ""
      ? `[${relationship.technology}]`
      : undefined;
  if (description === undefined && technology === undefined) {
    return { area: slot, bands: [], backing: undefined };
  }
  const { width, pending } = fittedLabel(description, technology, slot.width - 2 * padding);
  const height = stackHeight(pending);
  const centre = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };
  const bands = placeBands(
    pending,
    centre.x - width / 2,
    centre.y - height / 2,
    width,
    "centre",
    style.text,
  );
  const widest = Math.max(
    0,
    ...bands.flatMap((band) => band.lines.map((line) => textWidth(line, band.font))),
  );
  const area = centredIn(
    slot,
    Math.max(slot.width, width + 2 * padding),
    Math.max(slot.height, height + 2 * groundPadding),
  );
  const backing =
    widest > 0 ? centredIn(slot, widest + 2 * padding, height + 2 * groundPadding) : undefined;
  return { area, bands, backing };
}

/**
 * The narrowest text width, from the slot's up to the reach's in steps of 8, at which every line
 * fits without a cut and the stack fits the reach's height; else the reach's width, with the
 * technology and then the description giving up lines until the stack fits.
 */
function fittedLabel(
  description: string | undefined,
  technology: string | undefined,
  slotWidth: number,
): { width: number; pending: PendingBand[] } {
  const { padding, groundPadding, descriptionLines, technologyLines } = RELATIONSHIP_LABEL;
  const widest = Math.max(slotWidth, LABEL_REACH.width - 2 * padding);
  const tallest = LABEL_REACH.height - 2 * groundPadding;
  const counts = (width: number) => ({
    description:
      description === undefined
        ? 0
        : wrapText(description, width, RELATIONSHIP_FONTS.description).length,
    technology:
      technology === undefined
        ? 0
        : wrapText(technology, width, RELATIONSHIP_FONTS.technology).length,
  });
  for (let width = slotWidth; width <= widest; width += LABEL_WIDTH_STEP) {
    const lines = counts(width);
    if (lines.description > descriptionLines || lines.technology > technologyLines) continue;
    const pending = labelBands(description, technology, width, lines);
    if (stackHeight(pending) <= tallest) return { width, pending };
  }
  const wanted = counts(widest);
  const lines = {
    description: Math.min(wanted.description, descriptionLines),
    technology: Math.min(wanted.technology, technologyLines),
  };
  let pending = labelBands(description, technology, widest, lines);
  while (stackHeight(pending) > tallest && (lines.technology > 1 || lines.description > 1)) {
    if (lines.technology > 1) lines.technology -= 1;
    else lines.description -= 1;
    pending = labelBands(description, technology, widest, lines);
  }
  return { width: widest, pending };
}

/** The text width a label tries next when its text does not fit. */
const LABEL_WIDTH_STEP = 8;

function labelBands(
  description: string | undefined,
  technology: string | undefined,
  width: number,
  lines: { readonly description: number; readonly technology: number },
): PendingBand[] {
  const pending: PendingBand[] = [];
  if (description !== undefined) {
    const font = RELATIONSHIP_FONTS.description;
    pending.push({
      band: "description",
      field: "description",
      font,
      fitted: balanced(
        fitLines(description, width, font, lines.description),
        description,
        width,
        font,
      ),
      text: description,
      role: "cd-c-fill-text",
      minimumLines: 0,
      gapBefore: 0,
    });
  }
  if (technology !== undefined) {
    const font = RELATIONSHIP_FONTS.technology;
    const flat = withoutLineBreaks(technology);
    pending.push({
      band: "technology",
      field: "technology",
      font,
      fitted: balanced(fitLines(flat, width, font, lines.technology), flat, width, font),
      text: technology,
      role: "cd-c-fill-text-leise",
      minimumLines: 1,
      gapBefore: RELATIONSHIP_LABEL.gap,
    });
  }
  return pending;
}

/** A tooltip shows the text as one paragraph per explicit line break. */
function tooltipText(text: string): string {
  return text
    .split(/\r\n|\r|\n|\\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

function centredIn(box: Box, width: number, height: number): Box {
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/** A boundary's caption at its bottom left (SPEC 6.5): the name, and the type line below it. */
export function boundaryTextLayout(boundary: SceneBoundary): TextBands {
  const { x, y, width, height } = boundary.box;
  const inset = BOUNDARY_CAPTION.inset;
  const maxWidth = Math.max(0, width - 2 * inset);
  const pending: PendingBand[] = [
    {
      band: "name",
      field: "name",
      font: BOUNDARY_FONTS.name,
      fitted: singleLine(boundary.name, maxWidth, BOUNDARY_FONTS.name),
      text: boundary.name,
      role: "cd-c-fill-text",
      minimumLines: 1,
      gapBefore: 0,
    },
  ];
  if (boundary.typeLine.trim() !== "") {
    pending.push({
      band: "type",
      field: undefined,
      font: BOUNDARY_FONTS.type,
      fitted: singleLine(boundary.typeLine, maxWidth, BOUNDARY_FONTS.type),
      text: boundary.typeLine,
      role: "cd-c-fill-text-leise",
      minimumLines: 1,
      gapBefore: BOUNDARY_CAPTION.gap,
    });
  }
  const top = y + height - inset - stackHeight(pending);
  // The caption band takes the boundary's clicks (SPEC 6.5): at least the layout's 40, and always
  // the whole caption with a margin above it.
  const band = Math.min(height, Math.max(BOUNDARY_CAPTION.band, y + height - top + 4));
  return {
    area: { x, y: y + height - band, width, height: band },
    bands: placeBands(
      pending,
      x + inset,
      top,
      maxWidth,
      "start",
      selfSetTextColour(boundary.style),
    ),
    backing: undefined,
  };
}

/** A group's name at its top left (SPEC 6.5). */
export function groupTextLayout(group: SceneGroup): TextBands {
  const { x, y, width } = group.box;
  const maxWidth = Math.max(0, width - 2 * GROUP_CAPTION.inset);
  const pending: PendingBand[] = [
    {
      band: "name",
      field: undefined,
      font: GROUP_FONT,
      fitted: singleLine(group.name, maxWidth, GROUP_FONT),
      text: group.name,
      role: "cd-c-fill-text-leise",
      minimumLines: 1,
      gapBefore: 0,
    },
  ];
  return {
    area: group.box,
    bands: placeBands(
      pending,
      x + GROUP_CAPTION.inset,
      y + GROUP_CAPTION.top,
      maxWidth,
      "start",
      undefined,
    ),
    backing: undefined,
  };
}

/** The title block (SPEC 6.5): one title line, at most two description lines, 62 high. */
export function titleTextLayout(title: Scene["title"]): TextBands {
  const { x, y, width } = title.box;
  const pending: PendingBand[] = [
    {
      band: "title",
      field: undefined,
      font: TITLE_FONTS.title,
      fitted: singleLine(title.text, width, TITLE_FONTS.title),
      text: title.text,
      role: "cd-c-fill-text",
      minimumLines: 1,
      gapBefore: 0,
    },
  ];
  if (title.description.trim() !== "") {
    pending.push({
      band: "description",
      field: undefined,
      font: TITLE_FONTS.description,
      fitted: fitLines(
        title.description,
        width,
        TITLE_FONTS.description,
        TITLE_BLOCK.descriptionLines,
      ),
      text: title.description,
      role: "cd-c-fill-text-leise",
      minimumLines: 0,
      gapBefore: TITLE_BLOCK.gap,
    });
  }
  return {
    area: title.box,
    bands: placeBands(pending, x, y, width, "start", undefined),
    backing: undefined,
  };
}

/**
 * The band under a point (diagram coordinates), for the label editor's double-click (SPEC 5.5,
 * Context Maps' band hit test): a band spans its layout's whole width, so a click beside a short
 * line still picks it. Undefined between and outside the bands.
 */
export function bandAt(layout: TextBands, point: Point): TextBand | undefined {
  if (point.x < layout.area.x || point.x > layout.area.x + layout.area.width) return undefined;
  return layout.bands.find(
    (band) => point.y >= band.box.y && point.y <= band.box.y + band.box.height,
  );
}
