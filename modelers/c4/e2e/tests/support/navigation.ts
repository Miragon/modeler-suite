import { expect, test, type Page } from "@playwright/test";
import { labelEditor, select, shape } from "./canvas.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW, EXAMPLE_DEFAULT_VIEW } from "./documents.js";

/** How a host's page opens the example. */
export interface NavigationHost {
  /** Opens the example on its default view, with the canvas ready. */
  open(page: Page): Promise<void>;
}

/** The view the page's modeler shows: the web app's `app.modeler`, or the webview's `modeler`. */
function viewOf(page: Page): Promise<{ key: string; state: string } | undefined> {
  return page.evaluate(() => {
    const modeler = window.app?.modeler ?? window.modeler;
    if (!modeler) return undefined;
    const active = modeler.views.active();
    return { key: active.key, state: active.state };
  });
}

export async function activeViewKey(page: Page): Promise<string | undefined> {
  return (await viewOf(page))?.key;
}

export function exportedText(page: Page): Promise<string> {
  return page.evaluate(() => (window.app?.modeler ?? window.modeler)!.exportText());
}

/** Counts `c4.view.changed` from now on, in `window.__viewChanges`. */
export async function countViewChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as { __viewChanges: string[] };
    record.__viewChanges = [];
    const modeler = (window.app?.modeler ?? window.modeler)!;
    modeler.diagram.on("c4.view.changed", (event: { view: string; cause: string }) => {
      record.__viewChanges.push(`${event.view} (${event.cause})`);
    });
  });
}

export function viewChanges(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __viewChanges: string[] }).__viewChanges);
}

const canvas = (page: Page) => page.locator(".djs-container > svg");

const viewsDialog = (page: Page) => page.getByRole("dialog", { name: "Views" });

/**
 * Drill-down and back (SPEC 4.5, 7.2) in either host: the drill badge, Enter, U, the "Views…"
 * dialog by its key and from the menu, and a draft view that the first edit in it writes. A view
 * switch writes nothing.
 */
export function registerNavigationTests(host: NavigationHost): void {
  test("the drill badge opens the container view, and U each parent up to the landscape", async ({
    page,
  }) => {
    await host.open(page);
    expect(await activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    // The badge's hit area, which carries its title; the drawn badge sits under it.
    const badge = shape(page, "bookshop").locator(".djs-hit.c4-drill");
    await expect(badge).toHaveAccessibleName("Open Bookshop containers (Enter)");
    await badge.click();
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    // The boundary of the view's system, and its containers inside.
    await expect(shape(page, "boundary:bookshop")).toBeVisible();
    await expect(shape(page, "webApp")).toBeVisible();

    await canvas(page).focus();
    await page.keyboard.press("u");
    await expect.poll(() => activeViewKey(page)).toBe("SystemContext-bookshop");
    await page.keyboard.press("u");
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    // A landscape has no parent: U stays.
    await page.keyboard.press("u");
    await page.waitForTimeout(100);
    expect(await activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    expect(await exportedText(page)).toBe(EXAMPLE);
  });

  test("Enter opens the view one level deeper of the selected system or container", async ({
    page,
  }) => {
    await host.open(page);
    await select(page, "bookshop");
    await page.keyboard.press("Enter");
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    await select(page, "api");
    await page.keyboard.press("Enter");
    await expect.poll(() => activeViewKey(page)).toBe("Components-api");
    await expect(shape(page, "boundary:api")).toBeVisible();
    // A component has no deeper view.
    await select(page, "orders");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    expect(await activeViewKey(page)).toBe("Components-api");
    await expect(labelEditor(page)).toHaveCount(0);
    expect(await exportedText(page)).toBe(EXAMPLE);
  });

  test("Views… lists every view, and a row opens its view", async ({ page }) => {
    await host.open(page);
    await canvas(page).focus();
    await page.keyboard.press("g");
    const dialog = viewsDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('button[data-view][aria-current="true"]')).toHaveAttribute(
      "data-view",
      EXAMPLE_DEFAULT_VIEW,
    );
    for (const key of ["SystemContext-bookshop", EXAMPLE_CONTAINER_VIEW, "Components-api"]) {
      await expect(dialog.locator(`button[data-view="${key}"]`)).toBeVisible();
    }
    // The dynamic and the deployment view stay in the file, shown in Structurizr only.
    for (const key of ["PlaceOrder", "LiveDeployment"]) {
      await expect(dialog.locator(`tr[data-view="${key}"]`)).toContainText(
        "Shown in Structurizr only",
      );
    }
    await dialog.locator('button[data-view="Components-api"]').click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => activeViewKey(page)).toBe("Components-api");
    await expect(canvas(page)).toBeFocused();

    // From the Model menu as well.
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Views…", exact: true }).click();
    await expect(viewsDialog(page)).toBeVisible();
    await expect(
      viewsDialog(page).locator('button[data-view][aria-current="true"]'),
    ).toHaveAttribute("data-view", "Components-api");
    await page.keyboard.press("Escape");
    await expect(viewsDialog(page)).toBeHidden();
    expect(await exportedText(page)).toBe(EXAMPLE);
  });

  test("a system without a container view drills into a draft, which the first edit writes", async ({
    page,
  }) => {
    await host.open(page);
    await select(page, "mail");
    await page.keyboard.press("Enter");
    await expect.poll(() => viewOf(page)).toEqual({ key: "Containers-mail", state: "draft" });
    // Showing a draft writes nothing.
    expect(await exportedText(page)).toBe(EXAMPLE);

    await countViewChanges(page);
    // Enter on the palette's Container: created in the free area, its name editor open.
    await page.locator('.djs-palette [data-action="create.container"]').focus();
    await page.keyboard.press("Enter");
    await expect(labelEditor(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(labelEditor(page)).toHaveCount(0);

    await expect.poll(() => exportedText(page)).not.toBe(EXAMPLE);
    const written = await exportedText(page);
    expect(written).toContain('container mail "Containers-mail"');
    expect(written).toMatch(
      /mail = softwareSystem "E-mail System" "Delivers e-mails\." "Existing System" \{\n\s+\S+ = container "Container"/,
    );
    // The draft already carried the key it is written under: no view change.
    expect(await viewOf(page)).toEqual({ key: "Containers-mail", state: "written" });
    expect(await viewChanges(page)).toEqual([]);
  });
}
