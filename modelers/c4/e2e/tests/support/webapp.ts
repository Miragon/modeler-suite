import type { Page } from "@playwright/test";
import type { ViewKey } from "@miragon/c4-schema-model";
import { linkHash } from "../../../apps/webapp/src/link.js";
import type { Point } from "./canvas.js";
import { EXAMPLE } from "./documents.js";

/** The page of the web app with a link that holds `text`, opening on `view` when given. */
export async function workspaceLink(text: string = EXAMPLE, view?: ViewKey): Promise<string> {
  return `/${await linkHash(text, view)}`;
}

/** The app started and shows a diagram (a hash-only navigation keeps the page and replaces it). */
export async function showsDiagram(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.app?.ready === true &&
      !window.app.shell.isEmptyStateShown() &&
      document.querySelector(".djs-shape[data-element-id]") !== null,
  );
}

/** The app started, whatever it shows. */
export async function appReady(page: Page): Promise<void> {
  await page.waitForFunction(() => window.app?.ready === true);
}

/**
 * A new document, as on a first visit: from the app, a link that changes only the fragment keeps
 * the page, and with it the shell's legend state, which the shell reads once per mount.
 */
export async function openWorkspace(page: Page, text: string = EXAMPLE, view?: ViewKey) {
  await page.goto("about:blank");
  await page.goto(await workspaceLink(text, view));
  await showsDiagram(page);
}

/** The web host's empty document: the start screen of a fresh visit, then its "New diagram". */
export async function openNewDiagram(page: Page): Promise<void> {
  await page.goto("about:blank");
  await page.goto("/");
  await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
  await page.getByRole("button", { name: "New diagram" }).click();
  await page.locator('[data-chrome="empty-state"]').waitFor({ state: "hidden" });
}

const clearedPages = new WeakSet<Page>();

/**
 * Every visit of `page` from now on starts without what an earlier visit stored (the autosaved
 * workspace, the legend's state), as a first visit does.
 */
export async function forgetStorageOnEveryVisit(page: Page): Promise<void> {
  if (clearedPages.has(page)) return;
  clearedPages.add(page);
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // A blocked storage holds nothing either.
    }
  });
}

export function exportText(page: Page): Promise<string> {
  return page.evaluate(() => window.app!.modeler.exportText());
}

export function activeView(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.app!.modeler.getViewState()?.view);
}

/** A toast of the shell with exactly `text`. */
export function toast(page: Page, text: string | RegExp) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

export function startScreen(page: Page) {
  return page.locator('[data-chrome="empty-state"]');
}

/** "Show example" on the start screen of a fresh visit. */
export async function openExampleFromStartScreen(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
  await startScreen(page).getByRole("button", { name: "Show example" }).click();
  await startScreen(page).waitFor({ state: "hidden" });
  await showsDiagram(page);
}

/** The shell's canvas slot: diagram-js's container. */
export function canvasSlot(page: Page) {
  return page.locator(".cd-shell-canvas");
}

/**
 * The page coordinate of a point in diagram coordinates, for the current viewbox, so a spot stays
 * on the same place of the diagram whatever the zoom.
 */
export async function diagramPoint(page: Page, point: Point): Promise<Point> {
  const box = await canvasSlot(page).boundingBox();
  if (!box) throw new Error("the canvas slot has no bounding box");
  const viewbox = await page.evaluate(() =>
    window
      .app!.modeler.diagram.get<{ viewbox(): { x: number; y: number; scale: number } }>("canvas")
      .viewbox(),
  );
  return {
    x: box.x + (point.x - viewbox.x) * viewbox.scale,
    y: box.y + (point.y - viewbox.y) * viewbox.scale,
  };
}

export async function openMenu(page: Page) {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await dropdown.waitFor();
  return dropdown;
}
