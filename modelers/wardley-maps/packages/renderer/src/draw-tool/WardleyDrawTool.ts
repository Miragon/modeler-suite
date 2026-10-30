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
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { COLORS } from "../draw/styles.js";
import type WardleyElementFactory from "../model/WardleyElementFactory.js";
import type EvolutionGrid from "../evolution-grid/EvolutionGrid.js";
import type { WardleyShape } from "../model/di-types.js";
import { focusCanvasWithoutRing, isCanvasKey, isKeyAimedAt } from "../a11y/index.js";

interface Point {
  x: number;
  y: number;
}

/** Clicking this close (px, canvas coords) to the FIRST/LAST point finishes/closes. */
const CLOSE_RADIUS = 12;

const DRAW_TOOL_ENTRY = '.djs-palette .entry[data-action="draw-tool"]';

/**
 * Excalidraw-style polyline tool: activate, click point by point (rubber-band preview).
 * Finishing (like Excalidraw): click the LAST point again, double-click, Enter or Escape
 * commits the open line; clicking the FIRST point closes the shape. Escape with fewer than
 * two points cancels. The result is ONE undoable `drawing` shape that moves as a whole. An import
 * cancels a line in progress without committing it and leaves a tool without points armed.
 */
export default class WardleyDrawTool {
  static $inject = [
    "canvas",
    "eventBus",
    "modeling",
    "selection",
    "wardleyElementFactory",
    "evolutionGrid",
    "injector",
  ];

  private active = false;
  private points: Point[] = [];
  private cursor: Point | null = null;
  private layer: SVGElement | null = null;

  constructor(
    private readonly canvas: Canvas,
    private readonly eventBus: EventBus,
    private readonly modeling: Modeling,
    private readonly selection: Selection,
    private readonly factory: WardleyElementFactory,
    private readonly grid: EvolutionGrid,
    private readonly injector: Injector,
  ) {
    eventBus.on("diagram.destroy", () => this.cancel());
    // The placed points are input the user has not committed yet, and the import replaces the map
    // they were drawn on: the import ends the line as an accepted import ends a running gesture,
    // with no change event from it (L1). A tool that only waits for its first press holds nothing
    // and stays armed, as the armed lasso does.
    eventBus.on(["import.render.start", "diagram.clear"], () => {
      if (this.holdsLine()) this.cancel();
    });
  }

  isActive(): boolean {
    return this.active;
  }

  /** True while the tool holds the points of a line it has not finished yet. */
  holdsLine(): boolean {
    return this.active && this.points.length > 0;
  }

  toggle(): void {
    if (this.active) this.cancel();
    else this.activate();
  }

  /**
   * The OUTER viewer container — getContainer() returns the inner .djs-container, but the
   *  mode class must sit on .wardley-container for the crosshair/empty-state CSS to match.
   */
  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest(".wardley-container") as HTMLElement | null) ?? container;
  }

  activate(): void {
    if (this.active || isReadOnly(this.injector)) return;
    this.active = true;
    this.points = [];
    this.cursor = null;
    const container = this.canvas.getContainer();
    this.outerContainer().classList.add("wardley-draw-mode");
    // Capture phase: while drawing, clicks must NOT select/move elements underneath.
    container.addEventListener("mousedown", this.onMouseDown, true);
    container.addEventListener("dblclick", this.onDblClick, true);
    container.addEventListener("mousemove", this.onMouseMove, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    // Light up the palette entry (same channel the tool manager uses).
    this.eventBus.fire("tool-manager.update", { tool: "draw" });
  }

  /** Finishes the current polyline (>= 2 points) and deactivates the tool. */
  finish(): void {
    const pts = [...this.points];
    this.deactivate();
    if (pts.length < 2) return;
    this.create(this.factory.drawingFromCanvasPoints(pts));
  }

  /** Closes the shape (polygon) using the collected points. */
  private finishClosed(): void {
    const pts = [...this.points];
    this.deactivate();
    if (pts.length < 3) return;
    this.create(this.factory.drawingFromCanvasPoints(pts, { closed: true }));
  }

  /**
   * Created at its exact bounds: a centre position would be rounded by diagram-js and could push
   * points that sit on the plot edge half a pixel outside.
   */
  private create(shape: WardleyShape): void {
    const { x, y, width, height } = shape;
    const bounds = { x, y, width, height };
    const created = this.modeling.createShape(
      shape as unknown as Shape,
      bounds,
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created as unknown as Element);
  }

  cancel(): void {
    this.deactivate();
  }

  private deactivate(): void {
    if (!this.active) return;
    this.active = false;
    const container = this.canvas.getContainer();
    this.outerContainer().classList.remove("wardley-draw-mode");
    container.removeEventListener("mousedown", this.onMouseDown, true);
    container.removeEventListener("dblclick", this.onDblClick, true);
    container.removeEventListener("mousemove", this.onMouseMove, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    this.points = [];
    this.cursor = null;
    this.clearPreview();
    this.eventBus.fire("tool-manager.update", { tool: null });
  }

  /**
   * Clamped into the plot: drawings are saved as normalized [0,1] points, so the preview must not
   * show anything the saved shape cannot hold.
   */
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

  /** Palette/context-pad/menus live INSIDE the container — let their clicks through. */
  private isChromeTarget(e: MouseEvent): boolean {
    const target = e.target as HTMLElement | null;
    return !!target?.closest(".djs-palette, .djs-context-pad, .wardley-color-picker");
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || this.isChromeTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // The prevented default also keeps the browser from focusing the canvas, whose Enter and
    // Escape end the drawing.
    focusCanvasWithoutRing(this.canvas);
    const p = this.toCanvasPoint(e);
    const first = this.points[0];
    if (first && this.points.length >= 3 && distance(p, first) <= CLOSE_RADIUS) {
      this.finishClosed();
      return;
    }
    // Clicking the LAST point again finishes the open line (Excalidraw behavior) — this is
    // the discoverable way out; double-click/Enter/Escape work as well.
    const last = this.points[this.points.length - 1];
    if (last && distance(p, last) <= CLOSE_RADIUS) {
      if (this.points.length >= 2) this.finish();
      return;
    }
    this.points.push(p);
    this.renderPreview();
  };

  private readonly onDblClick = (e: MouseEvent): void => {
    if (this.isChromeTarget(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.finish();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.points.length) return;
    this.cursor = this.toCanvasPoint(e);
    this.renderPreview();
  };

  /**
   * Enter and Escape end the drawing only when aimed at the canvas `<svg>`, or at the palette entry
   * that starts this tool, where a tool started with Enter leaves the focus (guide §5.5). Every
   * other target keeps them, inside the container too: a host's fields, buttons, menus and dialogs,
   * its zoom panel, a focusable element in an overlay next to the canvas, `<body>` and a canvas the
   * host made inert. A capture listener on the document would otherwise take them from all of
   * these.
   */
  private ownsKey(e: KeyboardEvent): boolean {
    if (isCanvasKey(e, this.canvas)) return true;
    const target = e.target;
    if (!(target instanceof globalThis.Element)) return false;
    // Scoped to this canvas's container: another modeler on the page has its own draw entry.
    const entry = target.closest(DRAW_TOOL_ENTRY);
    return !!entry && this.canvas.getContainer().contains(entry) && isKeyAimedAt(e, entry);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.ownsKey(e)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // Excalidraw semantics: Escape COMMITS what is there (undo removes it); it only
      // cancels while no line exists yet.
      if (this.points.length >= 2) this.finish();
      else this.cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    }
  };

  private renderPreview(): void {
    this.clearPreview();
    if (!this.points.length) return;
    const layer = this.canvas.getLayer("wardley-draw-preview", 1000);
    const group = svgCreate("g");
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    svgAppend(
      group,
      svgAttr(svgCreate("polyline"), {
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
        fill: "none",
        stroke: COLORS.ink,
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": "5 4",
      }),
    );
    // First point = "close the shape here", last point = "finish the line here".
    const first = this.points[0]!;
    svgAppend(
      group,
      svgAttr(svgCreate("circle"), {
        cx: first.x,
        cy: first.y,
        r: this.points.length >= 3 ? 5 : 3,
        fill: COLORS.paper,
        stroke: COLORS.ink,
        "stroke-width": 1.5,
      }),
    );
    if (this.points.length >= 2) {
      const last = this.points[this.points.length - 1]!;
      svgAppend(
        group,
        svgAttr(svgCreate("circle"), {
          cx: last.x,
          cy: last.y,
          r: 5,
          fill: COLORS.paper,
          stroke: COLORS.ink,
          "stroke-width": 1.5,
        }),
      );
    }
    svgAppend(layer, group);
    this.layer = group;
  }

  private clearPreview(): void {
    if (this.layer) {
      svgRemove(this.layer);
      this.layer = null;
    }
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
