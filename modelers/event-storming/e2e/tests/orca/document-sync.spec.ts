import { expect, test, type Page } from "@playwright/test";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write to a clean tab reaches the canvas, one under unsaved edits leaves the
 * user's draft and Orca's banner, and the canvas owns undo.
 */
const BOARD = [
  "title Checkout",
  "command Place Order [240, 300]",
  "event Order Placed [620, 300]",
  "Place Order -> Order Placed",
  "",
].join("\n");

const moveOnCanvas = (page: Page, id: string, dx: number) =>
  page.evaluate(
    ({ elementId, delta }) => {
      const diagram = window.modeler!.diagram;
      const shape = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(elementId);
      diagram
        .get<{ moveElements(shapes: unknown[], delta: { x: number; y: number }): void }>("modeling")
        .moveElements([shape], { x: delta, y: 0 });
    },
    { elementId: id, delta: dx },
  );

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

test.describe("Orca editor: document sync", () => {
  test("an agent's write to the clean tab reaches the canvas, and undo cannot revert it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: BOARD });
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.replace(text),
      `${BOARD}policy Ship it [800, 300]\n`,
    );
    await expect.poll(() => canvasText(page)).toContain("policy Ship it [800, 300]");
    expect(
      await page.evaluate(() =>
        window.modeler!.diagram.get<{ canUndo(): boolean }>("commandStack").canUndo(),
      ),
    ).toBe(false);
  });

  test("a canvas edit goes to Orca's tab, a save writes it, and Cmd/Ctrl+Z on the canvas undoes it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: BOARD });
    await moveOnCanvas(page, "cmd_place_order", 40);
    const tab = await orcaTab(page);
    expect(tab.text).toContain("command Place Order [280, 300]");
    expect(tab.dirty).toBe(true);
    await page.evaluate(() => window.__modelerShellOrcaStub!.save());
    expect((await orcaTab(page)).disk).toContain("command Place Order [280, 300]");

    await page
      .locator(".cd-shell-canvas svg")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await orcaTab(page)).text)
      .toContain("command Place Order [240, 300]");
  });

  test("an agent's write under unsaved edits keeps the draft and leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: BOARD });
    await moveOnCanvas(page, "cmd_place_order", 40);
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      `${BOARD}policy Ship it [800, 300]\n`,
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(await canvasText(page)).toContain("command Place Order [280, 300]");
    expect(await canvasText(page)).not.toContain("policy Ship it");

    await page.evaluate(() => window.__modelerShellOrcaStub!.reload());
    await expect.poll(() => canvasText(page)).toContain("policy Ship it [800, 300]");
    expect(await canvasText(page)).toContain("command Place Order [240, 300]");
  });

  test("a read-only file opens locked", async ({ page }) => {
    await openOrcaEditor(page, { text: BOARD, readOnly: true });
    expect(await page.evaluate(() => window.shell!.isReadOnly())).toBe(true);
  });

  test("an export goes through Orca's save dialog", async ({ page }) => {
    await openOrcaEditor(page, { text: BOARD });
    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitem", { name: /SVG/ }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__modelerShellOrcaStub!.saved.map((file) => file.suggestedName)),
      )
      .toEqual(["board.svg"]);
  });
});
