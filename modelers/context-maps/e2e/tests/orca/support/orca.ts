import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";

import type { OpenContext } from "@miragon/modeler-shell/testing";
import { openOrcaEditorBundle } from "@miragon/modeler-shell/testing/orca-editor-bundle";
import type { OrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { EXAMPLE_MAP } from "../../../../apps/ide-editor/src/examples.js";

/*
 * The Orca test page (e2e/webview/orca-test.html) runs apps/orca/src/main.ts inside the shell's
 * Orca stub and publishes the editor's parts on window for the tests.
 */
declare global {
  interface Window {
    __modelerShellOrcaStub?: OrcaEditorStub;
    editorReady?: boolean;
  }
}

export interface OpenOrcaOptions {
  size?: { width: number; height: number };
  theme?: "light" | "dark";
  map?: string;
  text?: string;
  readOnly?: boolean;
}

/** Opens the editor as Orca would and resolves once its first import has settled. */
export async function openOrcaEditor(page: Page, options: OpenOrcaOptions = {}): Promise<void> {
  await page.setViewportSize(options.size ?? { width: 1280, height: 900 });
  const search = new URLSearchParams({ theme: options.theme ?? "light" });
  if (options.map) search.set("map", options.map);
  if (options.text !== undefined) search.set("text", options.text);
  if (options.readOnly) search.set("readOnly", "");
  await page.goto(`/orca-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.editorReady === true);
}

/** What the stub knows of Orca's tab after the session sent what it held back. */
export async function orcaTab(
  page: Page,
): Promise<{ text: string; disk: string; dirty: boolean; banner: boolean; edits: number }> {
  return page.evaluate(async () => {
    const stub = window.__modelerShellOrcaStub!;
    await stub.idle();
    return {
      text: stub.text,
      disk: stub.disk,
      dirty: stub.dirty,
      banner: stub.banner,
      edits: stub.edits.length,
    };
  });
}

const appsOrca = fileURLToPath(new URL("../../../../apps/orca", import.meta.url));
let pluginBuild: Promise<unknown> | undefined;

/**
 * The built plugin as Orca's isolated frame loads it, for the shell kit's `csp` case: apps/orca
 * built once per worker, its editor under Orca's frame policy with the shell's Orca stub.
 */
export async function openShippedOrcaEditor(
  page: Page,
  { size, requested }: OpenContext,
): Promise<void> {
  pluginBuild ??= promisify(execFile)(process.execPath, ["build.mjs"], { cwd: appsOrca });
  await pluginBuild;
  await page.setViewportSize(size);
  await openOrcaEditorBundle(page, {
    plugin: join(appsOrca, "plugin"),
    text: EXAMPLE_MAP,
    colorScheme: requested.theme,
  });
  await page.locator(".cd-shell-canvas .djs-shape").first().waitFor();
}
