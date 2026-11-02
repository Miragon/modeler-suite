import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContentBounds from "./ContentBounds.js";

const FIT_PADDING = 20;
/** diagram-js reads its zoom back rounded to three decimals: a smaller fit would read back as 0. */
const SMALLEST_FIT_ZOOM = 0.001;

export interface ImportConfig {
  /** Fit the content after every import (default true); false leaves the view to the host. */
  fitOnImport?: boolean | undefined;
}

/**
 * The frame of an import: the render window the shell's viewport watches, and the fit. Bypasses
 * the command stack: an import is no undoable edit. The shapes of the view come from the
 * reconciler's diff sync (SPEC 1.5), which `render` runs inside the window.
 */
export default class Importer {
  static $inject = ["canvas", "eventBus", "contentBounds", "config.import"];

  constructor(
    private readonly canvas: Canvas,
    private readonly eventBus: EventBus,
    private readonly bounds: ContentBounds,
    private readonly config: ImportConfig | undefined,
  ) {}

  /** `render` draws the view between `import.render.start` and `import.render.done`. */
  import(render: () => void): void {
    // Opens the shell viewport's import window: viewbox changes until `import.done` are no user moves.
    this.eventBus.fire("import.render.start", {});
    render();
    if (this.config?.fitOnImport !== false) this.fitToContent();
    this.eventBus.fire("import.render.done", {});
  }

  /** Law L5's fitted view: the content centred, never above 100%; empty: the origin at 100%. */
  fitToContent(): void {
    const { width, height } = this.canvas.getSize();
    if (!(width > 0 && height > 0)) return;
    const box = this.bounds.contentBounds(FIT_PADDING);
    if (!box) {
      this.canvas.viewbox({ x: 0, y: 0, width, height });
      return;
    }
    const scale = Math.max(Math.min(width / box.width, height / box.height, 1), SMALLEST_FIT_ZOOM);
    this.canvas.viewbox({
      x: box.x + box.width / 2 - width / 2 / scale,
      y: box.y + box.height / 2 - height / 2 / scale,
      width: width / scale,
      height: height / scale,
    });
  }
}
