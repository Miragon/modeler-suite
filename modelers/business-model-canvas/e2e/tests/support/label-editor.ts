import type { Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";

/** The centre of the first sticky a pointer reaches, in viewport coordinates. */
const reachableShapeProbe = (): { x: number; y: number } | null => {
  for (const shape of document.querySelectorAll(".djs-shape[data-element-id]")) {
    const rect = shape.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && shape.contains(hit)) return { x, y };
  }
  return null;
};

/**
 * The shell kit's `labelEditor` hooks, the way a user edits a label: a double-click on a sticky
 * opens its editor, which selects the text, and the typed text replaces it.
 */
export function labelEditorHooks(): LabelEditorHooks<Page> {
  const opensByPage = new WeakMap<Page, number>();
  return {
    async open(page) {
      const target = await page.evaluate(reachableShapeProbe);
      if (!target) throw new Error("no sticky a pointer reaches");
      await page.mouse.dblclick(target.x, target.y);
      await page.waitForFunction(
        () => document.activeElement?.classList.contains("diagram-label-editor") === true,
      );
      const opens = (opensByPage.get(page) ?? 0) + 1;
      opensByPage.set(page, opens);
      const typed = `Edited${opens}`;
      await page.keyboard.type(typed);
      return typed;
    },
  };
}
