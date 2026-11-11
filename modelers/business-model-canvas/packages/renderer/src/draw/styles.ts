import { fest, hell } from "../theme/cd-tokens.generated.json";

/**
 * Canvas colours: the light roles of the vendored tokens (guide §10.1), written as SVG
 * presentation values, so an export looks the same everywhere and stays light (§10.7).
 */
export const COLORS = {
  ink: hell["--cd-ui-text"],
  quiet: hell["--cd-ui-text-leise"],
  plot: hell["--cd-ui-plot"],
  surround: hell["--cd-ui-grund"],
  line: hell["--cd-ui-linie"],
  outline: hell["--cd-ui-kontur"],
  accent: hell["--cd-ui-icon-akzent"],
  white: fest["--cd-weiss"],
} as const;

/** SVG text does not inherit the container's font, so every text names the family (guide §4). */
export const FONT = {
  family: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif",
  sticky: 13,
  blockTitle: 14,
  hint: 13,
  title: 22,
  footer: 13,
  lineHeight: 1.3,
} as const;

/** A paper note: nearly sharp corners and a paper's shadow, a close one and a soft one. */
export const STICKY_RADIUS = 3;
export const STICKY_SHADOW = { color: fest["--cd-schwarz"], near: 0.08, far: 0.14 } as const;
/** The corner a note folds down, in px. */
export const NOTE_FOLD = 14;
/** White sheet, grey blocks on it: the canvas as a board. */
export const SHEET_RADIUS = 28;
export const SHEET_MARGIN = 8;
export const BLOCK_INSET = 6;
export const BLOCK_RADIUS = 20;
export const STICKY_PADDING = 8;
