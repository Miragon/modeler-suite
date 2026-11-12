import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write to a clean tab reaches the canvas, one under unsaved edits is merged
 * with them by `mergeOwmText`, a conflicting one leaves the user's draft and Orca's banner, and
 * the canvas owns undo.
 */
const MAP = readFileSync(
  new URL("../../../apps/orca/test-smoke/smoke.owm", import.meta.url),
  "utf8",
);
const CART_AT_START = "component Cart [0.6, 0.35]";
const AGENT_COMPONENT = "component Inventory [0.4, 0.6]";

const withAgentComponent = (text: string): string => `${text.trimEnd()}\n${AGENT_COMPONENT}\n`;

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

const cartLine = async (page: Page): Promise<string> => {
  const line = (await canvasText(page))
    .split("\n")
    .find((entry) => entry.startsWith("component Cart "));
  return line!;
};

const moveCartOnCanvas = async (page: Page): Promise<string> => {
  await page.evaluate(() => {
    const diagram = window.modeler!.diagram;
    const cart = diagram.get<{ get(id: string): unknown }>("elementRegistry").get("cmp_cart");
    diagram
      .get<{ moveElements(shapes: unknown[], delta: { x: number; y: number }): void }>("modeling")
      .moveElements([cart], { x: 80, y: 0 });
  });
  const movedCart = await cartLine(page);
  expect(movedCart).not.toBe(CART_AT_START);
  return movedCart;
};

test.describe("Orca editor: document sync", () => {
  test("an agent's write to the clean tab reaches the canvas, and undo cannot revert it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: MAP });
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.replace(text),
      withAgentComponent(MAP),
    );
    await expect.poll(() => canvasText(page)).toContain(AGENT_COMPONENT);
    expect(
      await page.evaluate(() =>
        window.modeler!.diagram.get<{ canUndo(): boolean }>("commandStack").canUndo(),
      ),
    ).toBe(false);
  });

  test("a canvas edit goes to Orca's tab, a save writes it, and Cmd/Ctrl+Z on the canvas undoes it", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: MAP });
    const movedCart = await moveCartOnCanvas(page);
    const tab = await orcaTab(page);
    expect(tab.text).toContain(movedCart);
    expect(tab.dirty).toBe(true);
    await page.evaluate(() => window.__modelerShellOrcaStub!.save());
    expect((await orcaTab(page)).disk).toContain(movedCart);

    await page
      .locator(".cd-shell-canvas svg")
      .first()
      .click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await orcaTab(page)).text).toContain(CART_AT_START);
  });

  test("an agent's write under unsaved edits is merged with them, without the banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: MAP });
    const movedCart = await moveCartOnCanvas(page);
    await orcaTab(page);
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      withAgentComponent(MAP),
    );
    await expect.poll(() => canvasText(page)).toContain(AGENT_COMPONENT);
    expect(await canvasText(page)).toContain(movedCart);
    const tab = await orcaTab(page);
    expect(tab.banner).toBe(false);
    expect(tab.dirty).toBe(true);
    expect(tab.text).toContain(AGENT_COMPONENT);
    expect(tab.text).toContain(movedCart);
  });

  test("a write that changes what the user changed keeps the draft and leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page, { text: MAP });
    const movedCart = await moveCartOnCanvas(page);
    await orcaTab(page);
    const agentCart = "component Cart [0.45, 0.35]";
    await page.evaluate(
      (text) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(text),
      MAP.replace(CART_AT_START, agentCart),
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(await canvasText(page)).toContain(movedCart);

    await page.evaluate(() => window.__modelerShellOrcaStub!.reload());
    await expect.poll(() => canvasText(page)).toContain(agentCart);
  });
});
