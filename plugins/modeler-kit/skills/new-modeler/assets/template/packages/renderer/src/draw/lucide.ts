/*! @miragon/__NOTATION__-renderer icon geometry
 * Lucide (lucide-static 1.59.0) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors */

/*
 * The Lucide icons of the palette tools, copied unchanged from
 * `icon-nodes.json`. Renderers never import the modeler shell, so they cannot take its copy.
 */
export const LUCIDE = {
  'square-dashed-mouse-pointer':
    '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
    '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/>' +
    '<path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/>' +
    '<path d="M21 9v2"/><path d="M3 14v1"/>',
  hand:
    '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>' +
    '<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/>' +
    '<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/>' +
    '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
} as const;

export type LucideIconName = keyof typeof LUCIDE;

export interface LucideIconOptions {
  /** Rendered width and height in px. */
  size: number;
  /** Stroke width on the 24 grid. */
  strokeWidth: number;
}

/** Guide §11: palette tools 20px at stroke 2; the shell draws the chrome's icons. */
export const PALETTE_TOOL_ICON: LucideIconOptions = { size: 20, strokeWidth: 2 };

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
