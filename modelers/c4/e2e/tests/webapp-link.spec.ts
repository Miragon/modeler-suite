import { expect, test, type Page } from "@playwright/test";
import { readLink } from "../../apps/webapp/src/link.js";
import { select } from "./support/canvas.js";
import {
  EXAMPLE,
  EXAMPLE_CONTAINER_VIEW,
  EXAMPLE_DEFAULT_VIEW,
  EXAMPLE_WITH_PROBLEMS,
  SCRIPTED,
} from "./support/documents.js";
import {
  activeView,
  exportText,
  openExampleFromStartScreen,
  openMenu,
  openWorkspace,
  showsDiagram,
  toast,
  workspaceLink,
} from "./support/webapp.js";

/**
 * The URL holds the workspace (Event Storming's behaviour): every edit and every view switch is
 * written into the hash at once with `history.replaceState`, an empty workspace drops it, a reload
 * comes back from the link before the browser's copy, and a link pasted into the open tab replaces
 * the workspace, an Undo away. Share copies the URL the address bar holds.
 */

const BROKEN_LINK_TEXT =
  "Couldn't read the workspace in this link. Check that you copied the whole link.";

/** What the address bar's link holds: the workspace and its view, undefined without one. */
async function addressBarLink(page: Page) {
  return readLink(await page.evaluate(() => location.hash));
}

function toasts(page: Page) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast');
}

/** A person from the palette by keyboard: Enter on the entry, Escape on the name editor. */
async function createPersonFromPalette(page: Page): Promise<void> {
  const before = await exportText(page);
  await page.locator('.djs-palette [data-action="create.person"]').focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect.poll(() => exportText(page)).not.toBe(before);
}

test.describe("web app: the link in the address bar", () => {
  test("holds the workspace as soon as it opens, and every edit at once", async ({ page }) => {
    await openExampleFromStartScreen(page);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_DEFAULT_VIEW });
    const entries = await page.evaluate(() => history.length);

    await createPersonFromPalette(page);
    const edited = await exportText(page);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: edited, view: EXAMPLE_DEFAULT_VIEW });

    // An undo is a change as well; and the edits replace the entry instead of adding steps.
    await page.locator(".djs-container > svg").focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => exportText(page)).toBe(EXAMPLE);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_DEFAULT_VIEW });
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test("holds the view the canvas shows after every view switch", async ({ page }) => {
    await openExampleFromStartScreen(page);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_DEFAULT_VIEW });

    await select(page, "bookshop");
    await page.keyboard.press("Enter");
    await expect.poll(() => activeView(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_CONTAINER_VIEW });

    await page.keyboard.press("u");
    await expect.poll(() => activeView(page)).not.toBe(EXAMPLE_CONTAINER_VIEW);
    const parent = await activeView(page);
    await expect.poll(() => addressBarLink(page)).toEqual({ text: EXAMPLE, view: parent });
  });

  test("a reload comes back to the workspace and view of the link, without a toast", async ({
    page,
  }) => {
    await openWorkspace(page, EXAMPLE_WITH_PROBLEMS);
    await expect(toast(page, /^Opened with/)).toHaveCount(1);
    await page.evaluate(
      (key) => window.app!.modeler.views.open(key, { cause: "user" }),
      EXAMPLE_CONTAINER_VIEW,
    );
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE_WITH_PROBLEMS, view: EXAMPLE_CONTAINER_VIEW });

    await page.reload();
    await showsDiagram(page);

    expect(await exportText(page)).toBe(EXAMPLE_WITH_PROBLEMS);
    expect(await activeView(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    // A reload restores; the problems pill still lists the findings (guide §9).
    await expect(page.locator('[data-chrome="problems"]')).toBeVisible();
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a reload takes the link before the browser's copy, which stays an Undo away", async ({
    page,
  }) => {
    await openWorkspace(page);
    await createPersonFromPalette(page);
    const edited = await exportText(page);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: edited, view: EXAMPLE_DEFAULT_VIEW });
    // Another tab of this browser kept another workspace in the meantime.
    await page.evaluate(
      ({ text, view }) => {
        localStorage.setItem("c4-modeler.document", text);
        localStorage.setItem("c4-modeler.view", view);
      },
      { text: SCRIPTED, view: "SystemLandscape" },
    );

    await page.reload();
    await showsDiagram(page);

    expect(await exportText(page)).toBe(edited);
    expect(await activeView(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    await toast(page, "Diagram replaced").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => exportText(page)).toBe(SCRIPTED);
    await expect.poll(async () => (await addressBarLink(page))?.text).toBe(SCRIPTED);
  });

  test("a pasted link replaces the workspace, an Undo away, and the link follows", async ({
    page,
  }) => {
    await openWorkspace(page);

    await page.goto(await workspaceLink(SCRIPTED));

    await expect.poll(() => exportText(page)).toBe(SCRIPTED);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: SCRIPTED, view: "SystemLandscape" });
    await toast(page, "Diagram replaced").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => exportText(page)).toBe(EXAMPLE);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_DEFAULT_VIEW });

    // A link to the same workspace on another view opens that view, without replacing anything.
    await page.goto(await workspaceLink(EXAMPLE, EXAMPLE_CONTAINER_VIEW));
    await expect.poll(() => activeView(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    await expect(toast(page, "Diagram replaced")).toHaveCount(0);
  });

  test("a broken link toasts and leaves the workspace as it was", async ({ page }) => {
    await openWorkspace(page);
    const whole = await workspaceLink(SCRIPTED);

    await page.goto(whole.slice(0, whole.length / 2));

    await expect(toast(page, BROKEN_LINK_TEXT)).toHaveAttribute("data-status", "danger");
    expect(await exportText(page)).toBe(EXAMPLE);
  });

  test("an empty workspace drops the hash, and its first element writes it again", async ({
    page,
  }) => {
    await openWorkspace(page);
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe("");

    await (await openMenu(page)).getByRole("menuitem", { name: "New diagram" }).click();

    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    expect(page.url()).not.toContain("#");
    await createPersonFromPalette(page);
    const edited = await exportText(page);
    await expect.poll(async () => (await addressBarLink(page))?.text).toBe(edited);
  });

  test("Share copies the URL the address bar holds, its query included", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/?from=e2e${(await workspaceLink(EXAMPLE, EXAMPLE_CONTAINER_VIEW)).slice(1)}`);
    await showsDiagram(page);
    await expect
      .poll(() => addressBarLink(page))
      .toEqual({ text: EXAMPLE, view: EXAMPLE_CONTAINER_VIEW });
    const url = page.url();

    await page.locator('[data-chrome="primary"]').click();

    await expect(toast(page, "Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    expect(page.url()).toBe(url);
    expect(url).toContain("/?from=e2e#mz=");
  });
});
