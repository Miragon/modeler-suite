import type Canvas from "diagram-js/lib/core/Canvas";

/** The focusable `<svg>` diagram-js renders into the canvas container. */
export function canvasSvg(canvas: Pick<Canvas, "getContainer">): SVGSVGElement | null {
  return canvas.getContainer().querySelector<SVGSVGElement>(":scope > svg");
}

/**
 * Hands the focus to the canvas after a pointer action on the modeler's own controls. Without a
 * shell the pad entries take no focus, so the browser may have seen no pointer focus before this
 * script focus (on the first click on the page, or after the keyboard moved the focus) and would
 * draw its ring around the whole canvas although the pointer moved the focus.
 */
export function focusCanvasWithoutRing(canvas: Pick<Canvas, "getContainer" | "focus">): void {
  const svg = canvasSvg(canvas);
  if (svg) svg.focus({ preventScroll: true, focusVisible: false });
  else canvas.focus();
}
