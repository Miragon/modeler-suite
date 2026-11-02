/*! @miragon/c4-renderer context pad icons
 * Lucide (lucide 1.61.0) @license ISC
 * Copyright (c) 2026 Lucide Icons and Contributors */

import { LUCIDE, LUCIDE_STROKE_WIDTH } from "../draw/lucide.js";

/*
 * The context pad's Lucide icons (SPEC 5.3) and the inspector's Close, copied unchanged from
 * `icon-nodes.json`; the connect entry shares the palette's `workflow`.
 */
const PAD_ICONS = {
  workflow: LUCIDE.workflow,
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
    '<path d="m15 5 4 4"/>',
  text: '<path d="M21 5H3"/><path d="M15 12H3"/><path d="M17 19H3"/>',
  cpu:
    '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/>' +
    '<path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/>' +
    '<path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/>' +
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  "eye-off":
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
    '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
    '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
    '<path d="m2 2 20 20"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "trash-2":
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
} as const;

export type PadIconName = keyof typeof PAD_ICONS;

/** Guide §8: the pad's icons are 16px. */
const PAD_ICON_SIZE = 16;

export function padIcon(name: PadIconName, size = PAD_ICON_SIZE): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${LUCIDE_STROKE_WIDTH}" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `${PAD_ICONS[name]}</svg>`
  );
}

/**
 * An append entry: the palette's preview of the element it creates, in the look it lands in, set
 * at the pad's icon size by `contextPad.css`.
 */
export function padPreviewEntryHtml(previewSvg: string): string {
  return `<div class="entry c4-pad-entry c4-pad-entry--preview" draggable="true">${previewSvg}</div>`;
}

/** No native `title` here: diagram-js writes the entry's `title` itself. */
export function padEntryHtml(
  icon: PadIconName,
  options: { draggable?: boolean; danger?: boolean } = {},
): string {
  const classes = options.danger ? "entry c4-pad-entry c4-pad-entry--danger" : "entry c4-pad-entry";
  return `<div class="${classes}"${options.draggable ? ' draggable="true"' : ""}>${padIcon(icon)}</div>`;
}
