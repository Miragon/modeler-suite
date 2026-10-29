import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_DOCUMENT, serializeDocumentText } from "@miragon/context-maps-schema-model";
import { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } from "../../../apps/vscode/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * map editor's options) together, against the shell's stand-in for VS Code's documents: what the
 * canvas does reaches the document as a minimal edit, and what happens to the document reaches the
 * canvas. A real VS Code runs the same in CI's smoke test.
 */

function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

function canvasTitle(page: Page): Promise<string> {
  return page.evaluate(() => (JSON.parse(window.modeler!.exportText()) as { title: string }).title);
}

function appliedEdits(page: Page): Promise<number> {
  return page.evaluate(() => window.vscodeHost!.host.appliedEdits.length);
}

function postedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

async function renameMap(page: Page, title: string): Promise<void> {
  await page.locator('[data-chrome="menu"]').click();
  await page.getByRole("menuitem", { name: "Map title…" }).click();
  const dialog = page.getByRole("dialog", { name: "Map title" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
}

test.describe("VS Code webview: the document both ways", () => {
  test("a move on the canvas rewrites only its context's position, whose echo is not imported", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const context = page.locator('.cd-shell-canvas [data-element-id="ctx_cfp"] .djs-hit').first();
    const box = (await context.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_MAP);
    const before = EXAMPLE_MAP.split("\n");
    const after = (await documentText(page)).split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.flatMap((line, index) => (line === before[index] ? [] : [index]));
    const start = before.indexOf('      "id": "ctx_cfp",');
    const end = before.indexOf('      "id": "ctx_evaluation",');
    expect(changed.length).toBeGreaterThan(0);
    for (const index of changed) {
      expect(index).toBeGreaterThan(start);
      expect(index).toBeLessThan(end);
      expect(after[index]).toMatch(/^ {8}"[xy]": -?\d+,?$/);
    }
    expect(await appliedEdits(page)).toBe(1);
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a change in the text editor reaches the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    const typed = serializeDocumentText({
      ...SAMPLE_DOCUMENT,
      contexts: [
        ...SAMPLE_DOCUMENT.contexts,
        {
          id: "ctx_billing",
          label: "Billing",
          subdomainType: "generic",
          position: { x: 40, y: 600 },
          size: { width: 200, height: 110 },
        },
      ],
    });

    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, typed);

    await expect(page.locator('.cd-shell-canvas [data-element-id="ctx_billing"]')).toBeVisible();
    expect(await appliedEdits(page)).toBe(0);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await renameMap(page, "First");
    await renameMap(page, "Second");
    await expect.poll(() => documentText(page)).toContain('"title": "Second"');
    expect(await appliedEdits(page)).toBe(2);

    const undo = () =>
      page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    const redo = () =>
      page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasTitle(page)).toBe("First");
    expect(await undo()).toBe(true);
    await expect.poll(() => canvasTitle(page)).toBe(SAMPLE_DOCUMENT.title);
    expect(await documentText(page)).toBe(EXAMPLE_MAP);
    expect(await redo()).toBe(true);
    await expect.poll(() => canvasTitle(page)).toBe("First");
  });

  test("a canvas change the document refuses is taken back on the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });

    await renameMap(page, "Not written");

    await expect.poll(() => postedTypes(page)).toContain("update");
    await expect.poll(() => canvasTitle(page)).toBe(SAMPLE_DOCUMENT.title);
    expect(await documentText(page)).toBe(EXAMPLE_MAP);
    expect(await appliedEdits(page)).toBe(0);
  });

  test("Insert example is one edit the canvas imports and fits, and one undo step", async ({
    page,
  }) => {
    await openWebview(page, { host: true, map: "empty" });
    const hint = page.locator(".cd-shell-hint");
    await hint.getByRole("button", { name: "Insert example" }).click();

    await expect(page.locator('.cd-shell-canvas [data-element-id="ctx_cfp"]')).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_MAP));
    expect(await appliedEdits(page)).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => window.modeler!.diagram.get<{ zoom(): number }>("canvas").zoom()),
      )
      .toBeLessThan(1);

    await page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_MAP);
  });

  test("the pill counts the problems of the document as it changes", async ({ page }) => {
    await openWebview(page, { host: true });
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toBeHidden();
    // The shared kernel of CfP Management and Submission Handling now spans two teams.
    const typed = serializeDocumentText({
      ...SAMPLE_DOCUMENT,
      contexts: SAMPLE_DOCUMENT.contexts.map((context) =>
        context.id === "ctx_submission" ? { ...context, team: "Review Team" } : context,
      ),
    });

    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, typed);

    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("aria-label", "1 problem, no errors");
    await pill.click();
    await expect
      .poll(() =>
        page.evaluate(() => window.vscodeHost!.host.executedCommands.map(({ command }) => command)),
      )
      .toContain("workbench.actions.view.problems");
  });
});
