import { expect, test, type Page } from "@playwright/test";

/*
 * Guide §5.8 under the click model of WebKit and Firefox on macOS: a clicked button takes no focus,
 * so the focus is on `<body>` when its click runs. The start screen and the toasts still hand it to
 * the canvas, where Delete and Cmd/Ctrl+Z act. Runs in the `chromium` and the `webkit` project.
 */

async function openWeb(page: Page, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/web.html${query}`);
  await page.waitForFunction(() => window.__webDemo?.ready === true);
}

const canvas = (page: Page) => page.locator(".djs-container > svg");
const shapes = (page: Page) => page.locator(".djs-shape");

test("a click on New diagram, Show example or Open a file… hands the focus to the canvas", async ({
  page,
}) => {
  for (const name of ["New diagram", "Show example"]) {
    await openWeb(page, "?empty");
    await page.locator('[data-chrome="empty-state"]').getByRole("button", { name }).click();
    await expect(canvas(page)).toBeFocused();
  }

  // The card stays up until the modeler has loaded the picked file.
  await openWeb(page, "?empty");
  await page.locator(".cd-shell-empty-state-open").click();
  await page.evaluate(() => window.__webDemo?.shell.setEmptyState(false));
  await expect(canvas(page)).toBeFocused();
});

test("a click on a toast's action or Close hands the focus to the canvas, so Delete acts", async ({
  page,
}) => {
  await openWeb(page);
  const count = await shapes(page).count();
  const toast = page.locator('[data-chrome="toasts"] .cd-shell-toast:not([data-leaving])');

  for (const button of [".cd-shell-toast-action", ".cd-shell-toast-close"]) {
    await shapes(page).first().click();
    await page.evaluate(() =>
      window.__webDemo?.toast({ status: "info", text: "Replaced", actionLabel: "Undo" }),
    );
    await toast.locator(button).click();
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press("Delete");
    await expect(shapes(page)).toHaveCount(count - 1);
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(shapes(page)).toHaveCount(count);
  }
});
