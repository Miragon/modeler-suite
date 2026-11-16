/** the vocabulary of the arm rules (arm-rules.ts) */

/** where the board stands: the pan in px and the zoom */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * The board zoom a node is armed at. off: wherever the board stands; min1: at 1 or above; exact1:
 * at exactly 1, from below and from above.
 */
export const ARM_ZOOMS = ["off", "min1", "exact1"] as const;
export type ArmZoom = (typeof ARM_ZOOMS)[number];

/** a zoom of the board while a node is armed. free: goes on under the armed editor; disarm: disarms first; lock: is refused */
export const ARMED_ZOOMS = ["free", "disarm", "lock"] as const;
export type ArmedZoom = (typeof ARMED_ZOOMS)[number];

/** after Done or a click on the bare board. stay: the board stays; back: it returns to where it stood before the arming moved it */
export const ARM_RETURNS = ["stay", "back"] as const;
export type ArmReturn = (typeof ARM_RETURNS)[number];

/**
 * What the anchor of an arming is. pointer: a pointer gesture armed the node (the double-click)
 * and the anchor is the pointer. centre: no pointer (the Edit button, the keyboard, a host's call)
 * and the anchor is the node's centre. The zoom changes about the anchor, and the kind decides
 * where a node that is longer than the board's box ends up (armViewport).
 */
export type ArmAnchor = "pointer" | "centre";
