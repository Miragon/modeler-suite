import { test, type Page } from '@playwright/test';
import { registerShellConformance, type ShellSkip } from '@miragon/modeler-shell/testing';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import { labelEditorHooks } from '../support/label-editor.js';
import { shortcutsDialogHooks } from '../support/shortcuts-dialog.js';
import { openOrcaEditor, openShippedOrcaEditor, orcaTab } from './support/orca.js';

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the shell's
 * Orca stub), the cases of the VS Code webview's on the `ide` host. Orca has no diagnostics for a
 * custom editor, so the problems pill is absent. The `csp` case runs the built plugin under Orca's
 * frame policy. Any skip fails.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

test.describe('Orca editor: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'ide',
      ideHost: 'orca',
      themes: THEMES,
      csp: { open: openShippedOrcaEditor },
      async open(page, { size, requested, document: documentKey }) {
        // Orca has no high-contrast theme: the editor follows the system's prefers-contrast.
        await page.emulateMedia({ contrast: requested.kontrast ? 'more' : 'no-preference' });
        await openOrcaEditor(page, {
          size,
          theme: requested.theme,
          ...(documentKey ? { doc: documentKey } : {}),
        });
      },
      documents: ['empty', 'blank'],
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ['legend', 'inspector', 'problems', 'canvasMenuAction'],
      documentState: async (page) => `${(await orcaTab(page)).edits} edits`,
      labelEditor: labelEditorHooks(),
      shortcutsDialog: shortcutsDialogHooks('webview'),
      show: {
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({ severity: 'danger', text: shell.messages.invalidFile('diagram') });
          });
        },
        // The way Orca makes the file invalid: an outside change the canvas cannot show.
        async invalid(page) {
          await page.evaluate(() =>
            window.__modelerShellOrcaStub!.replace(
              'node a "Twice" [0, 0]\nnode a "Twice" [200, 0]\n',
            ),
          );
        },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
