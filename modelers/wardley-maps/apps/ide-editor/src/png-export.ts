import { svgToPng, type GeistFace, type PngExportOptions } from "@miragon/modeler-shell/export";
import { COLORS } from "@miragon/wardley-renderer";

export type PngFormat = "png" | "png-transparent";

export const PNG_EXPORT_FAILED = "Couldn't export the map as PNG. Try again, or export it as SVG.";

/**
 * A map has a plot, so its PNG lies on the plot role of the tokens (guide §10.7), not on
 * `COLORS.paper`. The renderer's plot background is that role, pinned to `--cd-ui-plot` by its
 * `theme.sync.test.ts`.
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

/** "Export as PNG" (2×, on the plot) or its 4× transparent variant, for the host to save. */
export async function pngExport(
  svg: string,
  format: PngFormat,
  fonts: readonly GeistFace[],
  rasterize: Rasterize = svgToPng,
): Promise<{ data: Blob; fontFallback: boolean }> {
  let fontFallback = false;
  const data = await rasterize(
    svg,
    pngExportOptions(format, fonts, () => {
      fontFallback = true;
    }),
  );
  return { data, fontFallback };
}
