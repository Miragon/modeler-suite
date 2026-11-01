/*! @miragon/c4-renderer icon geometry
 * Lucide (lucide-static 1.59.0, lucide 1.61.0) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors */

/*
 * The Lucide icons of the palette tools and of the canvas's drill badge, copied unchanged from
 * `icon-nodes.json`. Renderers never import the modeler shell, so they cannot take its copy.
 */
export const LUCIDE = {
  "square-dashed-mouse-pointer":
    '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
    '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/>' +
    '<path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/>' +
    '<path d="M21 9v2"/><path d="M3 14v1"/>',
  hand:
    '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>' +
    '<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/>' +
    '<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/>' +
    '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  workflow:
    '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/>' +
    '<rect width="8" height="8" x="13" y="13" rx="2"/>',
  "zoom-in":
    '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>' +
    '<line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
} as const;

/** The drill badge's icon as nodes, for drawing it into the canvas without parsing markup. */
export const ZOOM_IN_NODES: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
  ["circle", { cx: "11", cy: "11", r: "8" }],
  ["line", { x1: "21", x2: "16.65", y1: "21", y2: "16.65" }],
  ["line", { x1: "11", x2: "11", y1: "8", y2: "14" }],
  ["line", { x1: "8", x2: "14", y1: "11", y2: "11" }],
];

/** Lucide `chevron-right`, the breadcrumb's separator. */
export const CHEVRON_RIGHT_NODES: readonly (readonly [string, Readonly<Record<string, string>>])[] =
  [["path", { d: "m9 18 6-6-6-6" }]];

export type LucideIconName = keyof typeof LUCIDE;

export interface LucideIconOptions {
  /** Rendered width and height in px. */
  size: number;
  /** Stroke width on the 24 grid. */
  strokeWidth: number;
}

/** Guide §11: palette tools 20px at stroke 2; the shell draws the chrome's icons. */
export const PALETTE_TOOL_ICON: LucideIconOptions = { size: 20, strokeWidth: 2 };

/** Guide §11: every other Lucide icon at stroke 2.5 on the 24 grid, the canvas's too. */
export const LUCIDE_STROKE_WIDTH = 2.5;

export function lucideIcon(
  name: LucideIconName,
  options: LucideIconOptions = PALETTE_TOOL_ICON,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.size}" height="${options.size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${options.strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `${LUCIDE[name]}</svg>`
  );
}
