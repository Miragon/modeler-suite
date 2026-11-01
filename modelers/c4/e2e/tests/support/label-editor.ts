import type { Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";

/**
 * The label editor of the kit's `labelEditor` case: a double-click on the first element of the view
 * opens it (on the band under the pointer, or the name where that band cannot be edited, SPEC 5.5),
 * the typed text replaces the selected field, and the document changed once the modeler exports
 * another text than when the editor opened. Every open types a new text, so a commit after a commit
 * still changes the document.
 */
export function labelEditorHooks(
  exportText: (page: Page) => Promise<string>,
): LabelEditorHooks<Page> {
  let opens = 0;
  let exportedAtOpen = "";
  return {
    async open(page) {
      await page.locator(".djs-shape[data-element-id]").first().dblclick();
      await page.locator("textarea.diagram-label-editor").waitFor();
      opens += 1;
      const typed = `Renamed ${opens}`;
      await page.keyboard.type(typed);
      exportedAtOpen = await exportText(page);
      return typed;
    },
    async documentChanged(page) {
      return (await exportText(page)) !== exportedAtOpen;
    },
  };
}
