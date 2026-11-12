import type { Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";

/** The centre of the first step or organizational unit a pointer reaches, in viewport coordinates. */
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
 * The shell kit's `labelEditor` hooks, the way a user edits a label: a double-click on a step or an
 * organizational unit opens its editor and the typed text goes after the label.
 */
export function labelEditorHooks(): LabelEditorHooks<Page> {
  const opensByPage = new WeakMap<Page, number>();
  return {
    async open(page) {
      const target = await page.evaluate(reachableShapeProbe);
      if (!target) throw new Error("no step or organizational unit a pointer reaches");
      await page.mouse.dblclick(target.x, target.y);
      await page.waitForFunction(
        () => document.activeElement?.classList.contains("djs-direct-editing-content") === true,
      );
      const opens = (opensByPage.get(page) ?? 0) + 1;
      opensByPage.set(page, opens);
      // No space: a contenteditable holds a trailing one as a no-break space for a moment.
      const typed = `Edited${opens}`;
      await page.keyboard.type(typed);
      return typed;
    },
  };
}
