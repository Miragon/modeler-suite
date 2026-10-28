/**
 * Picture export from the renderer's standalone SVG snapshot (`modeler.saveSVG()`): SVG as it is,
 * PNG through the shell's rasteriser at 2×, in Geist, on the light ground.
 */

import { MIRAGON } from "@miragon/context-maps-renderer";
import { svgToPng } from "@miragon/modeler-shell/export";
import { downloadBlob } from "./download";

/** `hell['--cd-ui-grund']`: a picture is light in every mode (guide §10.7); `theme.sync` pins it. */
const PNG_BACKGROUND = MIRAGON.grau;

export interface PngDownload {
  /** The labels fell back to the system sans: Geist could not be embedded. */
  readonly fontFallback: boolean;
}

export function downloadSvg(svg: string, fileName: string): void {
  downloadBlob(fileName, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

export async function downloadPng(svg: string, fileName: string): Promise<PngDownload> {
  let fontFallback = false;
  const png = await svgToPng(svg, {
    background: PNG_BACKGROUND,
    onFontFallback: () => {
      fontFallback = true;
    },
  });
  downloadBlob(fileName, png);
  return { fontFallback };
}
