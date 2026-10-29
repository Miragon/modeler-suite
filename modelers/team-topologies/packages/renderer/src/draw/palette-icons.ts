/**
 * Tiny inline-SVG glyphs for the palette entries — the same shapes the canvas
 * draws (so the palette is a faithful preview of each team type / interaction
 * mode). Returned as HTML strings for diagram-js palette `html`.
 */

import {
  FLOW_SPEC,
  INTERACTION_MODE_SPECS,
  TEAM_TYPE_SPECS,
  dashArray,
} from "@miragon/team-topologies-schema-model";
import type { InteractionMode, TeamType } from "@miragon/team-topologies-schema-model";
import { PREMIXED_INTERACTION_FILLS } from "../theme/index.js";
import { ICON_SQUARE_DASHED_MOUSE_POINTER, iconMarkup } from "./icons.js";
import { UNDERLAY_EXTRA_WIDTH, underlayClass } from "./underlay.js";

/**
 * The lasso is a tool, not notation: a Lucide icon at the guide's tool size (§5.14, 20px with a
 * stroke of 2, which renders as heavy as the 16px chrome icons).
 */
const PALETTE_TOOL_ICON = { size: 20, strokeWidth: 2 } as const;

const PREVIEW_STROKE_WIDTH = 1.5;

type PreviewShape = (attributes: string) => string;

function svg(inner: string): string {
  return `<svg class="tt-palette-svg" width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">${inner}</svg>`;
}

/**
 * A notation preview's fill and contour as the canvas draws them, on the same underlays. Guide
 * §10.6 puts the previews in palette and legend under the canvas's exception, so a template
 * contour below 3:1 lies on the high-contrast underlay here too (#213), and the flow of change,
 * below 3:1 on the dark chrome as on the dark canvas, on the dark one: the fill carries the
 * underlay as a stroke 2px wider, and the contour is drawn above it.
 */
function previewOutline(shape: PreviewShape, fill: string, stroke: string, dash: string): string {
  const dashed = dash ? ` stroke-dasharray="${dash}"` : "";
  const contour = `stroke="${stroke}" stroke-width="${PREVIEW_STROKE_WIDTH}"${dashed}`;
  const underlay = underlayClass(stroke, undefined);
  if (!underlay) return shape(`fill="${fill}" ${contour}`);
  const underlayWidth = PREVIEW_STROKE_WIDTH + UNDERLAY_EXTRA_WIDTH;
  return (
    shape(
      `class="${underlay}" fill="${fill}" stroke="none" stroke-width="${underlayWidth}"${dashed}`,
    ) + shape(`fill="none" ${contour}`)
  );
}

export function teamIconSvg(type: TeamType): string {
  const s = TEAM_TYPE_SPECS[type];
  const dash = dashArray(s.strokeStyle, PREVIEW_STROKE_WIDTH);
  return svg(previewOutline(teamShape(s.shape), s.fill, s.stroke, dash));
}

function teamShape(shape: (typeof TEAM_TYPE_SPECS)[TeamType]["shape"]): PreviewShape {
  switch (shape) {
    case "octagon":
      return (attributes) =>
        `<polygon points="8,3 18,3 23,8 23,18 18,23 8,23 3,18 3,8" ${attributes}/>`;
    case "rounded-rect-vertical":
      return (attributes) => `<rect x="8" y="3" width="10" height="20" rx="4" ${attributes}/>`;
    case "rect":
      return (attributes) => `<rect x="3" y="7" width="20" height="12" rx="1.5" ${attributes}/>`;
    default:
      return (attributes) => `<rect x="3" y="8" width="20" height="10" rx="5" ${attributes}/>`;
  }
}

export function flowIconSvg(): string {
  const dash = dashArray(FLOW_SPEC.strokeStyle, PREVIEW_STROKE_WIDTH);
  const arrow: PreviewShape = (attributes) =>
    `<polygon points="3,9 16,9 16,5 23,13 16,21 16,17 3,17" stroke-linejoin="round" ${attributes}/>`;
  return svg(previewOutline(arrow, "none", FLOW_SPEC.stroke, dash));
}

export function annotationIconSvg(): string {
  return svg(
    `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">` +
      `<path d="M10 4H5v18h5"/><path d="M13 9h9M13 13h9M13 17h6"/></g>`,
  );
}

/** The lasso (multi-select) tool: Lucide square-dashed-mouse-pointer. */
export function lassoIconSvg(): string {
  return iconMarkup(ICON_SQUARE_DASHED_MOUSE_POINTER, {
    ...PALETTE_TOOL_ICON,
    className: "tt-palette-svg",
  });
}

export function interactionIconSvg(mode: InteractionMode): string {
  const s = INTERACTION_MODE_SPECS[mode];
  const dash = dashArray(s.strokeStyle, PREVIEW_STROKE_WIDTH);
  const fill = PREMIXED_INTERACTION_FILLS[mode];
  return svg(previewOutline(interactionShape(s.shape), fill, s.stroke, dash));
}

function interactionShape(
  shape: (typeof INTERACTION_MODE_SPECS)[InteractionMode]["shape"],
): PreviewShape {
  switch (shape) {
    case "circle":
      return (attributes) => `<circle cx="13" cy="13" r="9" ${attributes}/>`;
    case "triangle":
      return (attributes) => `<polygon points="5,6 22,13 5,20" ${attributes}/>`;
    default:
      return (attributes) => `<polygon points="9,6 23,6 17,20 3,20" ${attributes}/>`;
  }
}
