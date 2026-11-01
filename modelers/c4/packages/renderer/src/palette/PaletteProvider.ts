import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Create from "diagram-js/lib/features/create/Create";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type GlobalConnect from "diagram-js/lib/features/global-connect/GlobalConnect";
import type HandTool from "diagram-js/lib/features/hand-tool/HandTool";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type BasePaletteProvider from "diagram-js/lib/features/palette/PaletteProvider";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { DiagramPoint, FreeArea, FreeAreaInsets } from "@miragon/modeler-api";
import type { CreatableKind } from "@miragon/c4-dsl";
import type { ShapeName, ViewType } from "@miragon/c4-schema-model";
import { ICONS, paletteEntryHtml } from "../draw/icons.js";
import { shapePreviewSvg } from "../draw/preview.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import type C4Modeling from "../modeling/C4Modeling.js";
import { isElementShape } from "../scene/types.js";
import type { C4ElementFactory, C4Views } from "../services.js";

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

interface EditLock {
  isReadOnly(): boolean;
}

interface CreatingEntry {
  readonly action: string;
  readonly title: string;
  readonly kind: CreatableKind;
  readonly shape: ShapeName;
  readonly tags?: readonly string[];
}

/** Guide §5.5: a keyboard-created element lands this far down-right of one already centred there. */
const KEYBOARD_CREATE_OFFSET = 24;

const PERSON: CreatingEntry = {
  action: "create.person",
  title: "Person",
  kind: "person",
  shape: "Person",
};
const SOFTWARE_SYSTEM: CreatingEntry = {
  action: "create.softwareSystem",
  title: "Software system",
  kind: "softwareSystem",
  shape: "Box",
};
const CONTAINER: CreatingEntry = {
  action: "create.container",
  title: "Container",
  kind: "container",
  shape: "Box",
};
/** A container with the tag `Database`, drawn as a cylinder (SPEC 5.1). */
const DATABASE: CreatingEntry = {
  action: "create.database",
  title: "Database",
  kind: "container",
  shape: "Cylinder",
  tags: ["Database"],
};
const COMPONENT: CreatingEntry = {
  action: "create.component",
  title: "Component",
  kind: "component",
  shape: "Box",
};

/** What each editable view type creates (SPEC 5.1); the parent comes from the view's scope. */
const CREATING_ENTRIES: Readonly<Partial<Record<ViewType, readonly CreatingEntry[]>>> = {
  systemLandscape: [PERSON, SOFTWARE_SYSTEM],
  systemContext: [PERSON, SOFTWARE_SYSTEM],
  container: [PERSON, SOFTWARE_SYSTEM, CONTAINER, DATABASE],
  component: [PERSON, SOFTWARE_SYSTEM, CONTAINER, DATABASE, COMPONENT],
};

/** The drag that holds the connect tool armed until its next press. */
const ARMED_CONNECT = "global-connect";

/**
 * Tools first (Lasso, Hand, Connect), then the creating entries of the view's type (SPEC 5.1): a
 * read-only view keeps the tools only, and the shell's lock mutes the rest. Tool keys end in
 * `-tool` in the group `tools`, so the shell marks the armed tool; titles and shortcuts are
 * separate fields, so the chrome tooltip shows the key as a chip. The view service rebuilds the
 * palette when the view's type changes.
 */
export default class PaletteProvider {
  static $inject = [
    "palette",
    "create",
    "handTool",
    "lassoTool",
    "globalConnect",
    "dragging",
    "canvas",
    "selection",
    "elementRegistry",
    "injector",
    "config.palette",
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly handTool: HandTool,
    private readonly lassoTool: LassoTool,
    private readonly globalConnect: GlobalConnect,
    private readonly dragging: Dragging,
    private readonly canvas: Canvas,
    private readonly selection: Selection,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
    private readonly config: PaletteConfig | undefined,
  ) {
    palette.registerProvider(this as unknown as BasePaletteProvider);
  }

  getPaletteEntries(): Record<string, PaletteEntry> {
    const entries: Record<string, PaletteEntry> = {
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
      "global-connect-tool": {
        group: "tools",
        title: "Connect",
        shortcut: "C",
        html: paletteEntryHtml(ICONS.connectTool),
        action: { click: (event) => this.armConnect(event as MouseEvent) },
      },
    };
    const view = this.injector.get<C4Views>("c4Views", false)?.active();
    if (!view?.editable) return entries;
    for (const entry of CREATING_ENTRIES[view.type] ?? []) {
      const start = (event: Event) => this.startCreate(entry, event);
      entries[entry.action] = {
        group: "elements",
        title: entry.title,
        html: paletteEntryHtml(shapePreviewSvg(entry.shape), true),
        action: { click: start, dragstart: start },
      };
    }
    return entries;
  }

  /** Enter or Space on the armed connect tool puts it down, as on any pressed toggle button. */
  private armConnect(event: MouseEvent): void {
    if (this.isLocked()) return;
    if (isKeyboardClick(event) && this.dragging.context()?.prefix === ARMED_CONNECT) {
      this.dragging.cancel(true);
      return;
    }
    this.globalConnect.start(event, false);
  }

  private startCreate(entry: CreatingEntry, event: Event): void {
    if (this.isLocked()) return;
    const factory = this.injector.get<C4ElementFactory>("c4ElementFactory");
    const shape = factory.createNew(entry.kind, undefined, entry.tags);
    if (isKeyboardClick(event)) this.placeInFreeArea(shape);
    else this.create.start(event as MouseEvent, shape);
  }

  /**
   * Enter or Space on a creating entry (the shell's synthetic click, detail 0): diagram-js's create
   * tool follows the pointer and never ends without one, so the element goes straight to the
   * centre of the free area, selected, with the focus on the canvas and its name editor open. A
   * refused create selects nothing.
   */
  private placeInFreeArea(shape: Shape): void {
    const centre = this.freeAreaCentre() ?? this.visibleCentre();
    const position = { x: centre.x, y: centre.y };
    while (this.centreTaken(position)) {
      position.x += KEYBOARD_CREATE_OFFSET;
      position.y += KEYBOARD_CREATE_OFFSET;
    }
    const modeling = this.injector.get<C4Modeling>("modeling");
    const created = modeling.createShape(shape, position);
    if (!created || this.elementRegistry.get(created.id) !== created) return;
    this.selection.select(created);
    this.canvas.focus();
    if (isElementShape(created)) {
      this.injector.get<LabelEditing>("labelEditing", false)?.activate(created);
    }
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

  private centreTaken(point: DiagramPoint): boolean {
    return this.elementRegistry
      .filter(isElementShape)
      .some(
        (element) =>
          Math.abs(element.x + element.width / 2 - point.x) < 1 &&
          Math.abs(element.y + element.height / 2 - point.y) < 1,
      );
  }

  private isLocked(): boolean {
    return this.injector.get<EditLock>("readOnly", false)?.isReadOnly() === true;
  }
}

/** The click the shell synthesises for Enter or Space on an entry: no pointer, detail 0. */
function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}
