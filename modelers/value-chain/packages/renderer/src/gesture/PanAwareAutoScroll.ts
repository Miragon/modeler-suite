import AutoScroll from "diagram-js/lib/features/auto-scroll/AutoScroll";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import { PAN_PREFIX } from "./VcGestures.js";

/**
 * diagram-js AutoScroll, except under a pan: a pan keeps the diagram point it holds under the
 * pointer, and `VcGestures` keeps every view change the pan did not make, so a scroll at the
 * canvas edge would move the diagram away from the pointer for good.
 */
export default class PanAwareAutoScroll extends AutoScroll {
  static override $inject = ["config.autoScroll", "eventBus", "canvas", "dragging"];

  constructor(
    config: unknown,
    eventBus: EventBus,
    canvas: Canvas,
    private readonly dragging: Dragging,
  ) {
    super(config, eventBus, canvas);
  }

  override startScroll(point: Parameters<AutoScroll["startScroll"]>[0]): void {
    if ((this.dragging.context() as { prefix?: string } | null)?.prefix === PAN_PREFIX) {
      this.stopScroll();
      return;
    }
    super.startScroll(point);
  }
}
