/**
 * Tiny inline-SVG glyphs for the palette / legend — the same shapes the canvas
 * draws (contexts coloured by subdomain, plus a relationship line). Returned as
 * HTML strings for diagram-js palette `html`. Hosts may pass values read from an
 * unvalidated document: an unknown type draws the unclassified box, an unknown
 * pattern the upstream-downstream line, a size that is no positive number the
 * default size, and a role stays text.
 */

import {
  RELATIONSHIP_PATTERN_SPECS,
  SUBDOMAIN_TYPE_SPECS,
} from "@miragon/context-maps-schema-model";
import type {
  DownstreamRole,
  RelationshipPattern,
  RelationshipPatternSpec,
  SubdomainType,
  SubdomainTypeSpec,
  UpstreamRole,
} from "@miragon/context-maps-schema-model";
import { contextBadgeColour } from "./contextColours.js";
import { markupElement, markupText, type Markup } from "./markup.js";
import { markFill, markTextColour } from "./relationshipColours.js";
import { FONT, NEUTRAL_FILL, NEUTRAL_STROKE } from "./styles.js";
import { HAND_PATH, STAR_PATH } from "./subdomainGlyphs.js";

const ICON_SIZE = 24;
const BARE_GLYPH_SIZE = 18;
const DEFAULT_PATTERN: RelationshipPattern = "upstream-downstream";

function subdomainSpec(type: SubdomainType | undefined): SubdomainTypeSpec | undefined {
  return type !== undefined && Object.hasOwn(SUBDOMAIN_TYPE_SPECS, type)
    ? SUBDOMAIN_TYPE_SPECS[type]
    : undefined;
}

function patternSpec(pattern: RelationshipPattern): RelationshipPatternSpec {
  return RELATIONSHIP_PATTERN_SPECS[
    Object.hasOwn(RELATIONSHIP_PATTERN_SPECS, pattern) ? pattern : DEFAULT_PATTERN
  ];
}

function iconSize(size: unknown, fallback: number): number {
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : fallback;
}

function svg(size: number, viewBox: string, ...children: Markup[]): string {
  return markupElement(
    "svg",
    { class: "cm-palette-svg", width: size, height: size, viewBox, "aria-hidden": "true" },
    ...children,
  );
}

function contextBox(fill: string, stroke: string): Markup {
  return markupElement("rect", {
    x: 2,
    y: 4,
    width: 22,
    height: 18,
    rx: 3.5,
    fill,
    stroke,
    "stroke-width": 1.5,
  });
}

/** The subdomain glyph centred at (cx, cy) at `size` px: star / hand / dotted circle. */
function subdomainGlyph(
  type: SubdomainType,
  cx: number,
  cy: number,
  size: number,
  color: string,
): Markup {
  if (type === "generic") {
    return markupElement("circle", {
      cx,
      cy,
      r: size / 2 - 0.5,
      fill: "none",
      stroke: color,
      "stroke-width": 1.4,
      "stroke-dasharray": "1.8 1.8",
    });
  }
  const scale = size / 24;
  const rotation = type === "supporting" ? " rotate(90 12 12)" : "";
  return markupElement("path", {
    d: type === "core" ? STAR_PATH : HAND_PATH,
    fill: color,
    transform: `translate(${cx - 12 * scale} ${cy - 12 * scale}) scale(${scale})${rotation}`,
  });
}

/** No (or unknown) type → the neutral box an unclassified context gets on the canvas. */
export function contextIconSvg(type?: SubdomainType): string {
  const spec = subdomainSpec(type);
  if (!spec) return svg(ICON_SIZE, "0 0 26 26", contextBox(NEUTRAL_FILL, NEUTRAL_STROKE));
  return svg(
    ICON_SIZE,
    "0 0 26 26",
    contextBox(spec.fill, spec.stroke),
    subdomainGlyph(spec.type, 13, 13, 12, contextBadgeColour({ subdomainType: spec.type })),
  );
}

/**
 * The bare subdomain glyph (star / hand / dotted circle) without the box — legend rows. With no box
 * around it, it keeps the type's outline colour as its colour cue; each outline holds 3:1.
 */
export function subdomainIconSvg(type: SubdomainType, size = BARE_GLYPH_SIZE): string {
  const spec = subdomainSpec(type);
  const glyph =
    !spec || spec.type === "generic"
      ? markupElement("circle", {
          cx: 12,
          cy: 12,
          r: 9,
          fill: "none",
          stroke: spec?.stroke ?? NEUTRAL_STROKE,
          "stroke-width": 1.8,
          "stroke-dasharray": "2.4 2.4",
        })
      : markupElement("path", {
          d: spec.type === "core" ? STAR_PATH : HAND_PATH,
          fill: spec.stroke,
        });
  return svg(iconSize(size, BARE_GLYPH_SIZE), "0 0 24 24", glyph);
}

/** The same coloured role chip (OHS/PL/ACL/CF) the canvas draws at relationship ends. */
export function roleChipSvg(role: UpstreamRole | DownstreamRole): string {
  return svg(
    ICON_SIZE,
    "0 0 26 26",
    markupElement("rect", { x: 1, y: 6.5, width: 24, height: 13, rx: 3, fill: markFill(role) }),
    markupElement(
      "text",
      {
        x: 13,
        y: 16.4,
        "text-anchor": "middle",
        "font-size": 9.5,
        "font-weight": 700,
        fill: markTextColour(role),
        "font-family": FONT.family,
      },
      markupText(role),
    ),
  );
}

export function relationshipIconSvg(
  pattern: RelationshipPattern = DEFAULT_PATTERN,
  size = ICON_SIZE,
): string {
  const spec = patternSpec(pattern);
  const lineEnd = (cx: number) =>
    markupElement("circle", { cx, cy: 13, r: 2.5, fill: spec.stroke, stroke: "none" });
  return svg(
    iconSize(size, ICON_SIZE),
    "0 0 26 26",
    markupElement(
      "g",
      {
        stroke: spec.stroke,
        "stroke-width": Math.min(spec.strokeWidth, 2.6),
        "stroke-linecap": "round",
      },
      lineEnd(5),
      markupElement("line", {
        x1: 7,
        y1: 13,
        x2: 19,
        y2: 13,
        "stroke-dasharray": spec.dash || undefined,
      }),
      lineEnd(21),
    ),
  );
}
