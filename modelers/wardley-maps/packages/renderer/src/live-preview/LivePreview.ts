import type EventBus from "diagram-js/lib/core/EventBus";
import type { MapConfig, WardleyMap } from "@miragon/wardley-schema-model";
import type WardleyExporter from "../io/WardleyExporter.js";
import type { CommittedShapeFields } from "../io/WardleyExporter.js";
import type { WardleyShape } from "../model/di-types.js";

/** The config fields a live preview changes: the plot size, the X-axis stage labels. */
export type PreviewedField = "size" | "evolutionLabels";

/**
 * Fired before a command changes the document: `preExecute` for a command, `execute` for a redo
 * (which skips `preExecute`), `revert` for an undo.
 */
export const COMMAND_START_EVENTS = [
  "commandStack.preExecute",
  "commandStack.execute",
  "commandStack.revert",
];

/** Ahead of the other listeners of these events; the command's handler runs after all of them. */
export const PUT_BACK_PRIORITY = 10_000;

/**
 * The document as it was committed while a live preview (a plot-resize drag, the size or the axis
 * labels being typed into a popover, the drag of an evolve target or a label) shows something else
 * on the canvas. A host autosaves the export at any moment, also mid-drag, and must store the
 * document, never the preview.
 */
export default class LivePreview {
  static $inject = ["eventBus", "wardleyExporter"];

  private committed: WardleyMap | undefined;
  private readonly previewed = new Set<PreviewedField>();
  private readonly committedShapes = new Map<WardleyShape, CommittedShapeFields>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly exporter: WardleyExporter,
  ) {
    eventBus.on(["import.render.start", "diagram.clear"], () => this.endAll());
    // A command can land under an axis-label preview (a title a host sets) and changes the
    // document there; the preview itself only ever changes its own fields. A size preview is put
    // back before any command instead (MapResizeHandles, WardleyBaseViewer), and so is a shape's.
    eventBus.on("commandStack.changed", () => {
      if (this.committed) this.committed = this.withCommittedFields(this.exportCommitted());
    });
  }

  /** Before a preview changes `field` on the canvas: keeps the document as it is now. */
  begin(field: PreviewedField): void {
    this.committed ??= this.exportCommitted();
    this.previewed.add(field);
  }

  /**
   * The canvas shows the committed `field` again (its preview was put back or is being
   * committed). The preview of the other field may still be open and keeps its committed value.
   */
  end(field: PreviewedField): void {
    this.previewed.delete(field);
    if (!this.previewed.size) this.committed = undefined;
  }

  /**
   * Before a drag previews an evolve target or a label offset on `shape`: keeps both as the
   * document has them, from the first preview until `putBackShape`. Returns the kept ones, which
   * the preview builds on.
   */
  beginShape(shape: WardleyShape): CommittedShapeFields {
    let committed = this.committedShapes.get(shape);
    if (!committed) {
      committed = { movement: shape.movement, labelOffset: shape.labelOffset };
      this.committedShapes.set(shape, committed);
    }
    return committed;
  }

  /** Whether a drag previews on `shape`. */
  previewsShape(shape: WardleyShape): boolean {
    return this.committedShapes.has(shape);
  }

  /** Shows `shape` as the document has it again, if a drag previews on it. */
  putBackShape(shape: WardleyShape): void {
    const committed = this.committedShapes.get(shape);
    if (!committed) return;
    this.committedShapes.delete(shape);
    if (committed.movement) shape.movement = committed.movement;
    else delete shape.movement;
    if (committed.labelOffset) shape.labelOffset = committed.labelOffset;
    else delete shape.labelOffset;
    this.eventBus.fire("element.changed", { element: shape });
  }

  /** The committed document while a preview is open, `undefined` while none is. */
  committedMap(): WardleyMap | undefined {
    if (this.committed) return this.committed;
    return this.committedShapes.size ? this.exportCommitted() : undefined;
  }

  private exportCommitted(): WardleyMap {
    return this.exporter.export(this.committedShapes);
  }

  private endAll(): void {
    this.previewed.clear();
    this.committed = undefined;
    this.committedShapes.clear();
  }

  private withCommittedFields(live: WardleyMap): WardleyMap {
    const config: Record<string, unknown> = { ...live.config };
    const committedConfig = this.committed?.config as Partial<MapConfig> | undefined;
    for (const field of this.previewed) {
      if (committedConfig?.[field] === undefined) delete config[field];
      else config[field] = committedConfig[field];
    }
    return { ...live, config: config as unknown as MapConfig };
  }
}
