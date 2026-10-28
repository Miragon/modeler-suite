import { expect, type Download, type Locator, type Page } from "@playwright/test";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import type { CollaborativeValueChainModeler } from "@miragon/value-chain-renderer";
import { encodeDocument } from "../../../apps/webapp/src/share.js";

/** The web app's parts (apps/webapp/src/main.ts), published once its first diagram is in place. */
export interface ValueChainApp {
  readonly ready: boolean;
  readonly shell: ShellHandle;
  readonly modeler: CollaborativeValueChainModeler;
  readonly connection: DiagramJsConnection;
  destroy(): void;
}

declare global {
  interface Window {
    __valueChainApp?: ValueChainApp;
  }
}

export interface ExportedDocument {
  readonly meta: { readonly name: string };
  readonly elements: ReadonlyArray<{ id: string; elementType: string; name: string }>;
  readonly connections: ReadonlyArray<{ id: string; connectionType: string }>;
}

export async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__valueChainApp?.ready === true);
}

export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await waitForApp(page);
}

export async function linkTo(text: string): Promise<string> {
  return `/#mz=${await encodeDocument(text)}`;
}

export function exportText(page: Page): Promise<string> {
  return page.evaluate(() => window.__valueChainApp!.modeler.exportText());
}

export async function exportDocument(page: Page): Promise<ExportedDocument> {
  return JSON.parse(await exportText(page)) as ExportedDocument;
}

export function startScreen(page: Page): Locator {
  return page.locator('[data-chrome="empty-state"]');
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

export function fileInput(page: Page): Locator {
  return page.locator('body > input[type="file"]');
}

export async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The shell's canvas slot: diagram-js's container. */
export function canvasSlot(page: Page): Locator {
  return page.locator(".cd-shell-canvas");
}

/**
 * Absolute page coordinate of a point in diagram coordinates, for the current viewbox, so a spot
 * stays on the same place of the diagram whatever the zoom.
 */
export async function diagramPoint(page: Page, point: Point): Promise<Point> {
  const box = await canvasSlot(page).boundingBox();
  if (!box) throw new Error("the canvas slot has no bounding box");
  const viewbox = await page.evaluate(() =>
    window
      .__valueChainApp!.modeler.diagram.get<{
        viewbox(): { x: number; y: number; scale: number };
      }>("canvas")
      .viewbox(),
  );
  return {
    x: box.x + (point.x - viewbox.x) * viewbox.scale,
    y: box.y + (point.y - viewbox.y) * viewbox.scale,
  };
}

/** "Show example" on the start screen of a fresh visit. */
export async function openExample(page: Page): Promise<void> {
  await startScreen(page).getByRole("button", { name: "Show example" }).click();
  await expect(startScreen(page)).toBeHidden();
  await expect(page.locator(".djs-shape[data-element-id]").first()).toBeVisible();
}

export async function readDownload(download: Promise<Download>): Promise<string> {
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
