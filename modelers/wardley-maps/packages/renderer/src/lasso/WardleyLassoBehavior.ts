import type EventBus from "diagram-js/lib/core/EventBus";
import type Canvas from "diagram-js/lib/core/Canvas";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";

interface ElementMouseEvent {
  element?: unknown;
  originalEvent?: MouseEvent;
}

/** The lasso's tool name in diagram-js's tool manager, and the drag that holds it armed. */
const LASSO_TOOL = "lasso";
export const LASSO_SELECTION = "lasso.selection";

/**
 * Activates the diagram-js lasso via Shift+drag on the empty canvas.
 * Plain drag stays canvas pan (MoveCanvas); Shift+click on elements stays multi-select.
 * The lasso tool counts as active exactly while its drag holds it armed, so a palette's pressed
 * state (`tool-manager.update`) follows it.
 */
export default class WardleyLassoBehavior {
  static $inject = ["eventBus", "canvas", "lassoTool", "toolManager"];

  constructor(eventBus: EventBus, canvas: Canvas, lassoTool: LassoTool, toolManager: ToolManager) {
    eventBus.on("element.mousedown", 1500, (event: ElementMouseEvent) => {
      const original = event.originalEvent;
      if (!original?.shiftKey) return undefined;
      let root: unknown;
      try {
        root = canvas.getRootElement();
      } catch {
        return undefined;
      }
      if (event.element !== root) return undefined;
      lassoTool.activateLasso(original);
      // Returning false stops lower-priority listeners (canvas pan).
      return false;
    });
    // diagram-js releases a tool when its drag ends, but on a cancel only once the pointer has moved
    // the drag, so a lasso that only waited, put down by Escape or from its entry, stayed pressed.
    eventBus.on(`${LASSO_SELECTION}.cleanup`, () => {
      if (toolManager.isActive(LASSO_TOOL)) toolManager.setActive(null);
    });
  }
}
