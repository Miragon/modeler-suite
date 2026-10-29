import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { formatVsCodeSmoke, runVsCodeSmoke } from '@miragon/modeler-shell/testing/vscode-electron';
import { parseText } from '@miragon/__NOTATION__-dsl';
import { THEMES } from '@miragon/__NOTATION__-renderer/themes';
import { EXAMPLE_DIAGRAM } from '../src/examples.js';

/*
 * The built extension in a real VS Code, what the stub of e2e cannot show: the webview inside VS
 * Code's frames, a canvas edit that dirties the tab, save and undo through VS Code's keybindings,
 * and the theme bridge under VS Code's four default themes, with a screenshot each. The first run
 * downloads VS Code into the OS's cache directory (about 350 MB, 0.9 GB unpacked).
 *
 * VSCODE_VERSION picks the VS Code (`stable`, `1.96.0`; default the newest stable release that
 * satisfies engines.vscode), so CI runs the engines floor too. VSCODE_SMOKE_EXTENSION points at
 * another build of the extension: the release smoke-tests the unpacked VSIX it is about to upload.
 * VSCODE_SMOKE_KEEP=1 keeps VS Code's profile, so CI can upload VS Code's logs of a failed run.
 */
it('__DISPLAY_NAME__ in a real VS Code', { timeout: 600_000 }, async () => {
  const result = await runVsCodeSmoke({
    extensionPath:
      process.env.VSCODE_SMOKE_EXTENSION || fileURLToPath(new URL('..', import.meta.url)),
    fixture: { fileName: 'order-fulfilment.__EXT__', text: EXAMPLE_DIAGRAM },
    parse(text) {
      const { diagnostics } = parseText(text);
      if (diagnostics.length > 0) {
        throw new Error(diagnostics.map(({ line, message }) => `${line}: ${message}`).join('; '));
      }
    },
    themes: THEMES,
    name: '__NOTATION__',
    screenshotDir: 'test-results/vscode-smoke',
    vscodeVersion: process.env.VSCODE_VERSION || undefined,
    keepTemporaryFiles: process.env.VSCODE_SMOKE_KEEP === '1',
    log: console.log,
  });
  console.log(formatVsCodeSmoke(result));
  expect(result.failures).toEqual([]);
});
