import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import { EXAMPLE_DOCUMENT } from "../../../apps/ide-editor/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * canvas editor's options) together, against the shell's stand-in for VS Code's documents: what
 * the canvas does reaches the document as a minimal edit, and what happens to the document reaches
 * the canvas. A real VS Code runs the same in CI's smoke test.
 */

function documentText(page: Page): Promise<string> {
  return page.evaluate(() => window.vscodeHost!.document.getText());
}

function canvasText(page: Page): Promise<string> {
  return page.evaluate(() => window.modeler!.exportText());
}

function appliedEdits(page: Page): Promise<Array<{ startLine: number; text: string }>> {
  return page.evaluate(() =>
    window.vscodeHost!.host.appliedEdits.map((edit) => ({
      startLine: edit.range.start.line,
      text: edit.text,
    })),
  );
}

function postedTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.vscodeHost!.panel.posted.map((message) => (message as { type: string }).type),
  );
}

function textOnCanvas(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate(
    (elementId) =>
      window
        .modeler!.diagram.get<{ get(id: string): { sticky?: { text: string } } | undefined }>(
          "elementRegistry",
        )
        .get(elementId)?.sticky?.text,
    id,
  );
}

async function rename(page: Page, id: string, text: string): Promise<void> {
  await page.locator(`.djs-shape[data-element-id="${id}"]`).dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

const TALKS = "workshops";

const idsIn = (text: string, blockId: string): string[] =>
  (parse(text) as Record<string, { items: { id: string }[] }>)[blockId]!.items.map(
    (item) => item.id,
  );
const TALKS_LINE = "      text: Workshops and talks";

test.describe("VS Code webview: the document both ways", () => {
  test("a text typed on the canvas rewrites only its sticky's line, whose echo is not imported", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await rename(page, TALKS, "Meetups");

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_DOCUMENT);
    expect(await appliedEdits(page)).toEqual([
      {
        startLine: EXAMPLE_DOCUMENT.split("\n").indexOf(TALKS_LINE),
        text: "      text: Meetups\n",
      },
    ]);
    expect(await documentText(page)).toBe(await canvasText(page));
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a sticky dragged into another block is one edit, and no update comes back", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const from = (await page.locator(`.djs-shape[data-element-id="${TALKS}"]`).boundingBox())!;
    const onto = (await page.locator('.djs-shape[data-element-id="bpmn-io"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(onto.x + 6, onto.y + onto.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => idsIn(await documentText(page), "key-partners"))
      .toEqual([TALKS, "bpmn-io", "orca-team"]);
    expect(await appliedEdits(page)).toHaveLength(1);
    expect(await documentText(page)).toBe(await canvasText(page));
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a change in the text editor reaches the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate(
      (text) => {
        const { host, document } = window.vscodeHost!;
        host.replaceText(document, text);
      },
      EXAMPLE_DOCUMENT.replace(TALKS_LINE, "      text: Talks at meetups"),
    );

    await expect(page.locator(`.djs-shape[data-element-id="${TALKS}"]`)).toContainText(
      "Talks at meetups",
    );
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await rename(page, TALKS, "Meetups");
    await expect.poll(() => documentText(page)).toContain("text: Meetups\n");
    await rename(page, TALKS, "Conferences");
    await expect.poll(() => documentText(page)).toContain("text: Conferences\n");

    const undo = () =>
      page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    const redo = () =>
      page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));
    expect(await undo()).toBe(true);
    await expect.poll(() => textOnCanvas(page, TALKS)).toBe("Meetups");
    expect(await undo()).toBe(true);
    await expect.poll(() => textOnCanvas(page, TALKS)).toBe("Workshops and talks");
    expect(await documentText(page)).toBe(EXAMPLE_DOCUMENT);
    expect(await redo()).toBe(true);
    await expect.poll(() => textOnCanvas(page, TALKS)).toBe("Meetups");
    expect(await appliedEdits(page)).toHaveLength(2);
  });

  test("an edit VS Code refuses takes the canvas back to the document", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });
    await rename(page, TALKS, "Meetups");

    await expect.poll(() => postedTypes(page)).toContain("update");
    await expect.poll(() => textOnCanvas(page, TALKS)).toBe("Workshops and talks");
    expect(await documentText(page)).toBe(EXAMPLE_DOCUMENT);
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("a change that leaves the canvas as it was keeps the document's own trailing spaces", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const reformatted = EXAMPLE_DOCUMENT.replace(/\n/g, "  \n");
    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, reformatted);
    await page.waitForTimeout(200);

    await page.evaluate((id) => {
      const diagram = window.modeler!.diagram;
      const shape = diagram.get<{ get(id: string): unknown }>("elementRegistry").get(id);
      diagram
        .get<{ moveElements(elements: unknown[], delta: { x: number; y: number }): void }>(
          "modeling",
        )
        .moveElements([shape], { x: 0, y: 0 });
    }, TALKS);
    await page.waitForTimeout(200);
    expect(await documentText(page)).toBe(reformatted);
    expect(await appliedEdits(page)).toEqual([]);

    await rename(page, TALKS, "Meetups");
    await expect.poll(() => documentText(page)).toContain("text: Meetups\n");
  });

  test("a save posts nothing to the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    const before = await postedTypes(page);

    await page.evaluate(() => window.vscodeHost!.host.save(window.vscodeHost!.document));
    await page.waitForTimeout(100);

    expect(await postedTypes(page)).toEqual(before);
  });
});
