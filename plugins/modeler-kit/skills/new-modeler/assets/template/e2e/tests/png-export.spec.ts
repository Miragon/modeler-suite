import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE } from '../../apps/webapp/src/example.js';
import { linkHash } from '../../apps/webapp/src/link.js';
import { EMBEDDED_GEIST, recordSvgImages, recordedSvgImages } from './support/svg-images.js';

/**
 * "Export as PNG" draws the diagram with the shell's `svgToPng` (`@miragon/modeler-shell/export`),
 * which embeds Geist from the page's own font faces. When it cannot, the app saves the picture all
 * the same and says so in a warning toast instead of the success one.
 */
const PNG_SIGNATURE = '89504e470d0a1a0a';

async function exportAsPng(page: Page): Promise<void> {
  await page.goto(`/${linkHash(EXAMPLE)}`);
  await page.waitForFunction(
    () => window.app?.ready === true && document.querySelector('.djs-shape') !== null,
  );
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
