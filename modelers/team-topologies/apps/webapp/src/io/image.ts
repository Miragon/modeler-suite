/**
 * Image export from the renderer's standalone SVG snapshot (`modeler.saveSVG()`).
 * SVG downloads directly; PNG goes through the shell's `svgToPng`, which embeds Geist and draws
 * at 2× on the background guide §10.7 names for a notation without a plot.
 */

import { svgToPng } from "@miragon/modeler-shell/export";
import tokens from "../../../../packages/renderer/src/theme/cd-tokens.generated.json";
import { downloadBlob, slugify } from "./download";

const PNG_BACKGROUND = tokens.hell["--cd-ui-grund"];

export function downloadSvg(svg: string, title: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(`${slugify(title)}.svg`, blob);
}

export interface PngDownloadOptions {
  /** Called when Geist could not be embedded and the labels came out in the system sans. */
  onFontFallback(reason: unknown): void;
}

export async function downloadPng(
  svg: string,
  title: string,
  options: PngDownloadOptions,
): Promise<void> {
  const png = await svgToPng(svg, {
    background: PNG_BACKGROUND,
    onFontFallback: options.onFontFallback,
  });
  downloadBlob(`${slugify(title)}.png`, png);
}
