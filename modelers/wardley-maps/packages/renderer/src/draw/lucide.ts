/*! @miragon/wardley-renderer icon geometry: the context pad icons. Lucide (lucide-static 1.59.0)
 * @license ISC Copyright (c) 2026 Lucide Icons and Contributors
 * arrow-right, chevrons-right, circle-plus, external-link, link, map and trash derive from Feather
 * @license MIT, Copyright (c) 2013-present Cole Bemis
 * Full notices: README.md of @miragon/wardley-renderer */

/**
 * The Lucide icons of the context pad (guide §5.14), inlined so the renderer has no icon runtime
 * dependency. Copied unchanged from lucide-static 1.59.0 (`icon-nodes.json`), except
 * `chevrons-right-x`.
 */
export const LUCIDE = {
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash:
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  "circle-plus": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "chevrons-right": '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
  // Lucide has no crossed-out chevrons-right, and its `m2 2 20 20` slash runs parallel to the
  // chevrons' upper strokes, so at 16px a slashed variant no longer reads as chevrons. Drawn after
  // icon-design §C instead: `chevrons-right` moved up and left by (2, 1), with the corner `x` of
  // Lucide's `calendar-x-2`.
  "chevrons-right-x":
    '<path d="m4 16 5-5-5-5"/><path d="m11 16 5-5-5-5"/><path d="m17 16 5 5"/><path d="m17 21 5-5"/>',
  "sliders-horizontal":
    '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  "line-style":
    '<path d="M11 5h2"/><path d="M15 12h6"/><path d="M19 5h2"/><path d="M3 12h6"/><path d="M3 19h18"/><path d="M3 5h2"/>',
  palette:
    '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  "external-link":
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
} as const;

export type LucideIconName = keyof typeof LUCIDE;

/**
 * A chrome icon (guide §5.14, §11): 16px with stroke 2.5 on the 24 grid, so the stroke matches the
 * shell's chrome icons; `currentColor`, so the surrounding role decides the colour.
 */
export function chromeIcon(name: LucideIconName): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${LUCIDE[name]}</svg>`;
}
