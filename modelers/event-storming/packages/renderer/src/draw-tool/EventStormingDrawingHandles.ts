import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove,
} from "tiny-svg";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import { install as installClickTrap } from "diagram-js/lib/util/ClickTrap";
import { COLORS } from "../draw/styles.js";
import { isDrawing, type EventStormingShape } from "../model/di-types.js";
import type EventStormingModeling from "../modeling/EventStormingModeling.js";
import { READ_ONLY_CHANGED_EVENT, type EventStormingReadOnly } from "../read-only/index.js";
import type { EventStormingGestures } from "../gesture/index.js";
import { focusCanvasWithoutRing, isUnhandledKey, targetsCanvas } from "../keyboard/index.js";

interface Point {
  x: number;
  y: number;
}

/**
 * Vertex handles for drawings: when exactly one drawing is selected, every point gets a small
 * draggable handle. Dragging shows a live preview; releasing commits the new geometry (points +
 * recomputed bbox) as ONE undoable command; Escape on the canvas ends the drag without one. The
 * point drag is a gesture of its own, outside diagram-js's dragging, so it reports itself to
 * `eventStormingGestures` from its first move, and its release holds the drop while the command
 * applies.
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
  private releaseTrap: (() => void) | undefined;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: EventStormingModeling,
    private readonly readOnly?: Pick<EventStormingReadOnly, "isReadOnly">,
    private readonly gestures?: Pick<EventStormingGestures, "beginGesture" | "holdAction">,
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
      this.dropReleaseTrap();
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
    // The prevented default is the browser's focus move: without it the Escape that ends the drag
    // would go to whatever held the focus before.
    focusCanvasWithoutRing(this.canvas);
    this.endPointDrag();
    this.dropReleaseTrap();
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
      const endDrop = this.gestures?.holdAction();
      try {
        this.endPointDrag();
        this.commit(shape, points);
      } finally {
        endDrop?.();
      }
    };
    // As Escape ends a diagram-js drag: nothing is committed and the drawing stays selected. Only
    // an Escape aimed at the canvas, so a host's field or dialog keeps its own.
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== "Escape" || !isUnhandledKey(ev) || !targetsCanvas(ev, this.canvas)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.endPointDrag();
      this.trapReleaseClick();
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    this.pointDrag = {
      shape,
      unbind: () => {
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        document.removeEventListener("keydown", onKeyDown, true);
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

  /**
   * The button is still down when Escape ends the drag, and its release clicks the canvas, which
   * diagram-js would take for a click on the empty board that clears the selection. The trap goes
   * once that click came, or a moment after a release that clicked nothing, as diagram-js's own.
   */
  private trapReleaseClick(): void {
    this.dropReleaseTrap();
    const onRelease = (): void => {
      this.dropReleaseTrap();
      setTimeout(installClickTrap(this.eventBus), 400);
    };
    document.addEventListener("mouseup", onRelease, true);
    this.releaseTrap = () => document.removeEventListener("mouseup", onRelease, true);
  }

  private dropReleaseTrap(): void {
    this.releaseTrap?.();
    this.releaseTrap = undefined;
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
