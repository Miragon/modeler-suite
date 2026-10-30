import { expect, type Locator, type Page } from "@playwright/test";
import { cornerPixel, type Rgba } from "./png.js";

/** Kettle's own hit area in the Tea Shop example both hosts open; it has no colour of its own. */
const KETTLE = '.cd-shell-canvas .djs-shape[data-element-id="cmp_kettle"] > .djs-hit';

/** Opens Kettle's colour picker and leaves the keyboard's focus on the chosen colour. */
export async function focusChosenColour(page: Page): Promise<Locator> {
  await page.locator(KETTLE).click();
  await page.locator('.djs-context-pad .entry[data-action="color"]').click();
  const chosen = page.locator(".wardley-color-picker .wardley-cp-active");
  await expect(chosen).toBeFocused();
  // A pointer opened the picker, so its first focus shows no ring; the arrow keys bring it.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await expect(chosen).toBeFocused();
  expect(await chosen.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  return chosen;
}

export interface ChosenColourRings {
  /** How far the chosen colour's ring, the widest box shadow, reaches outside the swatch, in px. */
  readonly stateRingReach: number;
  /** Where the focus ring starts outside the swatch, in px. */
  readonly focusOffset: number;
  readonly focusWidth: number;
}

/** The two rings of the focused chosen colour, as its own document computes them. */
export function ringsOf(chosen: Locator): Promise<ChosenColourRings> {
  return chosen.evaluate((element) => {
    const style = getComputedStyle(element);
    const spreads = [...style.boxShadow.matchAll(/\S+px \S+px \S+px (\S+)px/g)].map((match) =>
      Number(match[1]),
    );
    return {
      stateRingReach: Math.max(...spreads),
      focusOffset: parseFloat(style.outlineOffset),
      focusWidth: parseFloat(style.outlineWidth),
    };
  });
}

/** The page as drawn at a point to the right of `element`'s middle, `distance` px outside it. */
export async function drawnRightOf(page: Page, element: Locator, distance: number): Promise<Rgba> {
  const box = await element.boundingBox();
  if (!box) throw new Error("the element is not drawn");
  const clip = {
    x: Math.floor(box.x + box.width + distance),
    y: Math.floor(box.y + box.height / 2),
    width: 1,
    height: 1,
  };
  return cornerPixel(page, await page.screenshot({ clip }));
}

function luminance([red, green, blue]: Rgba): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG's contrast ratio of two opaque colours. */
export function contrast(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}
