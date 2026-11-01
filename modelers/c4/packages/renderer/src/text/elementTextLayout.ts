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
  RELATIONSHIP_FONTS,
  RELATIONSHIP_LABEL,
  TITLE_BLOCK,
  TITLE_FONTS,
} from "./typography.js";
import { fitLines, singleLine, withoutLineBreaks, type FittedLines } from "./wrap.js";

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
      role: "cd-c-fill-text",
      minimumLines: 1,
      gapBefore: 0,
    },
  ];

  const typeLine = lineHeightOf(ELEMENT_FONTS.type);
  if (
    style.metadata &&
    element.typeLine.trim() !== "" &&
    stackHeight(pending) + ELEMENT_GAPS.beforeType + typeLine <= area.height
  ) {
    pending.push({
      band: "type",
      field: typeField(element),
      font: ELEMENT_FONTS.type,
      fitted: singleLine(element.typeLine, area.width, ELEMENT_FONTS.type),
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
 * A relationship's label in its fixed label box (SPEC 6.3): up to two description lines and the
 * `[technology]`, centred, on a plot-coloured ground just wide enough for the text.
 */
export function relationshipLabelLayout(relationship: SceneRelationship): TextBands {
  const box = relationship.labelBox;
  const { style } = relationship;
  const padding = RELATIONSHIP_LABEL.padding;
  const width = Math.max(0, box.width - 2 * padding);
  const pending: PendingBand[] = [];
  if (style.description && relationship.description.trim() !== "") {
    pending.push({
      band: "description",
      field: "description",
      font: RELATIONSHIP_FONTS.description,
      fitted: fitLines(
        relationship.description,
        width,
        RELATIONSHIP_FONTS.description,
        RELATIONSHIP_LABEL.descriptionLines,
      ),
      role: "cd-c-fill-text",
      minimumLines: 0,
      gapBefore: 0,
    });
  }
  if (style.metadata && relationship.technology.trim() !== "") {
    pending.push({
      band: "technology",
      field: "technology",
      font: RELATIONSHIP_FONTS.technology,
      fitted: singleLine(`[${relationship.technology}]`, width, RELATIONSHIP_FONTS.technology),
      role: "cd-c-fill-text-leise",
      minimumLines: 1,
      gapBefore: RELATIONSHIP_LABEL.gap,
    });
  }
  const height = stackHeight(pending);
  const top = box.y + (box.height - height) / 2;
  const bands = placeBands(pending, box.x + padding, top, width, "centre", style.text);
  const widest = Math.max(
    0,
    ...bands.flatMap((band) => band.lines.map((line) => textWidth(line, band.font))),
  );
  // Two description lines and the technology fill the box nearly to the edge: the ground then
  // gives up its vertical padding rather than leave the label box.
  const verticalPadding = Math.max(0, Math.min(2, (box.height - height) / 2));
  const backing =
    widest > 0
      ? centredIn(
          box,
          Math.min(box.width, widest + 2 * padding),
          Math.min(box.height, height + 2 * verticalPadding),
        )
      : undefined;
  return { area: box, bands, backing };
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
