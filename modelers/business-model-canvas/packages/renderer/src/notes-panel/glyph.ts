import { COLORS } from "../draw/styles.js";

/** The quiet grey dot before every note, in the panel and the hover card. */
export const NOTE_DOT =
  '<svg class="bmc-note-glyph" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  `<circle cx="8" cy="8" r="7" fill="${COLORS.outline}" stroke="${COLORS.ink}" stroke-width="1"/></svg>`;
