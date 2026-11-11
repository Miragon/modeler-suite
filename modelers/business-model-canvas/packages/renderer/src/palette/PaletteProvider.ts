import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Create from "diagram-js/lib/features/create/Create";
import type HandTool from "diagram-js/lib/features/hand-tool/HandTool";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type BasePaletteProvider from "diagram-js/lib/features/palette/PaletteProvider";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import type { DiagramPoint, FreeArea, FreeAreaInsets } from "@miragon/modeler-api";
import type { Injector } from "didi";
import { ICONS, paletteEntryHtml } from "../draw/icons.js";
import type { StickyShape } from "../model/di-types.js";
import type StickyFactory from "../model/StickyFactory.js";
import type LabelEditing from "../label-editing/LabelEditing.js";

export interface PaletteConfig {
  /**
   * The canvas area the host's chrome leaves free (the contract's `freeArea` option): Enter or
   * Space on a creating entry places the element in its centre (guide §5.5). Without it, the
   * centre of the visible canvas.
   */
  freeArea?: FreeArea | undefined;
}

interface PaletteEntry {
  group: string;
  html: string;
  title: string;
  shortcut?: string;
  action: Record<string, (event: Event) => void>;
}

/** After diagram-js's Create ran the create command on `create.end`. */
const AFTER_CREATE = 250;

interface EditLock {
  isReadOnly(): boolean;
}

/**
 * Tools first (Lasso, Hand: the two a read-only canvas keeps), then the creating entries. Tool
 * keys end in `-tool` in the group `tools`, so the shell marks the armed tool; titles and
 * shortcuts are separate fields, so the chrome tooltip shows the key as a chip.
 */
export default class PaletteProvider {
  static $inject = [
    "palette",
    "create",
    "stickyFactory",
    "handTool",
    "lassoTool",
    "canvas",
    "modeling",
    "selection",
    "injector",
    "config.palette",
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: StickyFactory,
    private readonly handTool: HandTool,
    private readonly lassoTool: LassoTool,
    private readonly canvas: Canvas,
    private readonly modeling: Modeling,
    private readonly selection: Selection,
    private readonly injector: Injector,
    private readonly config: PaletteConfig | undefined,
  ) {
    palette.registerProvider(this as unknown as BasePaletteProvider);
  }

  getPaletteEntries(): Record<string, PaletteEntry> {
    const createSticky = (event: Event) => {
      if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return;
      const shape = this.factory.createNew();
      if (isKeyboardClick(event)) this.placeInFreeArea(shape);
      else this.createWithPointer(event as MouseEvent, shape);
    };
    return {
      "lasso-tool": {
        group: "tools",
        title: "Lasso",
        shortcut: "L",
        html: paletteEntryHtml(ICONS.lassoTool),
        action: { click: (event) => this.lassoTool.activateSelection(event as MouseEvent, false) },
      },
      "hand-tool": {
        group: "tools",
        title: "Hand",
        shortcut: "H",
        html: paletteEntryHtml(ICONS.handTool),
        action: { click: (event) => this.handTool.activateHand(event as MouseEvent, false, false) },
      },
      "create.sticky": {
        group: "elements",
        title: "Sticky",
        html: paletteEntryHtml(ICONS.createSticky, true),
        action: { click: createSticky, dragstart: createSticky },
      },
    };
  }

  /** The pointer places the sticky; once it is down, its label editor opens, as after "+". */
  private createWithPointer(event: MouseEvent, shape: StickyShape): void {
    const eventBus = this.injector.get<EventBus>("eventBus");
    const onCreated = (created: unknown) => {
      const { canExecute } = (created as { context: { canExecute?: unknown } }).context;
      if (!canExecute) return;
      this.selection.select(shape as Shape);
      this.injector.get<LabelEditing>("labelEditing", false)?.activate(shape);
    };
    eventBus.once("create.end", AFTER_CREATE, onCreated);
    eventBus.once("create.cleanup", () => eventBus.off("create.end", onCreated));
    this.create.start(event, shape as Shape);
  }

  /**
   * Enter or Space on a creating entry (the shell's synthetic click, detail 0): diagram-js's create
   * tool follows the pointer and never ends without one, so the sticky goes to the block in the
   * centre of the free area, selected, with the focus on the canvas and its label editor open.
   */
  private placeInFreeArea(shape: StickyShape): void {
    const centre = this.freeAreaCentre() ?? this.visibleCentre();
    const position = { x: centre.x, y: centre.y };
    const created = this.modeling.createShape(
      shape as Shape,
      position,
      this.canvas.getRootElement() as Shape,
    ) as StickyShape;
    this.selection.select(created);
    this.canvas.focus();
    this.injector.get<LabelEditing>("labelEditing", false)?.activate(created);
  }

  private freeAreaCentre(): DiagramPoint | undefined {
    const area = this.config?.freeArea;
    if (area?.center) return area.center();
    if (area?.insets) return this.centreWithin(area.insets());
    return undefined;
  }

  /** The centre of the container without the insets, in diagram coordinates, as a fit centres. */
  private centreWithin(insets: FreeAreaInsets): DiagramPoint | undefined {
    const { width, height } = this.canvas.getSize();
    if (!(width > 0 && height > 0)) return undefined;
    const middle = (size: number, start: number, end: number): number =>
      start + end < size ? start + (size - start - end) / 2 : size / 2;
    const { x, y, scale } = this.canvas.viewbox();
    return {
      x: x + middle(width, insets.left, insets.right) / scale,
      y: y + middle(height, insets.top, insets.bottom) / scale,
    };
  }

  private visibleCentre(): DiagramPoint {
    const { x, y, width, height } = this.canvas.viewbox();
    return { x: x + width / 2, y: y + height / 2 };
  }
}

/** The click the shell synthesises for Enter or Space on an entry: no pointer, detail 0. */
function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}
