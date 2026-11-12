import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE_DIAGRAM } from '../../../apps/ide-editor/src/examples.js';
import { openOrcaEditor, orcaTab } from './support/orca.js';

/**
 * The Orca editor's document sync against the stub's tab, which follows the rules of Orca's own
 * session: an agent's write under unsaved edits is merged with them by `mergeDiagramText`, a
 * conflicting one leaves the user's draft and Orca's banner.
 */
const PICK = 'node pick "Pick items" [520, 40]\n';
const PAY = 'node pay "Take payment" [280, 40]';
const withoutPick = EXAMPLE_DIAGRAM.replace(PICK, '');

const removeOnCanvas = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    const diagram = window.modeler!.diagram;
    const element = diagram.get<{ get(id: string): unknown }>('elementRegistry').get(elementId);
    diagram
      .get<{ removeElements(elements: unknown[]): void }>('modeling')
      .removeElements([element]);
  }, id);

const canvasText = (page: Page) => page.evaluate(() => window.modeler!.exportText());

const diskWriteWhileDirty = (page: Page, text: string) =>
  page.evaluate((written) => window.__modelerShellOrcaStub!.diskWriteWhileDirty(written), text);

test.describe('Orca editor: document sync', () => {
  test("an edit on the canvas reaches Orca's tab as one change", async ({ page }) => {
    await openOrcaEditor(page);
    await removeOnCanvas(page, 'pick');
    const tab = await orcaTab(page);
    expect(tab.dirty).toBe(true);
    expect(tab.text).toBe(withoutPick);
  });

  test("an agent's write under unsaved edits is merged with them, without the banner", async ({
    page,
  }) => {
    await openOrcaEditor(page);
    await removeOnCanvas(page, 'pick');
    await orcaTab(page);
    await diskWriteWhileDirty(
      page,
      EXAMPLE_DIAGRAM.replace(PAY, 'node pay "Charge card" [280, 40]'),
    );
    await expect.poll(() => canvasText(page)).toContain('Charge card');
    expect(await canvasText(page)).not.toContain('Pick items');
    const tab = await orcaTab(page);
    expect(tab.banner).toBe(false);
    expect(tab.text).toBe(withoutPick.replace(PAY, 'node pay "Charge card" [280, 40]'));
  });

  test("a write that changes what the user removed leaves the choice to Orca's banner", async ({
    page,
  }) => {
    await openOrcaEditor(page);
    await removeOnCanvas(page, 'pick');
    await orcaTab(page);
    await diskWriteWhileDirty(
      page,
      EXAMPLE_DIAGRAM.replace(PICK, 'node pick "Pack items" [520, 40]\n'),
    );
    await expect.poll(async () => (await orcaTab(page)).banner).toBe(true);
    expect(await canvasText(page)).not.toContain('Pick items');
  });
});
