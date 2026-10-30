import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { isReadOnly } from "../read-only/index.js";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EvolutionGrid from "../evolution-grid/EvolutionGrid.js";
import type WardleyModeling from "../modeling/WardleyModeling.js";
import type { WardleyShape } from "../model/di-types.js";
import { MIN_EVOLVE_DELTA } from "./constants.js";
import { focusCanvasWithoutRing, isCanvasKey } from "../a11y/index.js";
import type { WardleyInteraction } from "../interaction/index.js";
import {
  COMMAND_START_EVENTS,
  PUT_BACK_PRIORITY,
  type LivePreview,
} from "../live-preview/index.js";

const PREFIX = "wardley.evolve";
/** CSS class of the red target circle (set by the renderer) — direct drag handle. */
const HANDLE_CLASS = "wardley-evolve-handle";

interface EvolveContext {
  shape: WardleyShape;
  target?: number;
}

/** A drag of the evolve target's handle, ended without a commit by `cancel`. */
interface HandleDrag {
  shape: WardleyShape;
  cancel: () => void;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Sets a component's evolve target by dragging along the evolution axis (instead of a text field).
 * During the drag a live preview (direct mutation + re-render) that the export holds back
 * (`LivePreview`); on release exactly ONE undoable commit via the commandStack (P4). Escape cancels
 * both the drag of the target's handle and the placement from the context pad, and restores the
 * original state.
 */
export default class WardleyEvolveDragging {
  static $inject = [
    "eventBus",
    "dragging",
    "evolutionGrid",
    "wardleyModeling",
    "canvas",
    "elementRegistry",
    "injector",
    "wardleyInteraction",
    "wardleyLivePreview",
  ];

  private handleDrag: HandleDrag | null = null;

  constructor(
    eventBus: EventBus,
    private readonly dragging: Dragging,
    grid: EvolutionGrid,
    modeling: WardleyModeling,
    canvas: Canvas,
    elementRegistry: ElementRegistry,
    private readonly injector: Injector,
    interaction: WardleyInteraction,
    livePreview: LivePreview,
  ) {
    const preview = (shape: WardleyShape, target: number) => {
      const { movement } = livePreview.beginShape(shape);
      shape.movement = { ...movement, targetEvolution: target };
      eventBus.fire("element.changed", { element: shape });
    };

    // Evolution only moves forward: the preview stops at the component instead of flipping
    // backwards, and such a stub stays below the commit threshold.
    const forwardTarget = (shape: WardleyShape, evolution: number): number =>
      Math.max(clamp01(evolution), Math.min(1, shape.evolution + MIN_EVOLVE_DELTA));

    // Screen pixels -> normalized evolution (via the single source of math, P7).
    const evolutionAtClientX = (clientX: number, cy: number): number => {
      const rect = canvas.getContainer().getBoundingClientRect();
      const vb = canvas.viewbox();
      const canvasX = vb.x + (clientX - rect.left) * (vb.width / rect.width);
      return clamp01(grid.fromCanvas({ x: canvasX, y: cy }).evolution);
    };

    // The draw tool owns every press while it is active (its listener registers after this one).
    const isDrawing = (): boolean => {
      const container = canvas.getContainer();
      const outer = container.closest(".wardley-container") ?? container;
      return outer.classList.contains("wardley-draw-mode");
    };

    // Direct handle: mousedown on the red target circle moves the evolve target by dragging.
    // Capture phase + stopPropagation so that diagram-js does NOT move the node instead.
    // Own document listeners (instead of dragging.init) — reliable, testable mousedown dragging.
    // Delegated on the container -> survives the re-rendering of the circle during the preview.
    canvas.getContainer().addEventListener(
      "mousedown",
      (event: MouseEvent) => {
        const dom = event.target as Element | null;
        if (!dom?.closest(`.${HANDLE_CLASS}`) || isDrawing() || isReadOnly(injector)) return;
        const id = dom.closest("[data-element-id]")?.getAttribute("data-element-id");
        const shape = id ? (elementRegistry.get(id) as WardleyShape | undefined) : undefined;
        if (!shape || shape.wardleyType !== "component") return;
        event.stopPropagation();
        event.preventDefault();
        focusCanvasWithoutRing(canvas);

        this.handleDrag?.cancel();

        const cy = shape.y + shape.height / 2;
        let target: number | undefined;
        const stop = () => {
          this.handleDrag = null;
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.removeEventListener("keydown", onKey, true);
          livePreview.putBackShape(shape);
        };
        const drag: HandleDrag = {
          shape,
          cancel: () => {
            stop();
            interaction.end(drag);
          },
        };
        const onMove = (e: MouseEvent) => {
          interaction.begin(drag);
          target = forwardTarget(shape, evolutionAtClientX(e.clientX, cy));
          preview(shape, target);
        };
        // The preview is reset first, then ONE undoable commit (P4).
        const onUp = () =>
          interaction.drop(drag, () => {
            stop();
            if (target !== undefined && target > shape.evolution + MIN_EVOLVE_DELTA) {
              modeling.evolveComponent(shape, target);
            }
          });
        // Escape puts the target back as it ends a diagram-js drag. Only an Escape aimed at the
        // canvas, which the press focused: a host's field, menu or dialog keeps its own.
        const onKey = (e: KeyboardEvent) => {
          if (e.key !== "Escape" || !isCanvasKey(e, canvas)) return;
          e.preventDefault();
          e.stopPropagation();
          drag.cancel();
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.addEventListener("keydown", onKey, true);
        this.handleDrag = drag;
      },
      true,
    );
    // Deleting the component mid-drag or an import that replaces it ends the drag, or the release
    // would evolve a removed shape.
    eventBus.on("shape.remove", ({ element }: { element: unknown }) => {
      const drag = this.handleDrag;
      if (drag && drag.shape === element) drag.cancel();
    });
    eventBus.on("diagram.destroy", () => this.handleDrag?.cancel());
    // The release puts back the evolve target the drag started from, which would undo a command in
    // between (an undo pressed mid-drag) and leave the history out of step with the document: a
    // drag that previews ends first, without a commit. The release puts back before its command.
    eventBus.on(COMMAND_START_EVENTS, PUT_BACK_PRIORITY, () => {
      const handleDrag = this.handleDrag;
      if (handleDrag && livePreview.previewsShape(handleDrag.shape)) handleDrag.cancel();
      const placement = this.runningPlacement();
      if (placement && livePreview.previewsShape(placement.shape)) dragging.cancel(true);
    });

    eventBus.on(`${PREFIX}.move`, (event: { context: EvolveContext; x: number }) => {
      const { shape } = event.context;
      const cy = shape.y + shape.height / 2;
      const target = forwardTarget(shape, grid.fromCanvas({ x: event.x, y: cy }).evolution);
      event.context.target = target;
      preview(shape, target);
    });

    eventBus.on(`${PREFIX}.end`, (event: { context: EvolveContext }) => {
      const { shape, target } = event.context;
      // Reset the preview, then execute as ONE command (clean undo).
      livePreview.putBackShape(shape);
      if (target !== undefined && target > shape.evolution + MIN_EVOLVE_DELTA) {
        modeling.evolveComponent(shape, target);
      }
    });

    eventBus.on(`${PREFIX}.cleanup`, (event: { context?: EvolveContext }) => {
      if (event.context) livePreview.putBackShape(event.context.shape);
    });
  }

  /** The evolve drag the context pad started, while it runs. */
  private runningPlacement(): EvolveContext | undefined {
    const drag = this.dragging.context() as {
      prefix?: string;
      data?: { context?: EvolveContext };
    } | null;
    return drag?.prefix === PREFIX ? drag.data?.context : undefined;
  }

  /**
   * Starts the evolve drag for `shape` (from the context pad): set the target by dragging along
   *  the axis, or move it afterwards, with live preview; commit on release.
   */
  start(event: Event, shape: WardleyShape): void {
    if (isReadOnly(this.injector)) return;
    const context: EvolveContext = { shape };
    this.dragging.init(event as MouseEvent, PREFIX, { cursor: "ew-resize", data: { context } });
  }
}
