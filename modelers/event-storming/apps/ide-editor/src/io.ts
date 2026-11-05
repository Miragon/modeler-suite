/**
 * Image export for the editor: the shell turns the board's SVG into a PNG (a picture, no embedded
 * source). The host shows the save dialog and writes the bytes.
 */

import { COLORS } from "@miragon/event-storming-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";
import { GEIST_FACES } from "./geist-faces.js";

/** Guide §10.7: the ground of "Export as PNG" is `hell['--cd-ui-grund']`; a unit test pins it. */
export const PNG_BACKGROUND = COLORS.paper;

export interface BoardPng {
  readonly png: Blob;
  /** The labels came out in the system font because Geist could not be embedded. */
  readonly fontFallback: boolean;
}

/** "Export as PNG" (2×, on the paper) or, `transparent`, "Export as PNG (4×, transparent)". */
export async function boardPng(svg: string, transparent = false): Promise<BoardPng> {
  let fontFallback = false;
  const png = await svgToPng(svg, {
    ...(transparent ? { background: "transparent", scale: 4 } : { background: PNG_BACKGROUND }),
    fonts: GEIST_FACES,
    onFontFallback: () => {
      fontFallback = true;
    },
  });
  return { png, fontFallback };
}
