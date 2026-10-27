/**
 * The Context Maps visual notation, encoded as data.
 *
 * Conventions follow the strategic-DDD context maps in Kaiser's
 * "Architecture for Flow" and Vernon's "DDD Distilled":
 *
 *  - Bounded contexts are boxes, coloured by subdomain type
 *    (core = warm/strategic, supporting = neutral, generic = cool/commodity).
 *  - Relationships are lines carrying a pattern abbreviation (OHS, PL, ACL, CF,
 *    P, SK, C/S, SW) plus U/D end markers for asymmetric patterns.
 *  - Line weight encodes coordination bandwidth: partnership / shared kernel are
 *    thick (high coordination), separate ways is thin/dashed (decoupled).
 *
 * This module is pure data — it must not import the rendering layer.
 */

import type {
  DownstreamRole,
  RelationshipPattern,
  Size,
  SubdomainType,
  UpstreamRole,
} from "./types";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface SubdomainTypeSpec {
  type: SubdomainType;
  /** Short display name. */
  label: string;
  /** One-line purpose, shown in the palette and inspector. */
  description: string;
  fill: string;
  stroke: string;
  /** Default size when a context of this type is created. */
  defaultSize: Size;
  /**
   * Minimum size — smaller imported boxes are clamped up to it (boxes are
   *  fixed-size on the canvas; there is no resize feature).
   */
  minSize: Size;
}

export interface RelationshipPatternSpec {
  pattern: RelationshipPattern;
  /** Short display name. */
  label: string;
  /** Abbreviation drawn on the line, e.g. "SK", "C/S". */
  abbreviation: string;
  description: string;
  /** No upstream/downstream direction (partnership, shared kernel, separate ways). */
  symmetric: boolean;
  stroke: string;
  /** SVG dash array for the line ("" = solid). Distinct per pattern. */
  dash: string;
  /** Line weight in px: thicker = higher coordination bandwidth. */
  strokeWidth: number;
}

/**
 * A distinct colour per context-mapping marker (each role and each direction has
 * its own colour + border). Shared by the canvas renderer and the legend so the
 * two never drift. OHS and ACL sit just dark enough for white text at 4.5:1; the
 * renderer writes black or white on each role chip, whichever has more contrast.
 */
// Foreign notation colours (guide §10.6), not brand colours; the renderer tests their contrast.
// brand-lint-disable
export const MARK_COLORS: Record<string, string> = {
  OHS: "#B0621C", // Open Host Service — warm brown/red
  PL: "#c99a2e", // Published Language — gold
  ACL: "#3E7BB0", // Anticorruption Layer — blue
  CF: "#4f9d69", // Conformist — green
  U: "#17807f", // Upstream — teal
  D: "#5c6b7a", // Downstream — slate
  S: "#17807f", // Supplier (upstream side) — teal
  C: "#5c6b7a", // Customer (downstream side) — slate
};
// brand-lint-enable

export const UPSTREAM_MARK_COLOR = MARK_COLORS.U;
export const DOWNSTREAM_MARK_COLOR = MARK_COLORS.D;

/** The marker abbreviations shown in the legend, in reading order. */
export const MARK_LEGEND: ReadonlyArray<{ token: string; label: string }> = [
  { token: "U", label: "Upstream" },
  { token: "D", label: "Downstream" },
  { token: "OHS", label: "Open Host Service" },
  { token: "PL", label: "Published Language" },
  { token: "ACL", label: "Anticorruption Layer" },
  { token: "CF", label: "Conformist" },
];

/** Long-form labels for the integration roles that decorate relationship ends. */
export const UPSTREAM_ROLE_SPECS: Record<UpstreamRole, { label: string; description: string }> = {
  OHS: {
    label: "Open Host Service",
    description: "A well-defined public protocol convenient for many downstream consumers.",
  },
  PL: {
    label: "Published Language",
    description: "A documented, standardised interchange language (e.g. a shared schema).",
  },
};

export const DOWNSTREAM_ROLE_SPECS: Record<DownstreamRole, { label: string; description: string }> =
  {
    ACL: {
      label: "Anticorruption Layer",
      description: "A translation layer isolating the downstream model from the upstream model.",
    },
    CF: {
      label: "Conformist",
      description: "The downstream adopts the upstream model as-is, without translation.",
    },
  };

// Foreign notation colours (guide §10.6), not brand colours; the renderer tests their contrast.
// brand-lint-disable
export const SUBDOMAIN_TYPE_SPECS: Record<SubdomainType, SubdomainTypeSpec> = {
  core: {
    type: "core",
    label: "Core Domain",
    description: "Business-critical and differentiating; where competitive advantage is built.",
    fill: "#FDE0D5",
    stroke: "#E8663D",
    defaultSize: { width: 200, height: 110 },
    minSize: { width: 120, height: 72 },
  },
  supporting: {
    type: "supporting",
    label: "Supporting Subdomain",
    description: "Specialised but not differentiating; necessary to support the core.",
    fill: "#FFF4CC",
    // The convention's amber, darkened at the same hue until it keeps 3:1 on the canvas ground.
    stroke: "#B58914",
    defaultSize: { width: 200, height: 110 },
    minSize: { width: 120, height: 72 },
  },
  generic: {
    type: "generic",
    label: "Generic Subdomain",
    description: "A solved, off-the-shelf problem; buy or adopt rather than build.",
    fill: "#DCE9F5",
    stroke: "#5B8DC7",
    defaultSize: { width: 200, height: 110 },
    minSize: { width: 120, height: 72 },
  },
};

export const RELATIONSHIP_PATTERN_SPECS: Record<RelationshipPattern, RelationshipPatternSpec> = {
  partnership: {
    pattern: "partnership",
    label: "Partnership",
    abbreviation: "P",
    description:
      "Two teams cooperate toward a shared goal; highest coordination bandwidth, mutual dependency.",
    symmetric: true,
    stroke: "#5a54a8", // indigo — thick solid
    dash: "",
    strokeWidth: 3.4,
  },
  "shared-kernel": {
    pattern: "shared-kernel",
    label: "Shared Kernel",
    abbreviation: "SK",
    description: "Teams share a small subset of the domain model; tightly coupled, requires sync.",
    symmetric: true,
    stroke: "#2f8f6b", // green — thick long-dash
    dash: "10 5",
    strokeWidth: 3.4,
  },
  "customer-supplier": {
    pattern: "customer-supplier",
    label: "Customer-Supplier",
    abbreviation: "C/S",
    description:
      "Upstream supplier, downstream customer; the customer's needs factor into upstream planning.",
    symmetric: false,
    stroke: "#c06a2b", // orange — dash-dot
    dash: "8 3 2 3",
    strokeWidth: 2.2,
  },
  "upstream-downstream": {
    pattern: "upstream-downstream",
    label: "Upstream-Downstream",
    abbreviation: "U/D",
    description: "The downstream depends on the upstream; upstream actions impact the downstream.",
    symmetric: false,
    stroke: "#6b6459", // grey — thin solid
    dash: "",
    strokeWidth: 2,
  },
  "separate-ways": {
    pattern: "separate-ways",
    label: "Separate Ways",
    abbreviation: "SW",
    description: "No integration; functionality is duplicated rather than integrated. Decoupled.",
    symmetric: true,
    stroke: "#968F81", // light grey — fine dotted, just dark enough for 3:1 on the canvas ground
    dash: "2 5",
    strokeWidth: 1.6,
  },
};
// brand-lint-enable

/** Maps a stroke style to an SVG/CSS dash array (empty string = solid). */
export function dashArray(style: StrokeStyle, strokeWidth = 2): string {
  switch (style) {
    case "dashed":
      return `${strokeWidth * 3} ${strokeWidth * 2}`;
    case "dotted":
      return `${strokeWidth} ${strokeWidth * 1.5}`;
    case "solid":
    default:
      return "";
  }
}

export const ALL_SUBDOMAIN_SPECS: readonly SubdomainTypeSpec[] =
  Object.values(SUBDOMAIN_TYPE_SPECS);
export const ALL_PATTERN_SPECS: readonly RelationshipPatternSpec[] = Object.values(
  RELATIONSHIP_PATTERN_SPECS,
);
