import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import AutoScroll from "diagram-js/lib/features/auto-scroll/AutoScroll";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";

/**
 * The drags that hold nothing to carry to the edge: a palette tool that only waits for its next
 * press (lasso, hand, connect), which follows a pointer with no button down, and the pan, which
 * keeps the diagram point under the pointer while `Gestures` keeps every view change it did not
 * make, so a scroll at the edge would move the diagram away from the pointer for good.
 */
const NO_SCROLL_PREFIXES: ReadonlySet<string> = new Set([
  "lasso.selection",
  "hand",
  "hand.move",
  "global-connect",
]);

interface ScrollingDrag {
  readonly prefix: string;
  readonly active?: boolean;
  readonly payload?: { readonly originalEvent?: Event | null };
}

/**
 * diagram-js AutoScroll (Value Chain's `PanAwareAutoScroll`), for the drags that carry something:
 * a move, create, connect, resize or bendpoint drag scrolls the canvas while the pointer rests at
 * its edge. After each scroll the drag moves again at the same pointer, so the preview stays under
 * the pointer instead of scrolling away with the diagram. Over the palette, where a create starts,
 * nothing scrolls.
 */
export default class PanAwareAutoScroll extends AutoScroll {
  static override $inject = ["config.autoScroll", "eventBus", "canvas", "dragging"];

  private following = false;

  constructor(
    config: unknown,
    eventBus: EventBus,
    private readonly scrolledCanvas: Canvas,
    private readonly dragging: Dragging,
  ) {
    super(config, eventBus, scrolledCanvas);
  }

  override startScroll(point: Parameters<AutoScroll["startScroll"]>[0]): void {
    // The move below reports the drag again, with the pointer still at the edge.
    if (this.following) return;
    const drag = this.dragging.context() as ScrollingDrag | null;
    if (!drag?.active || NO_SCROLL_PREFIXES.has(drag.prefix) || overPalette(drag)) {
      this.stopScroll();
      return;
    }
    const before = this.scrolledCanvas.viewbox();
    super.startScroll(point);
    const after = this.scrolledCanvas.viewbox();
    if (after.x !== before.x || after.y !== before.y) this.follow(drag);
  }

  private follow(drag: ScrollingDrag): void {
    const pointer = drag.payload?.originalEvent;
    if (!pointer || this.dragging.context() !== drag) return;
    this.following = true;
    try {
      this.dragging.move(pointer, false);
    } finally {
      this.following = false;
    }
  }
}

function overPalette(drag: ScrollingDrag): boolean {
  const target = drag.payload?.originalEvent?.target;
  return target instanceof Element && target.closest(".djs-palette") !== null;
}
