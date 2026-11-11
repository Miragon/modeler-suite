import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write under unsaved edits is merged with them by `mergeCanvasText`, a
 * conflicting one leaves the user's draft and Orca's banner.
 */
const CANVAS = readFileSync(new URL("../../../example/miragon.bmc", import.meta.url), "utf8");

const removeOnCanvas = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const diagram = window.modeler!.diagram;
    const element = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(elementId);
    diagram
      .get<{ removeElements(elements: unknown[]): void }>("modeling")
      .removeElements([element]);
  }, id);

type Canvas = Record<string, { items: { id: string; text: string; color?: string }[] }>;

/** The canvas text with `change` applied, written as the modeler writes it. */
function edited(text: string, change: (canvas: Canvas) => void): string {
  const canvas = parse(text) as Canvas;
  change(canvas);
  return serializeText(readText(JSON.stringify(canvas)).document);
}

const withSticky = (text: string, sticky: string): string =>
  edited(text, (canvas) => canvas["channels"]!.items.unshift({ id: "agent", text: sticky }));

const withoutOrcaTeam = (canvas: Canvas) => {
  const partners = canvas["key-partners"]!;
  partners.items = partners.items.filter((item) => item.id !== "orca-team");
};

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

test.describe("Orca editor: document sync", () => {
  test("an agent's write under unsaved edits is merged with them, without the banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: CANVAS });
    await removeOnCanvas(page, "orca-team");
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      withSticky(CANVAS, "Written by an agent"),
    );
    await expect.poll(() => canvasText(page)).toContain("Written by an agent");
    expect(await canvasText(page)).not.toContain("text: Orca team\n");
    const tab = await orcaTab(page);
    expect(tab.banner).toBe(false);
    expect(tab.text).toContain("Written by an agent");
  });

  test("a write that changes what the user removed leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: CANVAS });
    await removeOnCanvas(page, "orca-team");
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      edited(CANVAS, (canvas) => {
        canvas["key-partners"]!.items.find((item) => item.id === "orca-team")!.color = "sun";
      }),
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(await canvasText(page)).not.toContain("text: Orca team\n");
  });

  test("an edit on the canvas reaches Orca's tab as one change", async ({ page }) => {
    await openOrcaEditor(page, { text: CANVAS });
    await removeOnCanvas(page, "orca-team");
    const tab = await orcaTab(page);
    expect(tab.dirty).toBe(true);
    expect(tab.text).toBe(edited(CANVAS, withoutOrcaTeam));
  });
});
