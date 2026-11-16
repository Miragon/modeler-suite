/**
 * What the browser files of this package ask of a board they mounted through `mountHostBoard`:
 * the state a node says, the place of what a person clicks, the arming by a real double-click.
 */
import { expect } from "vitest";
import { commands } from "vitest/browser";

import type { HostBoard } from "./board.js";

/** an editor answers and the board moves within a few frames, and slower on a busy machine */
export const SOON = { timeout: 8000 };
export const OUTSIDE_THE_BOARD = { x: 1250, y: 770 };

export const stateOf = (mounted: HostBoard, id: string): string | undefined =>
  mounted.engine(id).dataset.embedState;
export const badgeOf = (mounted: HostBoard, id: string): HTMLElement => {
  const badge = mounted.engine(id).querySelector<HTMLElement>(":scope > .board-host-state");
  if (!badge) throw new Error(`the node ${id} has no state badge`);
  return badge;
};
export async function ready(mounted: HostBoard, ...ids: string[]): Promise<void> {
  for (const id of ids) await expect.poll(() => stateOf(mounted, id), SOON).toBe("ready");
}

export const centreOf = (element: Element): { x: number; y: number } => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};
export const itemOf = (mounted: HostBoard, id: string, item: string): Element => {
  const hit = mounted.engine(id).querySelector(`.djs-shape[data-element-id="${item}"] .djs-hit`);
  if (!hit) throw new Error(`the editor of ${id} draws no item ${item}`);
  return hit;
};
export const paletteOf = (mounted: HostBoard, id: string): HTMLElement => {
  const palette = mounted.engine(id).querySelector<HTMLElement>(".djs-container > .djs-palette");
  if (!palette) throw new Error(`the editor of ${id} has no palette`);
  return palette;
};
export const zoomOf = (mounted: HostBoard): number =>
  (mounted.modeler.getViewState() as { zoom: number }).zoom;
export const inLayer = (mounted: HostBoard, id: string): boolean =>
  mounted.engine(id).parentElement?.classList.contains("board-overlay-layer") === true;

/** a real double-click below the model's content, as a person arms a model */
export async function arm(mounted: HostBoard, id: string): Promise<void> {
  const body = mounted.engine(id).getBoundingClientRect();
  await commands.realInput([
    { type: "dblclick", x: body.left + body.width / 2, y: body.top + body.height * 0.92 },
  ]);
  await expect.poll(() => mounted.runtime.armedId(), SOON).toBe(id);
  await expect.poll(() => inLayer(mounted, id), SOON).toBe(true);
  await mounted.settle();
}

/**
 * Lets everything the backend said so far arrive at the page: the port's messages keep their
 * order, so the answer to a question asked now comes after them. For a test that expects
 * nothing to happen, which cannot poll for it.
 */
export async function delivered(mounted: HostBoard): Promise<void> {
  await mounted.files.readBytes("assets/logo.png");
  await mounted.settle();
}

/** the contrast of two colours as `getComputedStyle` writes them */
export function contrast(foreground: string, background: string): number {
  const luminance = (colour: string): number => {
    const channels = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const [red = 0, green = 0, blue = 0] = channels.map((value) => {
      const part = value / 255;
      return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}
