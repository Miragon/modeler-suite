import type { WardleyShape } from "../model/di-types.js";

/**
 * The priority at which explore mode's chrome (chips, toolbar, context pad, start menu) follows
 * `EXPLORE_CHANGED`: ahead of a host's listener at the default priority, which so hears of a change
 * once the chrome shows it.
 */
export const EXPLORE_CHROME_PRIORITY = 1500;

/**
 * Enter or Space on a button or an entry arrives as a click without a pointer (`detail === 0`),
 * every pointer click has 1 or more.
 */
export function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}

/** A component's name on one line, as a label of the chrome reads it. */
export function nameOf(shape: WardleyShape): string {
  return shape.wardleyLabel.replace(/\s+/g, " ").trim();
}
