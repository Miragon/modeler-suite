import type Canvas from "diagram-js/lib/core/Canvas";
import { canvasSvg } from "./canvas-focus.js";

/**
 * Whether the board may look at this keydown at all: a synthetic `keydown` can come without a key,
 * a listener closer to the target (a menu, a dialog, a host's chrome) may have handled it already,
 * and a key typed while an input method composes belongs to the composition.
 */
export function isUnhandledKey(event: KeyboardEvent): boolean {
  return typeof event.key === "string" && !event.defaultPrevented && !event.isComposing;
}

/**
 * Whether the key is aimed at the canvas: its target is the canvas `<svg>` or lies inside it, the
 * element diagram-js 15 binds its own keyboard to. `<body>` does not count: right after a load,
 * after a click on page text or while a host hides the canvas, a key there is the page's.
 */
export function targetsCanvas(event: Event, canvas: Pick<Canvas, "getContainer">): boolean {
  const svg = canvasSvg(canvas);
  return svg !== null && event.target instanceof Node && svg.contains(event.target);
}
