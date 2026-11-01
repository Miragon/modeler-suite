import { expect, test, type Page } from "@playwright/test";
import { dragBy, labelEditor, rename, select, shape } from "../support/canvas.js";
import { EXAMPLE, EXAMPLE_UNPINNED_LANDSCAPE, SCRIPTED, lineOf } from "../support/documents.js";
import {
  appliedEdits,
  canvasText,
  documentText,
  hostPosted,
  openWebview,
  redo,
  replaceDocument,
  undo,
  webviewPosted,
} from "./support/webview.js";

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * diagram editor's options and the extension's save flush) together, against the shell's stand-in
 * for VS Code's documents: what the canvas does reaches the document as a minimal edit, and what
 * happens to the document reaches the canvas. A real VS Code runs the same in the smoke test.
 */

const PAYMENTS_LINE = lineOf(
  EXAMPLE,
  '        payments = softwareSystem "Payment Provider" "Takes card payments." "Existing System"',
);
// The landscape is the first view, so its layout line comes first in the file.
const CUSTOMER_LAYOUT_LINE = lineOf(
  EXAMPLE,
  '                "c4modeler.element.customer" "492,0"',
);

async function openInHost(page: Page, doc?: "empty" | "blank"): Promise<void> {
  await openWebview(page, { host: true, ...(doc ? { doc } : {}) });
}

/** Waits until the canvas holds `text`, after a change of the document reached it. */
async function canvasShows(page: Page, text: string): Promise<void> {
  await expect.poll(() => canvasText(page)).toBe(text);
}

function interactionActive(page: Page): Promise<boolean> {
  return page.evaluate(() => window.modeler!.interaction.active());
}

/** The lines `after` has in place of the lines of `before` it leaves out: one hunk of a diff. */
function changedLines(before: string, after: string): { removed: string[]; added: string[] } {
  const was = before.split("\n");
  const now = after.split("\n");
  let head = 0;
  while (head < was.length && head < now.length && was[head] === now[head]) head++;
  let tail = 0;
  while (
    tail < was.length - head &&
    tail < now.length - head &&
    was[was.length - 1 - tail] === now[now.length - 1 - tail]
  ) {
    tail++;
  }
  return { removed: was.slice(head, was.length - tail), added: now.slice(head, now.length - tail) };
}

test.describe("VS Code webview: the document both ways", () => {
  test("a name typed on the canvas rewrites one token, whose echo is not imported", async ({
    page,
  }) => {
    await openInHost(page);
    await rename(page, "payments", "Card Provider");

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE);
    expect(await documentText(page)).toBe(EXAMPLE.replace('"Payment Provider"', '"Card Provider"'));
    const edits = await appliedEdits(page);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ startLine: PAYMENTS_LINE });
    expect(await canvasText(page)).toBe(await documentText(page));
    expect(await hostPosted(page)).not.toContain("update");
  });

  test("a move in a pinned view rewrites its one layout line, and no update comes back", async ({
    page,
  }) => {
    await openInHost(page);
    await dragBy(page, "customer", { x: 0, y: 80 });

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE);
    const { removed, added } = changedLines(EXAMPLE, await documentText(page));
    expect(removed).toEqual(['                "c4modeler.element.customer" "492,0"']);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^ {16}"c4modeler\.element\.customer" "-?\d+,-?\d+"$/);
    const edits = await appliedEdits(page);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ startLine: CUSTOMER_LAYOUT_LINE });
    expect(await canvasText(page)).toBe(await documentText(page));
    expect(await hostPosted(page)).not.toContain("update");
  });

  test("the first move in an unpinned view is one edit that writes one layout block", async ({
    page,
  }) => {
    await openInHost(page);
    await replaceDocument(page, EXAMPLE_UNPINNED_LANDSCAPE);
    await canvasShows(page, EXAMPLE_UNPINNED_LANDSCAPE);
    const editsBefore = (await appliedEdits(page)).length;

    await dragBy(page, "customer", { x: 0, y: 80 });

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_UNPINNED_LANDSCAPE);
    expect(await appliedEdits(page)).toHaveLength(editsBefore + 1);
    const { removed, added } = changedLines(EXAMPLE_UNPINNED_LANDSCAPE, await documentText(page));
    expect(removed).toEqual([]);
    // Every element of the view gets its box, the moved one included: nothing jumps afterwards.
    expect(added).toEqual([
      "            properties {",
      expect.stringMatching(/^ {16}"c4modeler\.element\.bookshop" "-?\d+,-?\d+"$/),
      expect.stringMatching(/^ {16}"c4modeler\.element\.customer" "-?\d+,-?\d+"$/),
      expect.stringMatching(/^ {16}"c4modeler\.element\.mail" "-?\d+,-?\d+"$/),
      expect.stringMatching(/^ {16}"c4modeler\.element\.payments" "-?\d+,-?\d+"$/),
      "            }",
    ]);
    expect(await canvasText(page)).toBe(await documentText(page));
  });

  test("a change in the text editor reaches the canvas by its difference, with the selection kept", async ({
    page,
  }) => {
    await openInHost(page);
    await select(page, "bookshop");
    await page.evaluate(() => {
      const registry = window.modeler!.diagram.get<{ get(id: string): unknown }>("elementRegistry");
      Object.assign(window, { shapeBefore: registry.get("bookshop") });
    });

    const renamed = EXAMPLE.replace('softwareSystem "Bookshop"', 'softwareSystem "Book Shop"');
    await replaceDocument(page, renamed);

    await expect(shape(page, "bookshop")).toContainText("Book Shop");
    await canvasShows(page, renamed);
    const kept = await page.evaluate(() => {
      const diagram = window.modeler!.diagram;
      const shapeNow = diagram.get<{ get(id: string): unknown }>("elementRegistry").get("bookshop");
      const selected = diagram.get<{ get(): unknown[] }>("selection").get();
      return {
        sameShape: shapeNow === (window as unknown as { shapeBefore: unknown }).shapeBefore,
        selected: selected.includes(shapeNow),
      };
    });
    expect(kept).toEqual({ sameShape: true, selected: true });
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("a change of formatting only leaves the canvas as it is, and a running drag goes on", async ({
    page,
  }) => {
    await openInHost(page);
    const box = (await shape(page, "customer").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height * 0.3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 4 });
    await expect.poll(() => interactionActive(page)).toBe(true);

    // A formatter adds a comment while the user drags.
    await replaceDocument(page, `// Formatted\n${EXAMPLE}`);
    await expect.poll(() => hostPosted(page)).toContain("update");
    await page.waitForTimeout(100);
    expect(await interactionActive(page)).toBe(true);

    await page.mouse.move(x, y + 80, { steps: 4 });
    await page.mouse.up();

    // The move builds on the formatted bytes: their comment stays, and only the layout line goes.
    await expect.poll(() => canvasText(page)).not.toBe(`// Formatted\n${EXAMPLE}`);
    const after = await canvasText(page);
    const { removed, added } = changedLines(`// Formatted\n${EXAMPLE}`, after);
    expect(removed).toEqual(['                "c4modeler.element.customer" "492,0"']);
    expect(added).toEqual([expect.stringMatching(/^ {16}"c4modeler\.element\.customer" "/)]);
    await expect.poll(() => documentText(page)).toBe(after);
  });

  test("undo and redo in VS Code take the canvas back and forth, one canvas change per step", async ({
    page,
  }) => {
    await openInHost(page);
    await rename(page, "payments", "Card Provider");
    await expect.poll(() => documentText(page)).toContain('"Card Provider"');
    await rename(page, "payments", "Wallet Provider");
    await expect.poll(() => documentText(page)).toContain('"Wallet Provider"');

    expect(await undo(page)).toBe(true);
    await expect(shape(page, "payments")).toContainText("Card Provider");
    expect(await undo(page)).toBe(true);
    await expect(shape(page, "payments")).toContainText("Payment Provider");
    expect(await documentText(page)).toBe(EXAMPLE);
    await canvasShows(page, EXAMPLE);
    expect(await redo(page)).toBe(true);
    await expect(shape(page, "payments")).toContainText("Card Provider");
    expect(await appliedEdits(page)).toHaveLength(2);
  });

  test("Insert example is one edit the canvas imports, and one undo step", async ({ page }) => {
    await openInHost(page, "empty");
    const hint = page.locator(".cd-shell-hint");
    const emptyText = await documentText(page);
    await hint.getByRole("button", { name: "Insert example" }).click();

    await expect(shape(page, "customer")).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(EXAMPLE);
    expect(await appliedEdits(page)).toHaveLength(1);

    expect(await undo(page)).toBe(true);
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(emptyText);
  });

  // A file of zero bytes gets the skeleton New Empty C4 Diagram writes, the C4 colours included.
  test("the first element of a blank file brings the C4 colours, which stay once Delete empties it", async ({
    page,
  }) => {
    await openInHost(page, "blank");
    const hint = page.locator(".cd-shell-hint");
    await expect(hint).toBeVisible();
    await page.locator('.djs-palette [data-action="create.person"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(hint).toBeHidden();
    await expect.poll(() => documentText(page)).toBe(await canvasText(page));

    const created = await documentText(page);
    const person = /element "Person" \{\s*background "(#[0-9A-Fa-f]{6})"/.exec(created);
    expect(person, "the Person colour of the new skeleton").not.toBeNull();
    const [element] = await page.evaluate(() => window.modeler!.elements.list());
    const body = shape(page, element!.id).locator(".c4-body").first();
    expect((await body.getAttribute("fill"))?.toLowerCase()).toBe(person![1]!.toLowerCase());
    const edits = (await appliedEdits(page)).length;
    await page.evaluate(() => window.modeler!.c4.applyC4Colours());
    expect(await documentText(page)).toBe(created);
    expect(await appliedEdits(page)).toHaveLength(edits);

    await select(page, element!.id);
    await page.keyboard.press("Delete");
    await expect(hint).toBeVisible();
    expect(await page.evaluate(() => window.modeler!.isModelEmpty())).toBe(true);
    expect(await documentText(page)).toContain(person![0]);
  });

  test("an edit the modeler refuses writes nothing and shows a notification", async ({ page }) => {
    await openInHost(page);
    await replaceDocument(page, SCRIPTED);
    await canvasShows(page, SCRIPTED);

    // Shown nowhere else, the system would go from the model, which its script may still use.
    await select(page, "shop");
    await page.keyboard.press("Delete");

    await expect
      .poll(() => page.evaluate(() => window.vscodeHost!.host.notifications))
      .toEqual([
        {
          severity: "error",
          message: "A script or bulk statement on line 6 may use shop. Edit the text instead.",
        },
      ]);
    expect(await documentText(page)).toBe(SCRIPTED);
    expect(await canvasText(page)).toBe(SCRIPTED);
    expect(await appliedEdits(page)).toEqual([]);
    await expect(shape(page, "shop")).toBeVisible();
  });

  test("an edit VS Code refuses takes the canvas back to the document", async ({ page }) => {
    await openInHost(page);
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });
    await rename(page, "payments", "Card Provider");

    await expect.poll(() => hostPosted(page)).toContain("update");
    await expect(shape(page, "payments")).toContainText("Payment Provider");
    expect(await documentText(page)).toBe(EXAMPLE);
    await canvasShows(page, EXAMPLE);
    expect(await appliedEdits(page)).toEqual([]);
  });

  test("a save with nothing being typed in is only the flush round trip, and posts no edit", async ({
    page,
  }) => {
    await openInHost(page);
    const postedBefore = (await webviewPosted(page)).length;
    const hostBefore = (await hostPosted(page)).length;

    await page.evaluate(() => window.vscodeHost!.save());

    const fromWebview = (await webviewPosted(page)).slice(postedBefore);
    expect(fromWebview).toEqual([{ type: "c4.flushed", id: 1 }]);
    expect((await hostPosted(page)).slice(hostBefore)).toEqual(["c4.flush"]);
    expect(await appliedEdits(page)).toEqual([]);
    expect(await page.evaluate(() => window.vscodeHost!.saves)).toEqual([EXAMPLE]);
  });

  test("a description typed in the inspector and saved with Cmd/Ctrl+S is in the file", async ({
    page,
  }) => {
    await openInHost(page);
    await select(page, "payments");
    const inspector = page.locator('[data-chrome="inspector"]');
    await expect(inspector).toBeVisible();
    const description = inspector.getByLabel("Description", { exact: true });
    await description.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Takes card and wallet payments.");
    // Nothing has blurred the field yet: the save commits it first.
    expect(await documentText(page)).toBe(EXAMPLE);

    await page.keyboard.press("ControlOrMeta+s");

    const saved = EXAMPLE.replace('"Takes card payments."', '"Takes card and wallet payments."');
    await expect.poll(() => page.evaluate(() => window.vscodeHost!.saves)).toEqual([saved]);
    expect(await documentText(page)).toBe(saved);
    await expect(labelEditor(page)).toHaveCount(0);
  });
});
