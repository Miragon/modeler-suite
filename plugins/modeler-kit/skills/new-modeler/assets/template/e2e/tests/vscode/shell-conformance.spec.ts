import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test, type Page } from '@playwright/test';
import {
  registerShellConformance,
  vsCodeStubSearch,
  type OpenContext,
  type ShellSkip,
} from '@miragon/modeler-shell/testing';
import { openWebviewBundle } from '@miragon/modeler-shell/testing/webview-bundle';
import { EXAMPLE_DIAGRAM } from '../../../apps/vscode/src/examples.js';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';
import { labelEditorHooks } from '../support/label-editor.js';

/**
 * The shell's conformance kit against the real VS Code webview inside the shell's VS Code stub
 * (the `ide` host): geometry, ARIA and keys that never reach VS Code, keyboard creation, the label
 * editor across the shell's zoom, fit and refit, the read-only lock of an invalid file, the
 * appearance VS Code requests (a light-only modeler stays light, high contrast passes), reduced
 * motion, forced colours, the canvas's overlay layers and a clean teardown. `documents` adds the
 * file the "New Empty Diagram" command writes (EMPTY_DIAGRAM) and a file of zero bytes: each
 * opens at 100 % with the empty-file hint, which the first element takes away (the `emptyFile`
 * case), and the appearance case runs on them too. `csp` opens the production bundle under the
 * webview's CSP. Any skip fails.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

const appsVscode = fileURLToPath(new URL('../../../apps/vscode', import.meta.url));
let productionBuild: Promise<unknown> | undefined;

/**
 * The shipped webview as VS Code loads it, for the kit's `csp` case: apps/vscode built for
 * production once per worker, its bundle behind renderWebviewHtml's document and CSP with the
 * shell's VS Code stub, and the example handed over through `init` once the webview is ready, as
 * the extension does.
 */
async function openShippedWebview(page: Page, { size, requested }: OpenContext): Promise<void> {
  productionBuild ??= promisify(execFile)(
    process.execPath,
    ['esbuild.config.mjs', '--production'],
    { cwd: appsVscode },
  );
  await productionBuild;
  await page.setViewportSize(size);
  await openWebviewBundle(page, {
    dist: join(appsVscode, 'dist'),
    title: '__DISPLAY_NAME__',
    requested,
    themes: WEBVIEW_THEMES,
  });
  await page.waitForFunction(() =>
    (window.__modelerShellVsCodeStub?.posted ?? []).some(
      (message) => (message as { type?: unknown }).type === 'ready',
    ),
  );
  await page.evaluate((text) => window.postMessage({ type: 'init', text }, '*'), EXAMPLE_DIAGRAM);
  await page.locator('.djs-shape[data-element-id]').first().waitFor();
}

test.describe('VS Code webview: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'ide',
      themes: WEBVIEW_THEMES,
      csp: { open: openShippedWebview },
      async open(page, { size, requested, document: documentKey }) {
        await page.setViewportSize(size);
        const search = new URLSearchParams(vsCodeStubSearch(requested));
        if (documentKey) search.set('doc', documentKey);
        await page.goto(`/webview-test.html?${search.toString()}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      documents: ['empty', 'blank'],
      async destroy(page) {
        // the webview's own teardown path: connection, diagram (with its dialog), shell
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      // No legend, no inspector; VS Code has no File group and the menu no Model group, so no
      // entry acts on the canvas (a Model action without a dialog would: then drop it from here).
      absent: ['legend', 'inspector', 'canvasMenuAction'],
      labelEditor: labelEditorHooks((page) => page.evaluate(() => window.modeler!.exportText())),
      show: {
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: 'problems', count: 2, errors: 1 }, '*'),
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({ severity: 'danger', text: shell.messages.invalidFile('diagram') });
          });
        },
        // The way the extension host makes the file invalid: an update the canvas cannot show.
        async invalid(page) {
          await page.evaluate(() =>
            window.postMessage(
              { type: 'update', text: 'node a "Twice" [0, 0]\nnode a "Twice" [200, 0]\n' },
              '*',
            ),
          );
        },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        // The shortcutsDialog case needs shell.showShortcutsDialog of modeler-shell 0.7.0; the
        // template feeds it once its pin reaches that release.
        if (caseName === 'shortcutsDialog') return;
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
