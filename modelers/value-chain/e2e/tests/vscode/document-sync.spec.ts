import { expect, test, type Page } from "@playwright/test";
import {
  EMPTY_DOCUMENT,
  EXAMPLE_DOCUMENT,
  withExampleInserted,
} from "../../../apps/vscode/src/examples.js";
import { openWebview } from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * diagram editor's options) together, against the shell's stand-in for VS Code's documents: what
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

function nameOnCanvas(page: Page, id: string): Promise<string | undefined> {
  return page.evaluate(
    (elementId) =>
      window
        .modeler!.diagram.get<{ get(id: string): { vcLabel?: string } | undefined }>(
          "elementRegistry",
        )
        .get(elementId)?.vcLabel,
    id,
  );
}

async function rename(page: Page, id: string, name: string): Promise<void> {
  await page.locator(`.djs-shape[data-element-id="${id}"]`).dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
}

test.describe("VS Code webview: the document both ways", () => {
  test("a label typed on the canvas rewrites only its name line, whose echo is not imported", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await rename(page, "step-service", "After-sales");

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_DOCUMENT);
    expect(await appliedEdits(page)).toEqual([
      {
        startLine: EXAMPLE_DOCUMENT.split("\n").indexOf('      "name": "Service"'),
        text: '      "name": "After-sales"\n',
      },
    ]);
    expect(await documentText(page)).toBe(await canvasText(page));
    expect(await postedTypes(page)).not.toContain("update");
  });

  test("a move on the canvas is one edit of the lines it changes, and no update comes back", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const box = (await page.locator('.djs-shape[data-element-id="step-service"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_DOCUMENT);
    const [edit, ...more] = await appliedEdits(page);
    expect(more).toEqual([]);
    // The lines before and after the changed ones stay untouched.
    expect(edit!.startLine).toBeGreaterThan(0);
    expect(edit!.text.split("\n").length).toBeLessThan(
      EXAMPLE_DOCUMENT.split("\n").length - edit!.startLine,
    );
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
      EXAMPLE_DOCUMENT.replace('"name": "Testing"', '"name": "Quality"'),
    );

    await expect(page.locator('.djs-shape[data-element-id="step-testing"]')).toContainText(
      "Quality",
    );
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    await rename(page, "step-service", "After-sales");
    await expect.poll(() => documentText(page)).toContain('"name": "After-sales"');
    await rename(page, "step-service", "Support");
    await expect.poll(() => documentText(page)).toContain('"name": "Support"');

    const undo = () =>
      page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    const redo = () =>
      page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));
    expect(await undo()).toBe(true);
    await expect.poll(() => nameOnCanvas(page, "step-service")).toBe("After-sales");
    expect(await undo()).toBe(true);
    await expect.poll(() => nameOnCanvas(page, "step-service")).toBe("Service");
    expect(await documentText(page)).toBe(EXAMPLE_DOCUMENT);
    expect(await redo()).toBe(true);
    await expect.poll(() => nameOnCanvas(page, "step-service")).toBe("After-sales");
    expect(await appliedEdits(page)).toHaveLength(2);
  });

  test("Insert example is one edit the canvas imports and fits, and one undo step", async ({
    page,
  }) => {
    await openWebview(page, { host: true, diagram: "empty" });
    const hint = page.locator(".cd-shell-hint");
    await hint.getByRole("button", { name: "Insert example" }).click();

    await expect(page.locator('.djs-shape[data-element-id="step-operations"]')).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_DOCUMENT));
    expect(await appliedEdits(page)).toHaveLength(1);

    await page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_DOCUMENT);
  });

  test("an edit VS Code refuses takes the canvas back to the document", async ({ page }) => {
    await openWebview(page, { host: true });
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });
    await rename(page, "step-service", "After-sales");

    await expect.poll(() => postedTypes(page)).toContain("update");
    await expect.poll(() => nameOnCanvas(page, "step-service")).toBe("Service");
    expect(await documentText(page)).toBe(EXAMPLE_DOCUMENT);
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("a change that leaves the diagram as it was keeps the document's own formatting", async ({
    page,
  }) => {
    await openWebview(page, { host: true });
    const reformatted = JSON.stringify(JSON.parse(EXAMPLE_DOCUMENT), null, 4);
    await page.evaluate((text) => {
      const { host, document } = window.vscodeHost!;
      host.replaceText(document, text);
    }, reformatted);
    await expect.poll(() => postedTypes(page)).toContain("update");
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const diagram = window.modeler!.diagram;
      const shape = diagram
        .get<{ get(id: string): unknown }>("elementRegistry")
        .get("step-service");
      diagram
        .get<{ moveElements(elements: unknown[], delta: { x: number; y: number }): void }>(
          "modeling",
        )
        .moveElements([shape], { x: 0, y: 0 });
    });
    await page.waitForTimeout(200);
    expect(await documentText(page)).toBe(reformatted);
    expect(await appliedEdits(page)).toEqual([]);

    await rename(page, "step-service", "After-sales");
    await expect.poll(() => documentText(page)).toContain('"name": "After-sales"');
    expect(await documentText(page)).toBe(await canvasText(page));
  });

  test("a save posts nothing to the canvas", async ({ page }) => {
    await openWebview(page, { host: true });
    const before = await postedTypes(page);

    await page.evaluate(() => window.vscodeHost!.host.save(window.vscodeHost!.document));
    await page.waitForTimeout(100);

    expect(await postedTypes(page)).toEqual(before);
  });
});
