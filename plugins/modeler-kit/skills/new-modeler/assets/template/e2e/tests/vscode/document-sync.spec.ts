import { expect, test, type Page } from '@playwright/test';
import { vsCodeStubSearch } from '@miragon/modeler-shell/testing';
import {
  EMPTY_DIAGRAM,
  EXAMPLE_DIAGRAM,
  withExampleInserted,
} from '../../../apps/vscode/src/examples.js';

/**
 * The webview and the extension's document plumbing (`registerModelerEditor` of the shell, with the
 * diagram editor's options) together, against the shell's stand-in for VS Code's documents: what
 * the canvas does reaches the document as a minimal edit, and what happens to the document reaches
 * the canvas. A real VS Code runs the same in the smoke test.
 */

const PAY_LINE = EXAMPLE_DIAGRAM.split('\n').indexOf('node pay "Take payment" [280, 40]');
const PICK_LINE = EXAMPLE_DIAGRAM.split('\n').indexOf('node pick "Pick items" [520, 40]');

async function openInHost(page: Page, doc?: 'empty'): Promise<void> {
  const search = new URLSearchParams(vsCodeStubSearch({ theme: 'light' }));
  search.set('host', '');
  if (doc) search.set('doc', doc);
  await page.goto(`/webview-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.webviewReady === true);
}

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

function node(page: Page, id: string) {
  return page.locator(`.djs-shape[data-element-id="${id}"]`);
}

async function rename(page: Page, id: string, label: string): Promise<void> {
  await node(page, id).dblclick();
  await page.locator('textarea.diagram-label-editor').waitFor();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(label);
  await page.keyboard.press('Enter');
}

const undo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.undo(window.vscodeHost!.document));
const redo = (page: Page) =>
  page.evaluate(() => window.vscodeHost!.host.redo(window.vscodeHost!.document));

test.describe('VS Code webview: the document both ways', () => {
  test('a label typed on the canvas rewrites only its line, whose echo is not imported', async ({
    page,
  }) => {
    await openInHost(page);
    await rename(page, 'pay', 'Charge card');

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_DIAGRAM);
    expect(await appliedEdits(page)).toEqual([
      { startLine: PAY_LINE, text: 'node pay "Charge card" [280, 40]\n' },
    ]);
    expect(await documentText(page)).toBe(await canvasText(page));
    expect(await postedTypes(page)).not.toContain('update');
  });

  test('a move on the canvas is one edit of the line it changes, and no update comes back', async ({
    page,
  }) => {
    await openInHost(page);
    const box = (await node(page, 'pick').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => documentText(page)).not.toBe(EXAMPLE_DIAGRAM);
    const [edit, ...more] = await appliedEdits(page);
    expect(more).toEqual([]);
    expect(edit!.startLine).toBe(PICK_LINE);
    expect(edit!.text).toMatch(/^node pick "Pick items" \[\d+, \d+\]\n$/);
    expect(await documentText(page)).toBe(await canvasText(page));
    expect(await postedTypes(page)).not.toContain('update');
  });

  test('a change in the text editor reaches the canvas', async ({ page }) => {
    await openInHost(page);
    await page.evaluate(
      (text) => {
        const { host, document } = window.vscodeHost!;
        host.replaceText(document, text);
      },
      EXAMPLE_DIAGRAM.replace('"Pick items"', '"Pack items"'),
    );

    await expect(node(page, 'pick')).toContainText('Pack items');
    expect(await appliedEdits(page)).toEqual([]);
  });

  test('undo and redo in VS Code take the canvas back and forth, one canvas change per step', async ({
    page,
  }) => {
    await openInHost(page);
    await rename(page, 'pay', 'Charge card');
    await expect.poll(() => documentText(page)).toContain('"Charge card"');
    await rename(page, 'pay', 'Invoice');
    await expect.poll(() => documentText(page)).toContain('"Invoice"');

    expect(await undo(page)).toBe(true);
    await expect(node(page, 'pay')).toContainText('Charge card');
    expect(await undo(page)).toBe(true);
    await expect(node(page, 'pay')).toContainText('Take payment');
    expect(await documentText(page)).toBe(EXAMPLE_DIAGRAM);
    expect(await redo(page)).toBe(true);
    await expect(node(page, 'pay')).toContainText('Charge card');
    expect(await appliedEdits(page)).toHaveLength(2);
  });

  test('Insert example is one edit the canvas imports, and one undo step', async ({ page }) => {
    await openInHost(page, 'empty');
    const hint = page.locator('.cd-shell-hint');
    await hint.getByRole('button', { name: 'Insert example' }).click();

    await expect(node(page, 'ship')).toBeVisible();
    await expect(hint).toBeHidden();
    expect(await documentText(page)).toBe(withExampleInserted(EMPTY_DIAGRAM));
    expect(await appliedEdits(page)).toHaveLength(1);

    expect(await undo(page)).toBe(true);
    await expect(hint).toBeVisible();
    expect(await documentText(page)).toBe(EMPTY_DIAGRAM);
  });

  test('an edit VS Code refuses takes the canvas back to the document', async ({ page }) => {
    await openInHost(page);
    await page.evaluate(() => {
      window.vscodeHost!.document.readOnly = true;
    });
    await rename(page, 'pay', 'Charge card');

    await expect.poll(() => postedTypes(page)).toContain('update');
    await expect(node(page, 'pay')).toContainText('Take payment');
    expect(await documentText(page)).toBe(EXAMPLE_DIAGRAM);
    expect(await appliedEdits(page)).toEqual([]);
  });

  test('a save posts nothing to the canvas', async ({ page }) => {
    await openInHost(page);
    const before = await postedTypes(page);

    await page.evaluate(() => window.vscodeHost!.host.save(window.vscodeHost!.document));
    await page.waitForTimeout(100);

    expect(await postedTypes(page)).toEqual(before);
  });
});
