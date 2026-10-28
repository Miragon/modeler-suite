import type { PngExportOptions } from "@miragon/modeler-shell/export";
import { COLORS } from "@miragon/wardley-renderer";

export type PngKind = "png" | "png-transparent";

export const PNG_EXPORT_FAILED = "Couldn't export the map as PNG. Try again, or export it as SVG.";

export function fontFallbackText(fileName: string): string {
  return `Exported ${fileName} in a system font. Geist couldn't be embedded.`;
}

/**
 * A map has a plot, so its PNG lies on the plot role of the tokens (guide §10.7), not on the paper
 * the renderer's own rasteriser fills. The renderer's plot background is that role, pinned to
 * `--cd-ui-plot` by its `theme.sync.test.ts`.
 */
export function pngExportOptions(kind: PngKind, onFontFallback: () => void): PngExportOptions {
  return kind === "png"
    ? { background: COLORS.plotBackground, onFontFallback }
    : { background: "transparent", scale: 4, onFontFallback };
}
