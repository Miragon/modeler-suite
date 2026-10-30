/*! @miragon/context-maps-renderer icon geometry
 * Lucide (lucide-static 1.59.0) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Derived from Feather, as Lucide's LICENSE lists them: arrow-right, circle-x, trash,
 * triangle-alert and x. Feather @license MIT
 * Copyright (c) 2013-present Cole Bemis */

/**
 * The Lucide icons of the in-canvas chrome (context pad, connect handles, the lasso tool, the
 * Close buttons of the title dialog and the legend) and of the team glyph on the canvas, inlined
 * so the renderer has no icon runtime dependency. Copied unchanged from lucide-static 1.59.0
 * (`icon-nodes.json`).
 */
export const LUCIDE = {
  "arrow-left-right":
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "circle-x": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  "sliders-horizontal":
    '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  "square-dashed-mouse-pointer":
    '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/>',
  "square-plus":
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  "text-align-start": '<path d="M21 5H3"/><path d="M15 12H3"/><path d="M17 19H3"/>',
  "triangle-alert":
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  trash:
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
} as const;

export type LucideIconName = keyof typeof LUCIDE;

/** Guide §11: stroke 2.5 in units of the 24 grid, so the line grows with the icon's size. */
export const LUCIDE_STROKE_WIDTH = 2.5;

function lucideSvg(name: LucideIconName, size: number, strokeWidth: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LUCIDE[name]}</svg>`;
}

/**
 * A chrome icon (guide §5.14, §11): 16px with stroke 2.5 on the 24 grid, so the stroke matches the
 * shell's chrome icons; `currentColor`, so the surrounding role decides the colour.
 */
export function chromeIcon(name: LucideIconName): string {
  return lucideSvg(name, 16, LUCIDE_STROKE_WIDTH);
}

/** A palette tool icon (guide §5.5): 20px with stroke 2, the same 1.67px line as the chrome. */
export function toolIcon(name: LucideIconName): string {
  return lucideSvg(name, 20, 2);
}
