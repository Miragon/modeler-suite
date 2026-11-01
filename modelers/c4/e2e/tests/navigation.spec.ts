import { expect, test } from "@playwright/test";
import { readLink } from "../../apps/webapp/src/link.js";
import { select } from "./support/canvas.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW, EXAMPLE_DEFAULT_VIEW } from "./support/documents.js";
import {
  activeViewKey,
  countViewChanges,
  exportedText,
  registerNavigationTests,
  viewChanges,
} from "./support/navigation.js";
import { openWorkspace, showsDiagram } from "./support/webapp.js";

/**
 * Navigation in the web app (SPEC 7, 8.1): the host-independent part, then what the web app adds.
 * Its history crosses views, so an undo of a draft's first edit leaves the view a draft again; the
 * autosave keeps the view across a reload, and a share link names the view it opens on (`&v=`).
 */
test.describe("web app: navigation", () => {
  registerNavigationTests({ open: (page) => openWorkspace(page) });

  test("undo takes a draft's first edit back, and the view stays, a draft again", async ({
    page,
  }) => {
    await openWorkspace(page);
    await select(page, "mail");
    await page.keyboard.press("Enter");
    await expect.poll(() => activeViewKey(page)).toBe("Containers-mail");
    await page.locator('.djs-palette [data-action="create.container"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect.poll(() => exportedText(page)).not.toBe(EXAMPLE);
    await countViewChanges(page);

    await page.keyboard.press("ControlOrMeta+z");

    await expect.poll(() => exportedText(page)).toBe(EXAMPLE);
    expect(await activeViewKey(page)).toBe("Containers-mail");
    expect(await page.evaluate(() => window.app!.modeler.views.active().state)).toBe("draft");
    expect(await viewChanges(page)).toEqual([]);
  });

  test("a reload, and a visit without a link, come back to the view the canvas showed", async ({
    page,
  }) => {
    await openWorkspace(page);
    await page.evaluate(
      (key) => window.app!.modeler.views.open(key, { cause: "user" }),
      "Components-api",
    );
    await expect.poll(() => activeViewKey(page)).toBe("Components-api");
    // The address bar keeps the link to the workspace, now with the view it shows.
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/&v=Components-api$/);

    await page.reload();
    await showsDiagram(page);
    expect(await activeViewKey(page)).toBe("Components-api");

    // The autosave alone: the page without a link, which gets the link of what it restored.
    await page.goto("about:blank");
    await page.goto("/");
    await showsDiagram(page);
    expect(await activeViewKey(page)).toBe("Components-api");
    expect(await exportedText(page)).toBe(EXAMPLE);
    await expect
      .poll(async () => readLink(await page.evaluate(() => location.hash)))
      .toEqual({ text: EXAMPLE, view: "Components-api" });
  });

  test("a share link names its view, and opens on it", async ({ page, context, browserName }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await openWorkspace(page, EXAMPLE, EXAMPLE_CONTAINER_VIEW);
    expect(await activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);

    await page.evaluate(
      (key) => window.app!.modeler.views.open(key, { cause: "user" }),
      "Components-api",
    );
    await page.locator('[data-chrome="primary"]').click();
    await expect(page.getByText("Link copied", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/&v=Components-api$/);
    const link = await page.evaluate(() => location.href);

    await page.goto("about:blank");
    await page.goto(link);
    await showsDiagram(page);
    expect(await activeViewKey(page)).toBe("Components-api");
    // A link without a view opens on the default one.
    await openWorkspace(page);
    expect(await activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
  });
});
