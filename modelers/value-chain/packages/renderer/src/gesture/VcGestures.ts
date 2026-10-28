import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { Element } from "diagram-js/lib/model/Types";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

interface ConnectInitEvent {
  context: { start: Element };
}

/**
 * Ends the user's gesture before an import replaces the shapes it works on. diagram-js keeps a drag
 * running across `diagram.clear`, and its drop would apply a command to removed shapes and throw
 * half-way.
 */
export default class VcGestures {
  static $inject = ["eventBus", "dragging", "toolManager", "elementRegistry"];

  private dropping = false;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    private readonly toolManager: ToolManager,
    elementRegistry: ElementRegistry,
  ) {
    eventBus.on("drag.end", FIRST, () => {
      this.dropping = true;
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => {
      this.dropping = false;
    });
    // The connect tool the palette armed starts its connect only when the pointer leaves the shape
    // it was pressed on, after the tool's own drag has ended: an import in between removed that
    // shape. Refused at init, the connect ends before it shows anything.
    eventBus.on("connect.init", FIRST, (event: ConnectInitEvent) => {
      const { start } = event.context;
      return elementRegistry.get(start.id) === start ? undefined : false;
    });
  }

  /**
   * Ends a running gesture the way Escape does, without bringing back a selection of the shapes the
   * import removes, and puts down a tool the palette armed, highlight included, also one whose
   * pointer has not moved yet (Escape leaves that one highlighted). A drop that is being applied
   * right now, a host importing from its change listener, is left to finish: its command has run,
   * the import replaces its result, and a cancel would pull the drag out from under diagram-js.
   */
  cancel(): void {
    if (this.dropping) return;
    this.dragging.cancel(false);
    this.toolManager.setActive(null);
  }
}
