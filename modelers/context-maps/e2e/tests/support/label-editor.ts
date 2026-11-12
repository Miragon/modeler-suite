import type { Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";

/** How often the editor was opened on each page; each open types a name no commit wrote yet. */
const opensByPage = new WeakMap<Page, number>();

/** The centre of the first context a pointer reaches, in viewport coordinates. */
const reachableContextProbe = (root: string): { x: number; y: number } | null => {
  for (const shape of document.querySelectorAll(`${root} .djs-shape[data-element-id]`)) {
    const rect = shape.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && shape.contains(hit)) return { x, y };
  }
  return null;
};

/**
 * The shell kit's `labelEditor` hooks for a page that shows a map: a double-click on a context
 * opens its name editor with the caret after the name, and the typed text stays uncommitted.
 */
export function contextNameEditor(root = ".cd-shell"): LabelEditorHooks<Page> {
  return {
    async open(page) {
      const context = await page.evaluate(reachableContextProbe, root);
      if (!context) throw new Error("the map shows no context a pointer reaches to rename");
      await page.mouse.dblclick(context.x, context.y);
      await page.waitForFunction(() =>
        document.activeElement?.classList.contains("djs-direct-editing-content"),
      );
      const opens = (opensByPage.get(page) ?? 0) + 1;
      opensByPage.set(page, opens);
      // No space: a contenteditable holds a trailing one as U+00A0, which the kit would not find.
      const typed = `-renamed-${opens}`;
      await page.keyboard.type(typed);
      return typed;
    },
  };
}
