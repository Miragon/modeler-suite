import { svgToPng, type GeistFace, type PngExportOptions } from "@miragon/modeler-shell/export";
import { COLORS, blobToBase64 } from "@miragon/wardley-renderer";
import type { ExportFormat, WebviewToHost } from "../protocol.js";

export type PngFormat = Extract<ExportFormat, "png" | "png-transparent">;

export const PNG_EXPORT_FAILED = "Couldn't export the map as PNG. Try again, or export it as SVG.";

/**
 * A map has a plot, so its PNG lies on the plot role of the tokens (guide §10.7), not on the paper
 * the renderer's own rasteriser fills. The renderer's plot background is that role, pinned to
 * `--cd-ui-plot` by its `theme.sync.test.ts`.
 */
export function pngExportOptions(
  format: PngFormat,
  fonts: readonly GeistFace[],
  onFontFallback: () => void,
): PngExportOptions {
  return format === "png"
    ? { background: COLORS.plotBackground, fonts, onFontFallback }
    : { background: "transparent", scale: 4, fonts, onFontFallback };
}

type Rasterize = (svg: string, options: PngExportOptions) => Promise<Blob>;

/**
 * The `export` message of a PNG: the host warns instead of confirming when the picture came out in
 * the system font, so the flag travels with the data.
 */
export async function pngExportMessage(
  svg: string,
  format: PngFormat,
  fonts: readonly GeistFace[],
  rasterize: Rasterize = svgToPng,
): Promise<Extract<WebviewToHost, { type: "export" }>> {
  let fontFallback = false;
  const png = await rasterize(
    svg,
    pngExportOptions(format, fonts, () => {
      fontFallback = true;
    }),
  );
  return {
    type: "export",
    format,
    data: await blobToBase64(png),
    ...(fontFallback ? { fontFallback } : {}),
  };
}
