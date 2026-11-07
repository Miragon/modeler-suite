import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write under unsaved edits is merged with them by `mergeValueChainText`, a
 * conflicting one leaves the user's draft and Orca's banner.
 */
const DIAGRAM = readFileSync(
  new URL("../../../apps/orca/test-smoke/smoke.vc.json", import.meta.url),
  "utf8",
);

const removeOnCanvas = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const diagram = window.modeler!.diagram;
    const element = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(elementId);
    diagram
      .get<{ removeElements(elements: unknown[]): void }>("modeling")
      .removeElements([element]);
  }, id);

const withStep = (text: string, id: string, name: string): string => {
  const document = JSON.parse(text) as { elements: unknown[] };
  document.elements.push({
    id,
    elementType: "step",
    name,
    bounds: { x: 100, y: 220, width: 160, height: 60 },
  });
  return JSON.stringify(document, null, 2);
};

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

test.describe("Orca editor: document sync", () => {
  test("an agent's write under unsaved edits is merged with them, without the banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await removeOnCanvas(page, "step_pick");
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      withStep(DIAGRAM, "step_agent", "Written by an agent"),
    );
    await expect.poll(() => canvasText(page)).toContain("Written by an agent");
    expect(await canvasText(page)).not.toContain('"Pick"');
    const tab = await orcaTab(page);
    expect(tab.banner).toBe(false);
    expect(tab.text).toContain("Written by an agent");
  });

  test("a write that changes what the user removed leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: DIAGRAM });
    await removeOnCanvas(page, "step_pick");
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      DIAGRAM.replace('"name": "Pick"', '"name": "Pick items"'),
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(await canvasText(page)).not.toContain('"Pick');
  });
});
