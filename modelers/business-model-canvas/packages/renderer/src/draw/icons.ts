import { COLORS, STICKY_RADIUS } from "./styles.js";
import { lucideIcon, PALETTE_TOOL_ICON } from "./lucide.js";

/** On the palette's white glass the paper needs an edge the canvas leaves to its shadow. */
const PREVIEW_EDGE_WIDTH = 1.5;

/** The palette shows what a creating entry creates: the sticky as the canvas draws it (§5.5). */
const STICKY_PREVIEW =
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
  `aria-hidden="true" focusable="false">` +
  `<rect x="4" y="6.5" width="18" height="14" rx="${STICKY_RADIUS}" fill="${COLORS.line}"/>` +
  `<rect x="3" y="5" width="18" height="14" rx="${STICKY_RADIUS}" fill="${COLORS.plot}" ` +
  `stroke="${COLORS.outline}" stroke-width="${PREVIEW_EDGE_WIDTH}"/></svg>`;

export const ICONS = {
  lassoTool: lucideIcon("square-dashed-mouse-pointer", PALETTE_TOOL_ICON),
  handTool: lucideIcon("hand", PALETTE_TOOL_ICON),
  createSticky: STICKY_PREVIEW,
} as const;

/** No native `title`: the chrome's tooltip names the entry from `title` and `shortcut`. */
export function paletteEntryHtml(iconSvg: string, draggable = false): string {
  return `<div class="entry"${draggable ? ' draggable="true"' : ""}>${iconSvg}</div>`;
}
