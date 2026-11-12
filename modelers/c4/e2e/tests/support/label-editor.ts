import type { Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";

/**
 * The label editor of the kit's `labelEditor` case: a double-click on the first element of the view
 * opens it (on the band under the pointer, or the name where that band cannot be edited, SPEC 5.5)
 * and the typed text replaces the selected field. Every open types a new text, so a commit after a
 * commit still changes the document.
 */
export function labelEditorHooks(): LabelEditorHooks<Page> {
  let opens = 0;
  return {
    async open(page) {
      await page.locator(".djs-shape[data-element-id]").first().dblclick();
      await page.locator("textarea.diagram-label-editor").waitFor();
      opens += 1;
      const typed = `Renamed ${opens}`;
      await page.keyboard.type(typed);
      return typed;
    },
  };
}
