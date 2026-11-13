import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';
import type { OpenContext } from '@miragon/modeler-shell/testing';
import { openOrcaEditorBundle } from '@miragon/modeler-shell/testing/orca-editor-bundle';
import { EXAMPLE_DIAGRAM } from '../../../../apps/ide-editor/src/examples.js';

export interface OpenOrcaOptions {
  size?: { width: number; height: number };
  theme?: 'light' | 'dark';
  doc?: string;
  text?: string;
}

/**
 * Opens the Orca test page (e2e/webview/orca-test.html: apps/orca/src/main.ts inside the shell's
 * Orca stub) and resolves once the editor's first import has settled.
 */
export async function openOrcaEditor(page: Page, options: OpenOrcaOptions = {}): Promise<void> {
  await page.setViewportSize(options.size ?? { width: 1280, height: 900 });
  const search = new URLSearchParams({ theme: options.theme ?? 'light' });
  if (options.doc) search.set('doc', options.doc);
  if (options.text !== undefined) search.set('text', options.text);
  await page.goto(`/orca-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.editorReady === true);
}

/** What the stub knows of Orca's tab once the session sent what it held back. */
export function orcaTab(
  page: Page,
): Promise<{ text: string; dirty: boolean; banner: boolean; edits: number }> {
  return page.evaluate(async () => {
    const stub = window.__modelerShellOrcaStub!;
    await stub.idle();
    return { text: stub.text, dirty: stub.dirty, banner: stub.banner, edits: stub.edits.length };
  });
}

const appsOrca = fileURLToPath(new URL('../../../../apps/orca', import.meta.url));
let pluginBuild: Promise<unknown> | undefined;

/**
 * The built plugin as Orca's isolated frame loads it, for the kit's `csp` case: apps/orca built
 * once per worker, its editor under Orca's frame policy with the shell's Orca stub.
 */
export async function openShippedOrcaEditor(
  page: Page,
  { size, requested }: OpenContext,
): Promise<void> {
  pluginBuild ??= promisify(execFile)(process.execPath, ['build.mjs'], { cwd: appsOrca });
  await pluginBuild;
  await page.setViewportSize(size);
  await openOrcaEditorBundle(page, {
    plugin: join(appsOrca, 'plugin'),
    text: EXAMPLE_DIAGRAM,
    colorScheme: requested.theme,
  });
  await page.locator('.djs-shape[data-element-id]').first().waitFor();
}
