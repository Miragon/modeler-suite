import { expect, test, type Page } from "@playwright/test";
import { allowClipboardWrite } from "./support/safari.js";
import { exportDSL, openExample, waitForViewer } from "./support/viewer.js";

/**
 * Share copies the link inside the click (apps/webapp/src/clipboard.ts) through a ClipboardItem
 * whose value is a promise: Safari drops the user activation at the first `await`, so a plain
 * `writeText` after the link is computed would be refused there. `webapp-webkit` runs this spec in
 * WebKit. It never reads the clipboard back, which WebKit does not allow; it records which
 * clipboard call the copy took and how that call ended.
 */

type ClipboardCalls = string[];

function toasts(page: Page, status: "success" | "danger") {
  return page.locator(`[data-chrome="toasts"] .cd-shell-toast[data-status="${status}"]`);
}

function clipboardCalls(page: Page): Promise<ClipboardCalls> {
  return page.evaluate(
    () => (window as unknown as { __clipboardCalls: ClipboardCalls }).__clipboardCalls,
  );
}

test.beforeEach(async ({ page, context, browserName }) => {
  await allowClipboardWrite(context, browserName);
  await page.addInitScript(() => {
    const calls: ClipboardCalls = [];
    (window as unknown as { __clipboardCalls: ClipboardCalls }).__clipboardCalls = calls;
    const clipboard = navigator.clipboard;
    const record = <T>(name: string, call: Promise<T>): Promise<T> =>
      call.then(
        (value) => {
          calls.push(`${name} resolved`);
          return value;
        },
        (error: unknown) => {
          calls.push(`${name} rejected`);
          throw error;
        },
      );
    const write = clipboard.write.bind(clipboard);
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.write = (items) => record("write", write(items));
    clipboard.writeText = (text) => record("writeText", writeText(text));
  });
});

test("copies the link inside the click and confirms with a toast, without an error", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForViewer(page);
  await openExample(page);

  await page.locator('[data-chrome="primary"]').click();

  await expect(toasts(page, "success")).toHaveText("Link copied");
  await expect(toasts(page, "danger")).toHaveCount(0);
  expect(await clipboardCalls(page)).toEqual(["write resolved"]);

  expect(page.url()).toMatch(/\/#mz=[\w-]+$/);
  const shared = await context.newPage();
  await shared.goto(page.url());
  await waitForViewer(shared);
  expect(await exportDSL(shared)).toBe(await exportDSL(page));
});
