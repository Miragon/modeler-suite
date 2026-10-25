import { test, type Page } from '@playwright/test';
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from '@miragon/modeler-shell/testing';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';
import { labelEditorHooks } from '../support/label-editor.js';

/**
 * The shell's conformance kit against the real VS Code webview inside the shell's VS Code stub
 * (the `ide` host): geometry, ARIA and keys that never reach VS Code, keyboard creation, the label
 * editor across the shell's zoom, fit and refit, the read-only lock of an invalid file, the
 * appearance VS Code requests (a light-only modeler stays light, high contrast passes) and a clean
 * teardown.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

test.describe('VS Code webview: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'ide',
      themes: WEBVIEW_THEMES,
      async open(page, { size, requested }) {
        await page.setViewportSize(size);
        await page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
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
        // The csp case needs openWebviewBundle of a modeler-shell release after 0.5.0; until the
        // template moves to it, webview-bundle.spec.ts checks the bundle under the webview CSP.
        if (caseName === 'csp') return;
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
