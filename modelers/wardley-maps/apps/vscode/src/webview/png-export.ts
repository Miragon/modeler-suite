import type { GeistFace, PngExportOptions } from "@miragon/modeler-shell/export";
import { COLORS } from "@miragon/wardley-renderer";
import type { ExportFormat } from "../protocol.js";

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
