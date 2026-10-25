import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import type { CollaborativeTeamTopologiesModeler } from "@miragon/team-topologies-renderer";
import type { Appearance, ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import { vsCodeStubSearch, type OpenContext } from "@miragon/modeler-shell/testing";
import { openWebviewBundle } from "@miragon/modeler-shell/testing/webview-bundle";
import type { VsCodeWebviewStub } from "@miragon/modeler-shell/testing/vscode-stub";
import { EXAMPLE_MAP } from "../../../../apps/vscode/src/examples.js";
import { WEBVIEW_THEMES } from "../../../../apps/vscode/src/themes.js";

/*
 * The webview test page (e2e/webview/webview-test.html) runs apps/vscode/src/webview/main.ts inside
 * the modeler shell's VS Code stub and publishes the webview's parts on window for the tests.
 */
declare global {
  interface Window {
    __modelerShellVsCodeStub?: VsCodeWebviewStub;
    /** True once the first `init` import has settled, valid or not. */
    webviewReady?: boolean;
    shell?: ShellHandle;
    modeler?: CollaborativeTeamTopologiesModeler;
    connection?: DiagramJsConnection;
  }
}

export const LIGHT: Appearance = { theme: "light" };
export const WIDE = { width: 1280, height: 900 } as const;

export interface OpenOptions {
  size?: { width: number; height: number };
  requested?: Appearance;
  doc?: "example" | "empty" | "blank";
  /** What VS Code's getState() returns at first (a state stored before a reload). */
  state?: unknown;
}

/** Opens the webview as VS Code would and resolves once the first `init` import has settled. */
export async function openWebview(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.setViewportSize(options.size ?? WIDE);
  const search = new URLSearchParams(vsCodeStubSearch(options.requested ?? LIGHT));
  if (options.doc) search.set("doc", options.doc);
  if (options.state !== undefined) search.set("state", JSON.stringify(options.state));
  await page.goto(`/webview-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.webviewReady === true);
}

export interface PostedMessage {
  type: string;
  [key: string]: unknown;
}

/** Everything the webview posted to the extension host so far. */
export function postedMessages(page: Page): Promise<PostedMessage[]> {
  return page.evaluate(
    () => [...(window.__modelerShellVsCodeStub?.posted ?? [])] as PostedMessage[],
  );
}

/** Waits until the webview posted a message of `type` and returns the last one. */
export async function waitForPosted(page: Page, type: string): Promise<PostedMessage> {
  await page.waitForFunction(
    (wanted) =>
      (window.__modelerShellVsCodeStub?.posted ?? []).some(
        (message) => (message as { type?: unknown }).type === wanted,
      ),
    type,
  );
  const messages = await postedMessages(page);
  return messages.filter((message) => message.type === type).at(-1)!;
}

/** Delivers a host message the way VS Code does: a `message` event on the webview's window. */
export async function postFromHost(page: Page, message: PostedMessage): Promise<void> {
  await page.evaluate((data) => window.postMessage(data, "*"), message);
}

/** The document the canvas shows right now, parsed. */
export async function exportedDocument(page: Page): Promise<{
  title: string;
  nodes: Array<{ id: string; label: string; position: { x: number; y: number } }>;
}> {
  return page.evaluate(() => JSON.parse(window.modeler!.exportText()) as never);
}

/** The zoom readout of the shell's zoom panel, e.g. "100%". */
export function zoomReadout(page: Page): Promise<string | null> {
  return page.locator('[data-zoom="actual"]').textContent();
}

const appsVscode = fileURLToPath(new URL("../../../../apps/vscode", import.meta.url));
let productionBuild: Promise<unknown> | undefined;

/**
 * The shipped webview as VS Code loads it, for the shell kit's `csp` case: apps/vscode built for
 * production once per worker, its bundle behind renderWebviewHtml's document and CSP with the
 * shell's VS Code stub, and the example handed over through `init` as the extension does.
 */
export async function openShippedWebview(
  page: Page,
  { size, requested }: OpenContext,
): Promise<void> {
  productionBuild ??= promisify(execFile)(
    process.execPath,
    ["esbuild.config.mjs", "--production"],
    {
      cwd: appsVscode,
    },
  );
  await productionBuild;
  await page.setViewportSize(size);
  await openWebviewBundle(page, {
    dist: join(appsVscode, "dist"),
    title: "Team Topologies Diagram",
    requested,
    themes: WEBVIEW_THEMES,
  });
  await waitForPosted(page, "ready");
  await postFromHost(page, { type: "init", text: EXAMPLE_MAP });
  await page.locator(".cd-shell-canvas .djs-shape").first().waitFor();
}
