import {
  CANVAS_GROUND,
  PLOT,
  derivedStroke,
  normaliseColour,
  textOn,
  withOpacity,
} from "./colour.js";
import { STRUCTURIZR_PX_PER_UNIT, defaultShape } from "./notation.js";
import type {
  ElementKind,
  ElementStyle,
  ModelElement,
  Relationship,
  RelationshipStyle,
  ResolvedBoundaryStyle,
  ResolvedElementStyle,
  ResolvedRelationshipStyle,
  Styles,
} from "./types.js";

/** The default look of SPEC 6.4 and 6.5, in modeler units. */
const ELEMENT_STROKE_WIDTH = 2;
const BOUNDARY_STROKE_WIDTH = 2;
const RELATIONSHIP_THICKNESS = 1.5;
/** Structurizr's default box when a style sets only one side (R-JSON §1.5). */
const STRUCTURIZR_WIDTH = 450;
const STRUCTURIZR_HEIGHT = 300;

interface Cascade<Style> {
  readonly style: Partial<Style>;
  readonly tags: readonly string[];
}

/** The style cascade by tag order, last tag wins (R-JSON §1.6, SPEC 6.4). */
export function resolveElementStyle(element: ModelElement, styles: Styles): ResolvedElementStyle {
  const { style, tags } = cascade(styles.elements, element.tags);
  const shape = style.shape ?? defaultShape(element.kind);
  const size = styledSize(style, shape);
  const colours = selfSetColours(style, PLOT);
  return {
    shape,
    width: size?.width,
    height: size?.height,
    fill: colours.fill,
    stroke: colours.stroke,
    text: colours.text,
    strokeWidth: lineWidth(style.strokeWidth, ELEMENT_STROKE_WIDTH),
    border: style.border ?? "solid",
    metadata: style.metadata ?? true,
    description: style.description ?? true,
    tags,
  };
}

/** `Relationship`, then the relationship's tags; an implied one carries its origin's tags. */
export function resolveRelationshipStyle(
  relationship: Relationship,
  styles: Styles,
): ResolvedRelationshipStyle {
  const { style, tags } = cascade(styles.relationships, ["Relationship", ...relationship.tags]);
  const colour = opaque(style.color, style.opacity);
  return {
    stroke: colour,
    text: colour === undefined ? undefined : textOn(colour, PLOT),
    thickness: lineWidth(style.thickness, RELATIONSHIP_THICKNESS),
    line: style.style ?? "dashed",
    routing: style.routing ?? "direct",
    position: Math.min(100, Math.max(0, style.position ?? 50)),
    metadata: style.metadata ?? true,
    description: style.description ?? true,
    tags,
  };
}

/** `Boundary`, then `Boundary:SoftwareSystem` or `Boundary:Container`. */
export function resolveBoundaryStyle(
  kind: Extract<ElementKind, "softwareSystem" | "container">,
  styles: Styles,
): ResolvedBoundaryStyle {
  const kindTag = kind === "softwareSystem" ? "Boundary:SoftwareSystem" : "Boundary:Container";
  const { style, tags } = cascade(styles.elements, ["Boundary", kindTag]);
  const colours = selfSetColours(style, CANVAS_GROUND);
  return {
    fill: colours.fill,
    stroke: colours.stroke,
    text: colours.text,
    strokeWidth: lineWidth(style.strokeWidth, BOUNDARY_STROKE_WIDTH),
    border: style.border ?? "dashed",
    tags,
  };
}

function cascade<Style extends ElementStyle | RelationshipStyle>(
  definitions: readonly Style[],
  itemTags: readonly string[],
): Cascade<Style> {
  const byTag = new Map<string, Partial<Style>>();
  for (const definition of definitions) {
    byTag.set(definition.tag, { ...byTag.get(definition.tag), ...defined(definition) });
  }
  const style: Partial<Style> = {};
  const tags: string[] = [];
  for (const rawTag of itemTags) {
    const tag = rawTag.trim();
    const tagStyle = byTag.get(tag);
    if (tagStyle === undefined) continue;
    Object.assign(style, tagStyle);
    if (!tags.includes(tag)) tags.push(tag);
  }
  return { style, tags };
}

function defined<Style extends object>(style: Style): Partial<Style> {
  return Object.fromEntries(
    Object.entries(style).filter(([, value]) => value !== undefined),
  ) as Partial<Style>;
}

/**
 * Self-set colours (G §10.6): a fill or stroke from the style with its opacity mixed over white,
 * the stroke derived from the fill when only the fill is set, and the text adjusted to 4.5:1 on
 * what it is drawn on. Whatever the style leaves open stays undefined and draws in its role.
 */
function selfSetColours(
  style: Partial<ElementStyle>,
  ground: string,
): { fill: string | undefined; stroke: string | undefined; text: string | undefined } {
  const fill = opaque(style.background, style.opacity);
  const stroke =
    opaque(style.stroke, style.opacity) ?? (fill === undefined ? undefined : derivedStroke(fill));
  const colour = opaque(style.color, style.opacity);
  const text =
    colour === undefined && fill === undefined ? undefined : textOn(colour, fill ?? ground);
  return { fill, stroke, text };
}

function opaque(colour: string | undefined, opacity: number | undefined): string | undefined {
  const normalised = normaliseColour(colour);
  return normalised === undefined ? undefined : withOpacity(normalised, opacity);
}

function styledSize(
  style: Partial<ElementStyle>,
  shape: ResolvedElementStyle["shape"],
): { width: number; height: number } | undefined {
  if (style.width === undefined && style.height === undefined) return undefined;
  let width = Math.round((style.width ?? STRUCTURIZR_WIDTH) / STRUCTURIZR_PX_PER_UNIT);
  let height = Math.round((style.height ?? STRUCTURIZR_HEIGHT) / STRUCTURIZR_PX_PER_UNIT);
  const portraitWanted = shape === "MobileDevicePortrait" && height < width;
  const landscapeWanted = shape === "MobileDeviceLandscape" && height > width;
  if (portraitWanted || landscapeWanted) [width, height] = [height, width];
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/** Structurizr px clamped to 1..10, then in modeler units clamped to 1..4 (SPEC 6.4, 6.5). */
function lineWidth(pixels: number | undefined, fallback: number): number {
  if (pixels === undefined) return fallback;
  const clampedPixels = Math.min(10, Math.max(1, pixels));
  return Math.min(4, Math.max(1, clampedPixels / STRUCTURIZR_PX_PER_UNIT));
}
