/**
 * The first fit of an embedded editor, in layout px. The board scales a preview with a CSS
 * transform, so a fit that reads client rects comes out wrong at any board zoom but 1.
 */
import type { ElementBounds } from "@miragon/modeler-api";
import type { Insets } from "../registry.js";

/** room for a renderer's own palette: a row at the top or a column at the left */
export const EDITOR_INSETS: Insets = { top: 64, right: 24, bottom: 24, left: 24 };

export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** the viewbox that centres `bounds` in the box minus the insets, at most at 100 % */
export function fitBox(
  bounds: ElementBounds,
  size: { width: number; height: number },
  insets: Insets,
): FitBox | undefined {
  if (!(size.width > 0 && size.height > 0) || !(bounds.width > 0 || bounds.height > 0))
    return undefined;
  const free = (total: number, before: number, after: number) => {
    const extent = total - before - after;
    return extent > 0 ? { start: before, extent } : { start: 0, extent: total };
  };
  const horizontal = free(size.width, insets.left, insets.right);
  const vertical = free(size.height, insets.top, insets.bottom);
  const scale = Math.min(
    1,
    bounds.width > 0 ? horizontal.extent / bounds.width : Infinity,
    bounds.height > 0 ? vertical.extent / bounds.height : Infinity,
  );
  const box = {
    x: bounds.x + bounds.width / 2 - (horizontal.start + horizontal.extent / 2) / scale,
    y: bounds.y + bounds.height / 2 - (vertical.start + vertical.extent / 2) / scale,
    width: size.width / scale,
    height: size.height / scale,
  };
  return Object.values(box).every(Number.isFinite) && scale > 0 ? box : undefined;
}
