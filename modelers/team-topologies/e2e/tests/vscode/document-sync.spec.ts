import { expect, test, type Page } from "@playwright/test";
import { EMPTY_MAP, EXAMPLE_MAP, withExampleInserted } from "../../../apps/vscode/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * diagram editor's options) together, against the shell's stand-in for VS Code's documents: what
 * the canvas does reaches the document as a minimal edit, and what happens to the document reaches
 * the canvas. A real VS Code runs the same in CI's smoke test.
 */

const shape = (page: Page, id: string) =>
  page.locator(`.cd-shell-canvas [data-element-id="${id}"]`);

function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

function appliedEdits(page: Page): Promise<number> {
  return page.evaluate(() => window.vscodeHost!.host.appliedEdits.length);
}

function postedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

async function canvasLabel(page: Page, id: string): Promise<string | undefined> {
  const shown = await page.evaluate(
    () => JSON.parse(window.modeler!.exportText()) as { nodes: { id: string; label: string }[] },
  );
  return shown.nodes.find((node) => node.id === id)?.label;
}

async function renameInInspector(page: Page, id: string, name: string): Promise<void> {
  await shape(page, id).click();
  const field = page.locator('[data-chrome="inspector"]').getByLabel("Name");
  await field.fill(name);
  await field.press("Enter");
}

async function removeOnCanvas(page: Page, id: string): Promise<void> {
  await shape(page, id).click();
  await expect(shape(page, id)).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect.poll(() => documentText(page)).not.toContain(`"id": "${id}"`);
}

const undo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
const redo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));

test.describe("VS Code webview: the document both ways", () => {
  test("a rename in the inspector rewrites only the team's label line, whose echo is not imported", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await renameInInspector(page, "team_checkout", "Payments");

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_MAP);
    const before = EXAMPLE_MAP.split("\n");
    const after = (await documentText(page)).split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, index) => line !== before[index])).toEqual([
      '      "label": "Payments",',
    ]);
    expect(await appliedEdits(page)).toBe(1);
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a change in the text editor reaches the canvas and writes nothing back", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await page.evaluate(
      (text) => {
        const { host, document } = window.vscodeHost!;
        host.replaceText(document, text);
      },
      EXAMPLE_MAP.replace('"label": "Checkout & Payments"', '"label": "Payments"'),
    );

    await expect.poll(() => canvasLabel(page, "team_checkout")).toBe("Payments");
    expect(await appliedEdits(page)).toBe(0);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await removeOnCanvas(page, "team_fraud");
    await removeOnCanvas(page, "team_discovery");
    expect(await appliedEdits(page)).toBe(2);

    expect(await undo(page)).toBe(true);
    await expect(shape(page, "team_discovery")).toBeAttached();
    await expect(shape(page, "team_fraud")).toHaveCount(0);
    expect(await undo(page)).toBe(true);
    await expect(shape(page, "team_fraud")).toBeAttached();
    expect(await documentText(page)).toBe(EXAMPLE_MAP);

    expect(await redo(page)).toBe(true);
    await expect(shape(page, "team_fraud")).toHaveCount(0);
    await expect(shape(page, "team_discovery")).toBeAttached();
    expect(await appliedEdits(page)).toBe(2);
  });

  test("a canvas change the document refuses is taken back on the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });

    await renameInInspector(page, "team_checkout", "Not written");

    await expect.poll(() => postedTypes(page)).toContain("update");
    await expect.poll(() => canvasLabel(page, "team_checkout")).toBe("Checkout & Payments");
    expect(await documentText(page)).toBe(EXAMPLE_MAP);
    expect(await appliedEdits(page)).toBe(0);
  });

  test("the pill counts the problems of the document as it changes", async ({ page }) => {
    await openWebview(page, { host: true });
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toBeHidden();

    await page.evaluate(
      (text) => {
        const { host, document } = window.vscodeHost!;
        host.replaceText(document, text);
      },
      EXAMPLE_MAP.replace('"attachedTo": "int_checkout_fraud"', '"attachedTo": "nowhere"'),
    );

    await expect(pill).toBeVisible();
    await expect(pill).toHaveAccessibleName("1 problem, no errors");
    await pill.click();
    await expect
      .poll(() =>
        page.evaluate(() => window.vscodeHost!.host.executedCommands.map(({ command }) => command)),
      )
      .toContain("workbench.actions.view.problems");
  });

  test("Insert example is one edit the canvas imports, and one undo step", async ({ page }) => {
    await openWebview(page, { host: true, doc: "empty" });
    await page.getByRole("button", { name: "Insert example" }).click();

    await expect(shape(page, "team_checkout")).toBeAttached();
    await expect(page.getByRole("button", { name: "Insert example" })).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_MAP));
    expect(await appliedEdits(page)).toBe(1);

    expect(await undo(page)).toBe(true);
    await expect(page.getByRole("button", { name: "Insert example" })).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_MAP);
  });
});
