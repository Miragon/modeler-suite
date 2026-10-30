import type { Injector } from "didi";
import { isReadOnly } from "../read-only/index.js";
import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove,
} from "tiny-svg";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import { COLORS } from "../draw/styles.js";
import { isWardleyShape, type WardleyShape } from "../model/di-types.js";
import type EvolutionGrid from "../evolution-grid/EvolutionGrid.js";
import type WardleyModeling from "../modeling/WardleyModeling.js";
import { focusCanvasWithoutRing, isCanvasKey } from "../a11y/index.js";
import { COMMAND_START_EVENTS, PUT_BACK_PRIORITY } from "../live-preview/index.js";
import type { WardleyInteraction } from "../interaction/index.js";

interface Point {
  x: number;
  y: number;
}

interface PointDrag {
  shape: WardleyShape;
  unbind: () => void;
}

/**
 * Vertex handles for drawings: when exactly one drawing is selected, every point gets a small
 * draggable handle. Dragging shows a live preview; releasing commits the new geometry (points +
 * recomputed bbox) as ONE undoable command, and Escape ends the drag without one.
 */
export default class WardleyDrawingHandles {
  static $inject = [
    "eventBus",
    "canvas",
    "wardleyModeling",
    "evolutionGrid",
    "injector",
    "wardleyInteraction",
  ];

  private shape: WardleyShape | null = null;
  private group: SVGElement | null = null;
  private dragPreview: SVGElement | null = null;
  private pointDrag: PointDrag | null = null;
  private unwatchRelease: (() => void) | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: WardleyModeling,
    private readonly grid: EvolutionGrid,
    private readonly injector: Injector,
    private readonly interaction: WardleyInteraction,
  ) {
    eventBus.on("selection.changed", (event: { newSelection?: unknown[] }) => {
      const sel = event.newSelection ?? [];
      const only = sel.length === 1 ? sel[0] : null;
      this.attach(
        isWardleyShape(only) && only.wardleyType === "drawing" ? (only as WardleyShape) : null,
      );
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
    // The release writes back every point as it was when the handle was pressed, which would undo
    // a command in between (an undo pressed mid-drag, or a host's edit) and cost its redo step: the
    // drag ends first, without a commit. The release ends the drag before its own command. The
    // keys that would nudge or duplicate the drawing do nothing while it runs (`WardleyKeyboard`).
    // The button is still down, as after Escape; the watch comes first, so that a host that
    // destroys the map from the interaction listener the end calls drops it with the map (#346).
    eventBus.on(COMMAND_START_EVENTS, PUT_BACK_PRIORITY, () => {
      if (!this.pointDrag) return;
      this.swallowClickOfRelease();
      this.endPointDrag();
    });
    eventBus.on(["diagram.clear", "diagram.destroy"], () => {
      this.endPointDrag();
      this.attach(null);
    });
    eventBus.on("diagram.destroy", () => this.stopWatchingRelease());
  }

  private attach(shape: WardleyShape | null): void {
    this.shape = shape;
    this.render();
  }

  private absolutePoints(): Point[] {
    const s = this.shape!;
    return (s.drawingPoints ?? []).map((p) => ({ x: s.x + p.x, y: s.y + p.y }));
  }

  private render(): void {
    this.clear();
    if (!this.shape) return;
    const layer = this.canvas.getLayer("wardley-drawing-handles", 1100);
    const group = svgCreate("g");
    this.absolutePoints().forEach((p, index) => {
      const handle = svgAttr(svgCreate("circle"), {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill: COLORS.paper,
        stroke: COLORS.ink,
        "stroke-width": 1.5,
        class: "wardley-drawing-handle",
      });
      handle.addEventListener("mousedown", (e) => this.startDrag(e as MouseEvent, index));
      svgAppend(group, handle);
    });
    svgAppend(layer, group);
    this.group = group;
  }

  private startDrag(e: MouseEvent, index: number): void {
    if (e.button !== 0 || !this.shape || isReadOnly(this.injector)) return;
    e.preventDefault();
    e.stopPropagation();
    // The prevented default keeps the browser from focusing the canvas, whose keys act only while
    // it has the focus.
    focusCanvasWithoutRing(this.canvas);
    this.endPointDrag();
    const shape = this.shape;
    const points = this.absolutePoints();
    const drag: PointDrag = { shape, unbind: () => undefined };

    const onMove = (ev: MouseEvent): void => {
      this.interaction.begin(drag);
      points[index] = this.toCanvasPoint(ev);
      this.renderDragPreview(points, !!shape.closed);
    };
    const onUp = (ev: MouseEvent): void => {
      points[index] = this.toCanvasPoint(ev);
      this.interaction.drop(drag, () => {
        this.stopPointDrag();
        this.commit(shape, points);
      });
    };
    // Escape ends the drag as it ends a diagram-js drag, and the drawing stays selected. Only an
    // Escape aimed at the canvas, which the press focused: a host's field, menu or dialog keeps its
    // own.
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== "Escape" || !isCanvasKey(ev, this.canvas)) return;
      ev.preventDefault();
      ev.stopPropagation();
      // The watch comes first: a host that destroys the modeler from the interaction listener the
      // end calls has it removed with the map, not left on the document without a canvas (#346).
      this.swallowClickOfRelease();
      this.endPointDrag();
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("keydown", onKey, true);
    drag.unbind = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("keydown", onKey, true);
    };
    this.pointDrag = drag;
  }

  /** True from the press on a handle until the drag's release or its end. */
  isDraggingPoint(): boolean {
    return this.pointDrag !== null;
  }

  /**
   * Ends a running point drag without committing it. The point drag is this renderer's own gesture,
   * outside diagram-js dragging, so the import's drag cancel does not reach it: the removal of its
   * drawing ends it, Escape does, and so does any command before the release.
   */
  private endPointDrag(): void {
    const drag = this.stopPointDrag();
    if (drag) this.interaction.end(drag);
  }

  /**
   * After Escape or a command the button is still down on a handle that stays drawn, so the
   * browser sends the release's click to the canvas, the element under both the press and the
   * release, and a click there clears the selection. A commit redraws the handles, and then no
   * click comes.
   */
  private swallowClickOfRelease(): void {
    this.stopWatchingRelease();
    const container = this.canvas.getContainer();
    const swallow = (event: MouseEvent): void => event.stopPropagation();
    const onRelease = (): void => {
      this.stopWatchingRelease();
      container.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => container.removeEventListener("click", swallow, true), 0);
    };
    // A press before a release: the page did not see the release, and the press's click is a real
    // one.
    const onPress = (): void => this.stopWatchingRelease();
    document.addEventListener("mouseup", onRelease, true);
    document.addEventListener("mousedown", onPress, true);
    this.unwatchRelease = () => {
      document.removeEventListener("mouseup", onRelease, true);
      document.removeEventListener("mousedown", onPress, true);
    };
  }

  private stopWatchingRelease(): void {
    this.unwatchRelease?.();
    this.unwatchRelease = null;
  }

  private stopPointDrag(): PointDrag | null {
    const drag = this.pointDrag;
    if (!drag) return null;
    this.pointDrag = null;
    drag.unbind();
    this.clearDragPreview();
    return drag;
  }

  /** New bbox + relative points + normalized anchor — ONE undoable updateProperties command. */
  private commit(shape: WardleyShape, points: Point[]): void {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const firstNorm = this.grid.fromCanvas(points[0]!);
    this.modeling.updateProperties(shape, {
      x,
      y,
      width: Math.max(Math.max(...xs) - x, 4),
      height: Math.max(Math.max(...ys) - y, 4),
      drawingPoints: points.map((p) => ({ x: p.x - x, y: p.y - y })),
      evolution: firstNorm.evolution,
      visibility: firstNorm.visibility,
    });
    this.render();
  }

  private renderDragPreview(points: Point[], closed: boolean): void {
    this.clearDragPreview();
    const layer = this.canvas.getLayer("wardley-drawing-handles", 1100);
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

  /** Clamped into the plot, like the draw tool: what the preview shows is what gets saved. */
  private toCanvasPoint(e: MouseEvent): Point {
    const rect = this.canvas.getContainer().getBoundingClientRect();
    const vb = this.canvas.viewbox();
    const scale = this.canvas.zoom();
    return this.grid.toCanvas(
      this.grid.fromCanvas({
        x: (e.clientX - rect.left) / scale + vb.x,
        y: (e.clientY - rect.top) / scale + vb.y,
      }),
    );
  }
}
