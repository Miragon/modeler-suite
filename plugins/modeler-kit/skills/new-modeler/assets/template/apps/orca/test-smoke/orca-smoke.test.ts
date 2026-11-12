import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runOrcaSmoke } from '@miragon/modeler-shell/testing/orca-electron';
import { it } from 'vitest';

/*
 * The built plugin in a real Orca, what the stub of e2e cannot show: Orca's validate and check,
 * the load with its approval, the editor in both themes and Orca's logs. Edits, saves, undo and
 * the merge are the stub's (e2e project orca-editor). ORCA_APP is the extracted Orca;
 * ORCA_SMOKE_PLUGIN points at another build of the plugin.
 */
const orcaApp = fileURLToPath(new URL('..', import.meta.url));
const results = fileURLToPath(new URL('../../../test-results/orca-smoke', import.meta.url));

it('loads and shows a diagram in a real Orca', { timeout: 300_000 }, async () => {
  if (process.platform === 'darwin' && !process.env.ORCA_APP) {
    throw new Error("test:orca opens Orca's window on a Mac: run npm run test:orca:docker instead");
  }
  const prebuiltPlugin = process.env.ORCA_SMOKE_PLUGIN;
  if (!prebuiltPlugin) {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: orcaApp });
  }
  await runOrcaSmoke({
    plugin: prebuiltPlugin ?? fileURLToPath(new URL('../plugin', import.meta.url)),
    document: {
      name: 'smoke.__EXT__',
      text: readFileSync(
        new URL('../../../example/order-fulfilment.__EXT__', import.meta.url),
        'utf8',
      ),
    },
    results,
  });
});
