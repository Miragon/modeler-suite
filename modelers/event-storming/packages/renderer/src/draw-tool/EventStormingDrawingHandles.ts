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
 * `execute` comes before each command and each redo, nested commands included, `revert` before each
 * undo.
 */
const COMMAND_START_EVENTS = ["commandStack.execute", "commandStack.revert"];

/**
 * Behind `eventStormingGestures`, which marks the user action there first, so that a host's import
 * from the interaction listener the end of the drag calls waits for the command; ahead of the
 * command's own listeners.
 */
const BEFORE_THE_COMMAND = 10_000;

/**
 * Vertex handles for drawings: when exactly one drawing is selected, every point gets a small
 * draggable handle. Dragging shows a live preview; releasing commits the new geometry (points +
 * recomputed bbox) as ONE undoable command; Escape on the canvas ends the drag without one, and so
 * do any command before the release and the read-only lock. The point drag is a gesture of its
 * own, outside diagram-js's dragging, so it reports itself to `eventStormingGestures` from its
 * first move, and its release holds the drop while the command applies. While it runs,
 * `EventStormingKeyboard` takes the keys that would nudge or duplicate the drawing or start a
 * second gesture without acting (`isDraggingPoint`).
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
    // The release would commit its points straight through `modeling`, past the lock's rules: the
    // lock ends the drag first, without a commit, as Escape and a command do.
    eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (event.readOnly && this.pointDrag) {
        this.trapReleaseClick();
        this.endPointDrag();
      }
      this.render();
    });
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
    // The release writes back every point as the press found it, which would undo a command in
    // between (an undo or a redo pressed mid-drag, a host's edit) and cost its redo step: the drag
    // ends first, without a commit, as Wardley Maps' point drag does. The release ends the drag
    // before its own command. The button is still down, as after Escape; the trap comes first, so
    // that a host that destroys the board from the interaction listener the end calls drops it
    // with the board.
    eventBus.on(COMMAND_START_EVENTS, BEFORE_THE_COMMAND, () => {
      if (!this.pointDrag) return;
      this.trapReleaseClick();
      this.endPointDrag();
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
    const shape = this.shape;
    if (e.button !== 0 || !shape) return;
    e.preventDefault();
    e.stopPropagation();
    // The prevented default is the browser's focus move: without it the Escape that ends the drag
    // would go to whatever held the focus before.
    focusCanvasWithoutRing(this.canvas);
    // The focus move blurs a host's field, and a host that imports from its listener has replaced
    // the drawing by now: the press has no point left to drag.
    if (this.shape !== shape) return;
    // One that locks the board there has taken the handles away, and the release would commit
    // past the lock's rules: the press drags nothing, and its click keeps the drawing selected.
    if (this.readOnly?.isReadOnly()) {
      this.trapReleaseClick();
      return;
    }
    this.endPointDrag();
    this.dropReleaseTrap();
    const points = this.absolutePoints();
    let endGesture: (() => void) | undefined;
    let ended = false;

    const onMove = (ev: MouseEvent): void => {
      endGesture ??= this.gestures?.beginGesture();
      // A host's listener of the gesture's start may have ended the drag (a lock, an import) before
      // the gesture's end was known here.
      if (ended) {
        endGesture?.();
        return;
      }
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
        ended = true;
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("mouseup", onUp, true);
        document.removeEventListener("keydown", onKeyDown, true);
        endGesture?.();
      },
    };
  }

  /** True from the press on a handle until the release or the end of the drag. */
  isDraggingPoint(): boolean {
    return this.pointDrag !== null;
  }

  endPointDrag(): void {
    const drag = this.pointDrag;
    if (!drag) return;
    this.pointDrag = null;
    drag.unbind();
    this.clearDragPreview();
  }

  /**
   * The button is still down when Escape, a command or the lock ends the drag, and its release
   * clicks the canvas, which diagram-js would take for a click on the empty board that clears the
   * selection. The trap goes once that click came, or a moment after a release that clicked
   * nothing, as diagram-js's own.
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
