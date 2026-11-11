import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Root } from "diagram-js/lib/model/Types";
import { stickiesOf, type CanvasDocument } from "@miragon/business-model-canvas-schema-model";
import type CanvasFrame from "../canvas-frame/CanvasFrame.js";
import type StickyFactory from "../model/StickyFactory.js";
import { isStickyShape } from "../model/di-types.js";
import type ContentBounds from "./ContentBounds.js";
import { layoutOf } from "./layoutOf.js";
import { ROOT_ID, type RootBusinessObject } from "./types.js";

const FIT_PADDING = 20;
/** diagram-js reads its zoom back rounded to three decimals: a smaller fit would read back as 0. */
const SMALLEST_FIT_ZOOM = 0.001;

export interface ImportConfig {
  /** Fit the content after every import (default true); false leaves the view to the host. */
  fitOnImport?: boolean | undefined;
}

type DiagramRoot = Root & { businessObject?: RootBusinessObject };

/** Renders a validated document. Bypasses the command stack: an import is no undoable edit. */
export default class Importer {
  static $inject = [
    "canvas",
    "elementFactory",
    "stickyFactory",
    "elementRegistry",
    "eventBus",
    "contentBounds",
    "canvasFrame",
    "config.import",
  ];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly stickyFactory: StickyFactory,
    private readonly elementRegistry: ElementRegistry,
    private readonly eventBus: EventBus,
    private readonly bounds: ContentBounds,
    private readonly frame: CanvasFrame,
    private readonly config: ImportConfig | undefined,
  ) {}

  import(document: CanvasDocument): void {
    // Opens the shell viewport's import window: viewbox changes until `import.done` are no user moves.
    this.eventBus.fire("import.render.start", { document });
    this.clear();
    const root = this.diagramRoot();
    root.businessObject = { document };
    const layout = layoutOf(document);
    for (const block of document.blocks) {
      if (!block.blockId) continue;
      for (const sticky of stickiesOf(block)) {
        const rect = layout.stickies.get(sticky.id)!;
        this.canvas.addShape(this.stickyFactory.fromDocument(sticky, block.blockId, rect), root);
      }
    }
    this.frame.render();
    if (this.config?.fitOnImport !== false) this.fitToContent();
    this.eventBus.fire("import.render.done", { document });
  }

  clear(): void {
    for (const element of [...this.elementRegistry.getAll()]) {
      if (isStickyShape(element)) this.canvas.removeShape(element);
    }
  }

  /** One root, created on the first import; an implicit root diagram-js made earlier goes. */
  private diagramRoot(): DiagramRoot {
    let root = this.elementRegistry.get(ROOT_ID) as DiagramRoot | undefined;
    if (!root) {
      root = this.elementFactory.createRoot({ id: ROOT_ID }) as DiagramRoot;
      this.canvas.setRootElement(root);
    }
    for (const other of this.canvas.getRootElements()) {
      if (other !== root) this.canvas.removeRootElement(other);
    }
    return root;
  }

  /** Law L5's fitted view: the content centred, never above 100%. */
  private fitToContent(): void {
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
