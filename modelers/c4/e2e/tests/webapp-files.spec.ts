import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE, SCRIPTED } from "./support/documents.js";
import {
  exportText,
  openMenu,
  openWorkspace,
  showsDiagram,
  startScreen,
  toast,
} from "./support/webapp.js";

/**
 * The native file is `.c4`, its content Structurizr DSL. Open… and the drop zone take `.c4`,
 * `.dsl` and `.txt`; the text exports download the workspace byte for byte, as `<workspace>.c4`
 * and as `workspace.dsl` for Structurizr's own tools.
 */

/** A file dropped on the middle of the shell, as the shell kit's drop case drops one. */
async function dropFile(page: Page, file: { name: string; text: string }): Promise<void> {
  await page.evaluate(({ name, text }) => {
    const root = document.querySelector<HTMLElement>(".cd-shell")!;
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], name, { type: "" }));
    const rect = root.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const target = document.elementFromPoint(clientX, clientY) ?? root;
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(
        new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: transfer,
          clientX,
          clientY,
        }),
      );
    }
  }, file);
}

async function exportFromMenu(page: Page, label: string) {
  const download = page.waitForEvent("download");
  await (await openMenu(page)).getByRole("menuitem", { name: label, exact: true }).click();
  const file = await download;
  return {
    name: file.suggestedFilename(),
    text: await readFile(await file.path(), "utf8"),
  };
}

test.describe("web app: files", () => {
  test("Open… takes .c4, .dsl and .txt files", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("accept", ".c4,.dsl,.txt,text/plain");

    await input.setInputFiles({ name: "bookshop.c4", mimeType: "", buffer: Buffer.from(EXAMPLE) });

    await startScreen(page).waitFor({ state: "hidden" });
    await showsDiagram(page);
    expect(await exportText(page)).toBe(EXAMPLE);
  });

  test("the drop zone takes a .c4 file and a .dsl file", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
    await expect(startScreen(page)).toContainText("Or drop a .c4, .dsl, or .txt file here");

    await dropFile(page, { name: "bookshop.c4", text: EXAMPLE });
    await expect.poll(() => exportText(page)).toBe(EXAMPLE);

    await dropFile(page, { name: "workspace.dsl", text: SCRIPTED });
    await expect.poll(() => exportText(page)).toBe(SCRIPTED);
  });

  test("Export as .c4 downloads the workspace under its name, byte for byte", async ({ page }) => {
    await openWorkspace(page);

    const file = await exportFromMenu(page, "Export as .c4");

    expect(file).toEqual({ name: "bookshop.c4", text: EXAMPLE });
    await expect(toast(page, "Exported bookshop.c4.")).toBeVisible();
  });

  test("Export as Structurizr DSL (.dsl) downloads the same bytes as workspace.dsl", async ({
    page,
  }) => {
    await openWorkspace(page);

    const file = await exportFromMenu(page, "Export as Structurizr DSL (.dsl)");

    expect(file).toEqual({ name: "workspace.dsl", text: EXAMPLE });
    await expect(toast(page, "Exported workspace.dsl.")).toBeVisible();
  });

  test("a workspace without a name exports as workspace.c4", async ({ page }) => {
    const unnamed = SCRIPTED.replace('workspace "Scripted" {', "workspace {");
    await openWorkspace(page, unnamed);

    const file = await exportFromMenu(page, "Export as .c4");

    expect(file).toEqual({ name: "workspace.c4", text: unnamed });
  });
});
