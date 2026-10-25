import { test, type Page } from '@playwright/test';
import { registerShellConformance, type ShellSkip } from '@miragon/modeler-shell/testing';
import { EXAMPLE } from '../../apps/webapp/src/example.js';
import { linkHash } from '../../apps/webapp/src/link.js';
import { THEMES } from '../../apps/webapp/src/themes.js';
import { labelEditorHooks } from './support/label-editor.js';

/**
 * The shell's conformance kit against the real web app (the `web` host): geometry at three
 * sizes, ARIA and keys, keyboard creation from the palette, the label editor across the shell's
 * zoom, fit and refit, the light-only mode under any system setting, the start screen, toasts, the
 * problems list, the drop zone and a clean teardown. The harness declares what the app does not
 * have; every other skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

/** The app started and shows a diagram (a hash-only navigation keeps the page and replaces it). */
const showsDiagram = (page: Page) =>
  page.waitForFunction(
    () =>
      window.app?.ready === true &&
      !window.app.shell.isEmptyStateShown() &&
      document.querySelector('.djs-shape') !== null,
  );

test.describe('web app: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'web',
      themes: THEMES,
      async open(page, { size }) {
        await page.setViewportSize(size);
        await page.goto(`/${linkHash(EXAMPLE)}`);
        await showsDiagram(page);
      },
      async destroy(page) {
        await page.evaluate(() => window.app?.destroy());
      },
      // No legend, no inspector; a failed import leaves the diagram as it was (no invalid-file
      // state); the parser's problems name lines, not elements (no row selects one).
      absent: ['legend', 'inspector', 'invalid', 'problemSelection'],
      show: {
        async problems(page) {
          await page.goto(
            `/?problems${linkHash(`${EXAMPLE}node broken [1, 2]\nnot a statement\n`)}`,
          );
          await showsDiagram(page);
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.app!.shell;
            shell.setStatus({ severity: 'danger', text: shell.messages.invalidFile('diagram') });
          });
        },
        async emptyState(page) {
          await page.goto('/');
          await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
        },
        async toast(page, { status, text, actionLabel }) {
          await page.evaluate(
            ({ status, text, actionLabel }) => {
              window.app!.shell.toast({
                status,
                text,
                ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
              });
            },
            { status, text, actionLabel },
          );
        },
      },
      labelEditor: labelEditorHooks((page) =>
        page.evaluate(() => window.app!.modeler.exportText()),
      ),
      drop: {
        // A .__EXT__ file has no MIME type the browser knows; a picture is refused while dragged.
        accepted: { name: 'diagram.__EXT__', type: '', text: EXAMPLE },
        rejected: { name: 'picture.png', type: 'image/png', text: 'x' },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        // The emptyFile case needs harness.documents of a modeler-shell release after 0.5.0; the
        // template feeds it once its pin reaches that release.
        if (caseName === 'emptyFile') return;
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
