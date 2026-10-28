import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { Element } from "diagram-js/lib/model/Types";

/** Ahead of every other listener of the same event. */
const FIRST = 100_000;

/**
 * The drags of the palette's tools (lasso, hand, space, connect) while they only wait for the next
 * press: no gesture yet. They hold no element of the diagram, so an import leaves the tool armed,
 * and the user's next press still uses it.
 */
const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set([
  "lasso.selection",
  "hand",
  "spaceTool.selection",
  "global-connect",
]);

const GLOBAL_CONNECT_TOOL = "global-connect";

interface DragContext {
  prefix: string;
}

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
    toolManager: ToolManager,
    elementRegistry: ElementRegistry,
  ) {
    eventBus.on("drag.end", FIRST, () => {
      this.dropping = true;
    });
    eventBus.on(["drag.ended", "drag.canceled"], FIRST, () => {
      this.dropping = false;
    });
    // The connect tool the palette armed starts its connect from the shape it was pressed on, once
    // the pointer leaves that shape: an import may have removed the shape by then, also one that
    // came while the armed tool rested on it. Refused at init, the connect ends before it shows
    // anything; it then never ends or cancels, so the tool, which waits for that, is put down here.
    eventBus.on("connect.init", FIRST, (event: ConnectInitEvent) => {
      const { start } = event.context;
      if (elementRegistry.get(start.id) === start) return undefined;
      if (toolManager.isActive(GLOBAL_CONNECT_TOOL)) toolManager.setActive(null);
      return false;
    });
  }

  /**
   * Ends a running gesture the way Escape does, without bringing back a selection of the shapes the
   * import removes. A palette tool that only waits for its next press stays armed. A drop that is
   * being applied right now, a host importing from its change listener, is left to finish: its
   * command has run, the import replaces its result, and a cancel would pull the drag out from
   * under diagram-js.
   */
  cancel(): void {
    if (this.dropping) return;
    const gesture = this.dragging.context() as DragContext | null;
    if (!gesture || ARMED_TOOL_PREFIXES.has(gesture.prefix)) return;
    this.dragging.cancel(false);
  }
}
