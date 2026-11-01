import type { Locator, Page } from "@playwright/test";

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An element's shape on the canvas, by its document id (a boundary's is `boundary:<id>`). */
export function shape(page: Page, id: string): Locator {
  return page.locator(`.djs-shape[data-element-id="${id}"]`);
}

export async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("the locator has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Somewhere in the upper half of an element's shape: on its name, away from the drill badge. */
export async function nameSpotOf(page: Page, id: string): Promise<Point> {
  const box = await shape(page, id).boundingBox();
  if (!box) throw new Error(`the shape ${id} has no bounding box`);
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
}

/** Whether the element is the one element selected on the canvas. */
function selectedAlone(page: Page, id: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    const diagram = (window.app?.modeler ?? window.modeler)!.diagram;
    const selected = diagram.get<{ get(): Array<{ id: string }> }>("selection").get();
    return selected.length === 1 && selected[0]!.id === wanted;
  }, id);
}

/**
 * A click on the element, which selects it and gives the canvas the keyboard. diagram-js takes a
 * click on the one selected element as a toggle, so that one only gets the focus.
 */
export async function select(page: Page, id: string): Promise<void> {
  if (await selectedAlone(page, id)) {
    await page.locator(".djs-container > svg").focus();
    return;
  }
  const spot = await nameSpotOf(page, id);
  await page.mouse.click(spot.x, spot.y);
}

/** A pointer drag of an element by `by`, in steps past diagram-js's drag threshold. */
export async function dragBy(page: Page, id: string, by: Point): Promise<void> {
  const from = await nameSpotOf(page, id);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x / 2, from.y + by.y / 2, { steps: 6 });
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 6 });
  await page.mouse.up();
}

export const labelEditor = (page: Page) => page.locator("textarea.diagram-label-editor");

/** E on a selected element opens its name in the label editor; Enter commits the new one. */
export async function rename(page: Page, id: string, name: string): Promise<void> {
  await select(page, id);
  await page.keyboard.press("e");
  await labelEditor(page).waitFor();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await labelEditor(page).waitFor({ state: "detached" });
}
