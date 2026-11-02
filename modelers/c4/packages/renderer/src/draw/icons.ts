import { lucideIcon, PALETTE_TOOL_ICON } from "./lucide.js";

export const ICONS = {
  lassoTool: lucideIcon("square-dashed-mouse-pointer", PALETTE_TOOL_ICON),
  handTool: lucideIcon("hand", PALETTE_TOOL_ICON),
  connectTool: lucideIcon("workflow", PALETTE_TOOL_ICON),
} as const;

/** No native `title`: the chrome's tooltip names the entry from `title` and `shortcut`. */
export function paletteEntryHtml(iconSvg: string, draggable = false): string {
  return `<div class="entry"${draggable ? ' draggable="true"' : ""}>${iconSvg}</div>`;
}
