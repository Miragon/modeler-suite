import { expect, test, type Page } from "@playwright/test";
import { readLink } from "../../apps/webapp/src/link.js";
import { allowClipboardWrite } from "./support/safari.js";
import { EXAMPLE_DEFAULT_VIEW } from "./support/documents.js";
import {
  activeView,
  appReady,
  exportText,
  openExampleFromStartScreen,
  startScreen,
} from "./support/webapp.js";

/**
 * Share copies the link inside the click (apps/webapp/src/clipboard.ts) through a ClipboardItem
 * whose value is a promise: Safari drops the user activation at the first `await`, so a plain
 * `writeText` after the link is computed would be refused there. Playwright's WebKit allows a write
 * at any time, so the spec records each clipboard call instead: which method, whether it ran while
 * the click was dispatched, whether the ClipboardItem's values were promises and how it ended.
 * `webapp-webkit` runs this spec in WebKit. It never reads the clipboard back, which WebKit does not
 * allow; navigation.spec.ts opens the shared link in Chromium.
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

    // From the capture listener on window to the bubble one: every click listener of the page runs
    // in between. The timeout ends it should a listener stop the click's propagation.
    let clickDispatching = false;
    window.addEventListener(
      "click",
      () => {
        clickDispatching = true;
        setTimeout(() => (clickDispatching = false));
      },
      true,
    );
    window.addEventListener("click", () => (clickDispatching = false));
    const when = () => (clickDispatching ? "in the click" : "after the click");

    const itemsWithPromiseValues = new WeakSet<ClipboardItem>();
    window.ClipboardItem = new Proxy(window.ClipboardItem, {
      construct(target, [items, options]: ConstructorParameters<typeof ClipboardItem>) {
        const item = new target(items, options);
        const values = Object.values(items);
        if (values.length > 0 && values.every((value) => value instanceof Promise)) {
          itemsWithPromiseValues.add(item);
        }
        return item;
      },
    });

    const clipboard = navigator.clipboard;
    const record = <T>(call: string, written: Promise<T>): Promise<T> =>
      written.then(
        (value) => {
          calls.push(`${call}: resolved`);
          return value;
        },
        (error: unknown) => {
          calls.push(`${call}: rejected`);
          throw error;
        },
      );
    const write = clipboard.write.bind(clipboard);
    const writeText = clipboard.writeText.bind(clipboard);
    clipboard.write = (items) => {
      const values = items.every((item) => itemsWithPromiseValues.has(item))
        ? "promise values"
        : "ready values";
      return record(`write ${when()} with ${values}`, write(items));
    };
    clipboard.writeText = (text) => record(`writeText ${when()}`, writeText(text));
  });
});

test("copies the link inside the click and confirms with a toast, without an error", async ({
  page,
  context,
}) => {
  await openExampleFromStartScreen(page);
  // The address bar holds the workspace and its view before Share; Share copies that URL.
  await expect
    .poll(() => page.url())
    .toMatch(new RegExp(`/#mz=[\\w-]+&v=${EXAMPLE_DEFAULT_VIEW}$`));
  const url = page.url();

  await page.locator('[data-chrome="primary"]').click();

  await expect(toasts(page, "success")).toHaveText("Link copied");
  await expect(toasts(page, "danger")).toHaveCount(0);
  expect(await clipboardCalls(page)).toEqual(["write in the click with promise values: resolved"]);

  // Another browser opens the link in the address bar as the same workspace, on the same view.
  expect(page.url()).toBe(url);
  const shared = await (await context.browser()!.newContext()).newPage();
  await shared.goto(page.url());
  await appReady(shared);
  await expect(startScreen(shared)).toBeHidden();
  expect(await exportText(shared)).toBe(await exportText(page));
  expect(await activeView(shared)).toBe(EXAMPLE_DEFAULT_VIEW);
  await shared.context().close();
});

test("the address bar keeps up with a held arrow key, and Share copies what it moved", async ({
  page,
}) => {
  // WebKit refuses the 101st history write within 10 seconds with a SecurityError; a held arrow
  // key moves the selection about 30 times a second, one edit each.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openExampleFromStartScreen(page);
  await page.evaluate(() => {
    const diagram = window.app!.modeler.diagram;
    diagram
      .get<{ select(element: unknown): void }>("selection")
      .select(diagram.get<{ get(id: string): unknown }>("elementRegistry").get("customer"));
    document.querySelector<SVGElement>(".djs-container > svg")!.focus();
  });
  const before = await exportText(page);

  for (let press = 0; press < 130; press += 1) await page.keyboard.press("ArrowRight");

  const moved = await exportText(page);
  expect(moved).not.toBe(before);
  await expect
    .poll(async () => (await readLink(await page.evaluate(() => location.hash)))?.text)
    .toBe(moved);
  await page.locator('[data-chrome="primary"]').click();
  await expect(toasts(page, "success")).toHaveText("Link copied");
  await expect(toasts(page, "danger")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
