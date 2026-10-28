import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { EXAMPLE } from '../../apps/webapp/src/example.js';
import { linkHash } from '../../apps/webapp/src/link.js';

/**
 * "Export as PNG" draws the diagram with the shell's `svgToPng` (`@miragon/modeler-shell/export`),
 * which embeds Geist from the page's own font faces. When it cannot, the app says so in a warning
 * toast instead of the success one.
 */
const PNG_SIGNATURE = '89504e470d0a1a0a';

test('web app: Export as PNG saves a picture and reports no font fallback', async ({ page }) => {
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
  await expect(page.getByText(/^Exported .*\.png\.$/)).toBeVisible();
});
