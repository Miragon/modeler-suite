import { expect, test } from '@playwright/test';
import { vsCodeStubSearch } from '@miragon/modeler-shell/testing';

/**
 * The webview cannot fetch its font files, so "Export as PNG" hands the shell's `svgToPng` Geist as
 * data: URLs. The extension host gets the PNG in Base64, and `inSystemFont` only when it could not
 * be embedded.
 */
const BASE64_PNG_SIGNATURE = 'iVBORw0KGgo';

test('VS Code webview: Export as PNG posts a picture and reports no font fallback', async ({
  page,
}) => {
  await page.goto(`/webview-test.html?${vsCodeStubSearch({ theme: 'light' })}`);
  await page.waitForFunction(() => window.webviewReady === true);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Export as PNG', exact: true }).click();
  const exported = await page
    .waitForFunction(() =>
      (window.__modelerShellVsCodeStub?.posted ?? []).find(
        (message) => (message as { type?: unknown }).type === 'export',
      ),
    )
    .then((handle) => handle.jsonValue() as Promise<Record<string, unknown>>);
  expect(exported).toMatchObject({ type: 'export', format: 'png' });
  expect(String(exported.data).startsWith(BASE64_PNG_SIGNATURE)).toBe(true);
  expect(exported).not.toHaveProperty('inSystemFont');
});
