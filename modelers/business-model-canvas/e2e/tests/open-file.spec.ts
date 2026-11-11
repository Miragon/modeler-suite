import { expect, test } from "@playwright/test";
import { titleOf } from "@miragon/business-model-canvas-schema-model";
import { exportDocument, fileInput, openApp, openExample, toast } from "./support/webapp.js";

test("opening a blank .bmc file shows an empty canvas instead of an error", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await openApp(page);
  await openExample(page);

  await fileInput(page).setInputFiles({
    name: "blank.bmc",
    mimeType: "",
    buffer: Buffer.from("\n"),
  });

  await expect(page.locator(".djs-shape[data-element-id]")).toHaveCount(0);
  expect(titleOf(await exportDocument(page))).toBe("New business model");
  await expect(toast(page, "Canvas replaced")).toBeVisible();
  await expect(page.locator('[data-chrome="toasts"] [data-status="danger"]')).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("a file that is no canvas leaves the canvas as it was and says why", async ({ page }) => {
  await openApp(page);
  await openExample(page);
  await fileInput(page).setInputFiles({
    name: "broken.bmc",
    mimeType: "",
    buffer: Buffer.from(
      JSON.stringify({
        channels: {
          items: [
            { id: "x", text: "A" },
            { id: "x", text: "B" },
          ],
        },
      }),
    ),
  });

  await expect(toast(page, "Couldn't read “broken.bmc”")).toBeVisible();
  await expect(page.locator('.djs-shape[data-element-id="consultants"]')).toBeVisible();
});
