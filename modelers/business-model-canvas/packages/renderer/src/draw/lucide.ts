/*! @miragon/business-model-canvas-renderer icon geometry
 * Lucide (lucide-react 1.61.0 icon nodes) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors */

/*
 * The Lucide icons of the palette tools, the context pad, the note markers and the notes panel,
 * copied unchanged
 * from the icon nodes. Renderers never import the modeler shell, so they cannot take its copy.
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
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  "message-square-text":
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/>',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  palette:
    '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  trash:
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
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

/** Guide §11: icons in the chrome, the context pad included, 16px at stroke 2.5. */
export const CHROME_ICON: LucideIconOptions = { size: 16, strokeWidth: 2.5 };

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
