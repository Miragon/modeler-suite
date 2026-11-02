import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_COMPONENT_VIEW } from "./support/breadcrumbs.js";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "./support/documents.js";
import { registerFitFeedbackTests } from "./support/fit-feedback.js";
import {
  exportText,
  forgetStorageOnEveryVisit,
  openMenu,
  openWorkspace,
  startScreen,
  toast,
} from "./support/webapp.js";

/**
 * The web app's keys and feedback (UX wave 2, P6): Cmd/Ctrl+O and Cmd/Ctrl+S as the family binds
 * them, with their chips and the start screen's `aria-keyshortcuts`; the shortcuts dialog with the
 * File keys first; the fit after "Lay out automatically" and its clearance of the breadcrumb; the
 * toast that says what Delete did, with Undo; "Add relationship…" in the Model menu; the drop hint.
 */

async function open(page: Page, view?: string): Promise<void> {
  await forgetStorageOnEveryVisit(page);
  await openWorkspace(page, EXAMPLE, view);
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    const diagram = window.app!.modeler.diagram;
    const element = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(target);
    diagram.get<{ select(element: unknown): void }>("selection").select(element);
  }, id);
  await page.locator(".djs-container > svg").focus();
}

test.describe("web app: the keys and the feedback of the app", () => {
  test("Cmd/Ctrl+O opens the file picker and Cmd/Ctrl+S exports the .c4 file", async ({ page }) => {
    await open(page);

    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("ControlOrMeta+O");
    expect((await chooser).isMultiple()).toBe(false);

    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+S");
    expect((await download).suggestedFilename()).toBe("bookshop.c4");
    await expect(toast(page, "Exported bookshop.c4.")).toBeVisible();
  });

  test("Cmd/Ctrl+S commits a label being typed before it saves", async ({ page }) => {
    await open(page);
    await page.locator(".djs-shape[data-element-id]").first().dblclick();
    const editor = page.locator("textarea.diagram-label-editor");
    await editor.press("End");
    await editor.pressSequentially(" Renamed");

    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+S");
    await download;
    expect(await exportText(page)).toContain(" Renamed");
    // As on Enter: the canvas keeps the keys, so Delete and Cmd/Ctrl+Z still work.
    await expect(editor).toHaveCount(0);
    await expect(page.locator(".djs-container > svg")).toBeFocused();
  });

  test("Cmd/Ctrl+S commits an inspector draft and leaves the focus in its field", async ({
    page,
  }) => {
    await open(page);
    await select(page, "payments");
    const description = page
      .locator('[data-chrome="inspector"]')
      .getByLabel("Description", { exact: true });
    await description.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Takes card and wallet payments.");

    const download = page.waitForEvent("download");
    await page.keyboard.press("ControlOrMeta+S");
    await download;

    expect(await exportText(page)).toContain('"Takes card and wallet payments."');
    await expect(description).toBeFocused();
  });

  test("Cmd/Ctrl+S saves nothing on the start screen, and never reaches the browser", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    const prevented = page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          window.addEventListener("keydown", (event) => {
            if (event.key.toLowerCase() === "s") resolve(event.defaultPrevented);
          }),
        ),
    );

    await page.keyboard.press("ControlOrMeta+S");

    expect(await prevented).toBe(true);
    await page.waitForTimeout(300);
    expect(downloads).toEqual([]);
    await expect(startScreen(page)).toBeVisible();
  });

  test("the menu and the start screen name the file keys; the hint lists the file types", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
    await expect(startScreen(page)).toContainText("Or drop a .c4, .dsl, or .txt file here");
    await expect(startScreen(page).getByRole("button", { name: "Open a file…" })).toHaveAttribute(
      "aria-keyshortcuts",
      /^(Meta|Control)\+O$/,
    );

    await open(page);
    const menu = await openMenu(page);
    await expect(menu.locator('[data-menu-id="open"]')).toHaveAttribute(
      "aria-keyshortcuts",
      /^(Meta|Control)\+O$/,
    );
    await expect(menu.locator('[data-menu-id="export-text"]')).toHaveAttribute(
      "aria-keyshortcuts",
      /^(Meta|Control)\+S$/,
    );
  });

  test("the shortcuts dialog lists the File keys first, then every group of the canvas", async ({
    page,
  }) => {
    await open(page);
    await page.locator(".djs-container > svg").focus();
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog.locator("h3.cd-shell-shortcuts-title")).toHaveText([
      "File",
      "View",
      "Edit",
      "Tools",
      "Navigation",
      "Help",
    ]);
    await expect(dialog.locator("table").first().locator("th")).toHaveText([
      "Open…",
      "Export as .c4",
    ]);
    await expect(dialog.getByRole("row", { name: "Clear the selection" })).toContainText("Esc");
    await expect(
      dialog.getByRole("row", { name: "Edit name, or a relationship's description" }),
    ).toContainText("E");
    await expect(dialog.locator("tr[data-chrome-key]")).toHaveCount(4);
  });

  test("Delete says it removed an element from this view, and Undo brings it back", async ({
    page,
  }) => {
    await open(page, EXAMPLE_CONTAINER_VIEW);
    await select(page, "mail");

    await page.keyboard.press("Delete");

    const removed = toast(page, "Removed E-mail System from this view. It stays in the model.");
    await expect(removed).toBeVisible();
    await removed.getByRole("button", { name: "Undo" }).click();
    await expect(removed).toBeHidden();
    expect(await exportText(page)).toBe(EXAMPLE);
  });

  test("Delete says it deleted an element no other view shows from the model", async ({ page }) => {
    await open(page, EXAMPLE_COMPONENT_VIEW);
    await select(page, "catalogue");

    await page.keyboard.press("Delete");

    const deleted = toast(page, "Deleted Catalogue from the model. No other view showed it.");
    await expect(deleted).toBeVisible();
    // The next edit makes the offer stale: it would undo that edit instead.
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(deleted).toBeHidden();
    expect(await exportText(page)).toBe(EXAMPLE);
  });

  test("Delete's Undo offer goes when another workspace replaces the one it happened in", async ({
    page,
  }) => {
    await open(page, EXAMPLE_CONTAINER_VIEW);
    await select(page, "mail");
    await page.keyboard.press("Delete");
    const removed = toast(page, "Removed E-mail System from this view. It stays in the model.");
    await expect(removed).toBeVisible();

    const menu = await openMenu(page);
    await menu.locator('[data-menu-id="new-diagram"]').click();

    // The import cleared the history, so its Undo would do nothing.
    await expect(toast(page, "Diagram replaced")).toBeVisible();
    await expect(removed).toBeHidden();
  });

  test('"Add relationship…" in the Model menu opens the dialog with both ends to choose', async ({
    page,
  }) => {
    await open(page);
    const menu = await openMenu(page);
    const entry = menu.locator('[data-menu-id="add-relationship"]');
    await expect(entry).toHaveAttribute("aria-haspopup", "dialog");
    await entry.click();
    const dialog = page.getByRole("dialog", { name: "Add relationship" });
    await expect(dialog.getByRole("combobox", { name: "From" })).toBeFocused();
    await expect(dialog.getByRole("combobox", { name: "To" })).toBeVisible();
  });

  registerFitFeedbackTests({ open });
});
