import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE } from '../../apps/webapp/src/example.js';
import { linkHash } from '../../apps/webapp/src/link.js';
import { EMBEDDED_GEIST, recordSvgImages, recordedSvgImages } from './support/svg-images.js';

/**
 * "Export as PNG" draws the diagram with the shell's `svgToPng` (`@miragon/modeler-shell/export`),
 * which embeds Geist from the page's own font faces. When it cannot, the app saves the picture all
 * the same and says so in a warning toast instead of the success one. When the shell rejects, the
 * toast holds the app's own sentence, never the shell's developer text.
 */
const PNG_SIGNATURE = '89504e470d0a1a0a';

async function openExample(page: Page): Promise<void> {
  await page.goto(`/${linkHash(EXAMPLE)}`);
  await page.waitForFunction(
    () => window.app?.ready === true && document.querySelector('.djs-shape') !== null,
  );
}

async function exportAsPng(page: Page): Promise<void> {
  await openExample(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export as PNG', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
}

test('web app: Export as PNG saves a picture with Geist embedded', async ({ page }) => {
  await recordSvgImages(page);
  await exportAsPng(page);
  await expect(page.getByText(/^Exported .*\.png\.$/)).toBeVisible();
  const [svg] = await recordedSvgImages(page);
  expect(svg).toContain(EMBEDDED_GEIST.family);
  expect(svg).toMatch(EMBEDDED_GEIST.file);
});

test('web app: Export as PNG says so when Geist cannot be embedded', async ({ page }) => {
  await recordSvgImages(page);
  await page.route(/\.woff2(\?.*)?$/, (route) => route.abort());
  await exportAsPng(page);
  await expect(
    page.getByText(/^Exported .*\.png in a system font\. Geist couldn't be embedded\.$/),
  ).toBeVisible();
  const [svg] = await recordedSvgImages(page);
  expect(svg).not.toContain('@font-face');
});

test("web app: a picture the browser cannot draw shows the app's own text", async ({ page }) => {
  await openExample(page);
  await page.evaluate(() => {
    window.app!.modeler.diagram.saveSVG = () => ({ svg: 'this is no SVG' });
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Export as PNG', exact: true }).click();
  await expect(
    page.getByText("Couldn't export the diagram as PNG. Try again, or export it as SVG.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('@miragon/modeler-shell')).toHaveCount(0);
  expect(downloads).toEqual([]);
});
