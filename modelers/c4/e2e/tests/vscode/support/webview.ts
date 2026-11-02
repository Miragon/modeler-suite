import type { Page } from "@playwright/test";
import { vsCodeStubSearch } from "@miragon/modeler-shell/testing";

export interface WebviewPageOptions {
  /** Run the extension's document plumbing in the page too (`?host`). */
  readonly host?: boolean;
  /** A document of the test page other than the example. */
  readonly doc?: "empty" | "blank";
  /** What the webview stored before, as VS Code hands it back after a reload. */
  readonly state?: unknown;
}

/** The VS Code webview test page, once its first import settled. */
export async function openWebview(page: Page, options: WebviewPageOptions = {}): Promise<void> {
  const search = new URLSearchParams(vsCodeStubSearch({ theme: "light" }));
  if (options.host) search.set("host", "");
  if (options.doc) search.set("doc", options.doc);
  if (options.state !== undefined) search.set("state", JSON.stringify(options.state));
  await page.goto(`/webview-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.webviewReady === true);
}

/** The text of the document in the stand-in for VS Code (`?host`). */
export function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

export function canvasText(page: Page): Promise<string> {
  return page.evaluate(() => window.modeler!.exportText());
}

export interface AppliedEdit {
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}

/** Every edit VS Code applied for the extension, in order (`?host`). */
export function appliedEdits(page: Page): Promise<AppliedEdit[]> {
  return page.evaluate(() =>
    window.vscodeHost!.host.appliedEdits.map((edit) => ({
      startLine: edit.range.start.line,
      endLine: edit.range.end.line,
      text: edit.text,
    })),
  );
}

/** What the extension posted to the webview, by type (`?host`). */
export function hostPosted(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

/** What the webview posted to the extension. */
export function webviewPosted(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () => (window.__modelerShellVsCodeStub?.posted ?? []) as Array<Record<string, unknown>>,
  );
}

/** The text editor, Git or a formatter changing the document: one undo step (`?host`). */
export function replaceDocument(page: Page, text: string): Promise<void> {
  return page.evaluate((next) => {
    const { host, document } = window.vscodeHost!;
    host.replaceText(document, next);
  }, text);
}

export const undo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
export const redo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));

export function activeView(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.modeler!.getViewState()?.view);
}
