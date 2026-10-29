import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove,
} from "tiny-svg";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import { COLORS } from "../draw/styles.js";
import { isDrawing, type EventStormingShape } from "../model/di-types.js";
import type EventStormingModeling from "../modeling/EventStormingModeling.js";
import { READ_ONLY_CHANGED_EVENT, type EventStormingReadOnly } from "../read-only/index.js";
import type { EventStormingGestures } from "../gesture/index.js";

interface Point {
  x: number;
  y: number;
}

/**
 * Vertex handles for drawings: when exactly one drawing is selected, every point gets a small
 * draggable handle. Dragging shows a live preview; releasing commits the new geometry (points +
 * recomputed bbox) as ONE undoable command. The point drag is a gesture of its own, outside
 * diagram-js's dragging, so it reports itself to `eventStormingGestures` from its first move, and
 * its release holds the drop while the command applies.
 */
export default class EventStormingDrawingHandles {
  static $inject = [
    "eventBus",
    "canvas",
    "eventStormingModeling",
    "eventStormingReadOnly",
    "eventStormingGestures",
  ];

  private shape: EventStormingShape | null = null;
  private group: SVGElement | null = null;
  private dragPreview: SVGElement | null = null;
  private pointDrag: { shape: EventStormingShape; unbind: () => void } | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: EventStormingModeling,
    private readonly readOnly?: Pick<EventStormingReadOnly, "isReadOnly">,
    private readonly gestures?: Pick<EventStormingGestures, "beginGesture" | "holdDrop">,
  ) {
    eventBus.on(READ_ONLY_CHANGED_EVENT, () => this.render());
    eventBus.on("selection.changed", (event: { newSelection?: unknown[] }) => {
      const sel = event.newSelection ?? [];
      const only = sel.length === 1 ? sel[0] : null;
      this.attach(isDrawing(only) ? (only as EventStormingShape) : null);
    });
    // Keep the handles glued to the shape while it is moved/changed.
    eventBus.on("element.changed", (event: { element?: unknown }) => {
      if (this.shape && event.element === this.shape) this.render();
    });
    // An import, a delete or an undo removes the drawing mid-drag: the release must not commit
    // onto the removed shape.
    eventBus.on("shape.remove", (event: { element?: unknown }) => {
      if (this.pointDrag?.shape === event.element) this.endPointDrag();
    });
    eventBus.on(["diagram.clear", "diagram.destroy"], () => {
      this.endPointDrag();
      this.attach(null);
    });
  }

  private attach(shape: EventStormingShape | null): void {
    this.shape = shape;
    this.render();
  }

  private absolutePoints(): Point[] {
    const s = this.shape!;
    return (s.drawingPoints ?? []).map((p) => ({ x: s.x + p.x, y: s.y + p.y }));
  }

  private render(): void {
    this.clear();
    if (!this.shape || this.readOnly?.isReadOnly()) return;
    const layer = this.canvas.getLayer("event-storming-drawing-handles", 1100);
    const group = svgCreate("g");
    this.absolutePoints().forEach((p, index) => {
      const handle = svgAttr(svgCreate("circle"), {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill: COLORS.paper,
        stroke: COLORS.ink,
        "stroke-width": 1.5,
        class: "event-storming-drawing-handle",
      });
      handle.addEventListener("mousedown", (e) => this.startDrag(e as MouseEvent, index));
      svgAppend(group, handle);
    });
    svgAppend(layer, group);
    this.group = group;
  }

  private startDrag(e: MouseEvent, index: number): void {
    if (e.button !== 0 || !this.shape) return;
    e.preventDefault();
    e.stopPropagation();
    this.endPointDrag();
    const shape = this.shape;
    const points = this.absolutePoints();
    let endGesture: (() => void) | undefined;

    const onMove = (ev: MouseEvent): void => {
      endGesture ??= this.gestures?.beginGesture();
      points[index] = this.toCanvasPoint(ev);
      this.renderDragPreview(points, !!shape.closed);
    };
    const onUp = (ev: MouseEvent): void => {
      points[index] = this.toCanvasPoint(ev);
      const endDrop = this.gestures?.holdDrop();
      try {
        this.endPointDrag();
        this.commit(shape, points);
      } finally {
        endDrop?.();
      }
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    this.pointDrag = {
      shape,
      unbind: () => {
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        endGesture?.();
      },
    };
  }

  endPointDrag(): void {
    const drag = this.pointDrag;
    if (!drag) return;
    this.pointDrag = null;
    drag.unbind();
    this.clearDragPreview();
  }

  /** New bbox + relative points — ONE undoable updateProperties command. */
  private commit(shape: EventStormingShape, points: Point[]): void {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    this.modeling.updateProperties(shape, {
      x,
      y,
      width: Math.max(Math.max(...xs) - x, 4),
      height: Math.max(Math.max(...ys) - y, 4),
      drawingPoints: points.map((p) => ({ x: p.x - x, y: p.y - y })),
    });
    this.render();
  }

  private renderDragPreview(points: Point[], closed: boolean): void {
    this.clearDragPreview();
    const layer = this.canvas.getLayer("event-storming-drawing-handles", 1100);
    const preview = svgAttr(svgCreate(closed ? "polygon" : "polyline"), {
      points: points.map((p) => `${p.x},${p.y}`).join(" "),
      fill: "none",
      stroke: COLORS.ink,
      "stroke-width": 1.5,
      "stroke-dasharray": "5 4",
      "pointer-events": "none",
    });
    svgAppend(layer, preview);
    this.dragPreview = preview;
  }

  private clearDragPreview(): void {
    if (this.dragPreview) {
      svgRemove(this.dragPreview);
      this.dragPreview = null;
    }
  }

  private clear(): void {
    this.clearDragPreview();
    if (this.group) {
      svgRemove(this.group);
      this.group = null;
    }
  }

  private toCanvasPoint(e: MouseEvent): Point {
    const rect = this.canvas.getContainer().getBoundingClientRect();
    const vb = this.canvas.viewbox();
    const scale = this.canvas.zoom();
    return {
      x: (e.clientX - rect.left) / scale + vb.x,
      y: (e.clientY - rect.top) / scale + vb.y,
    };
  }
}
