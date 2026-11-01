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
import type {
  Box,
  ElementId,
  ResolvedElementStyle,
  ShapeName,
  Size,
  ViewEntry,
  ViewType,
} from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { ICONS, paletteEntryHtml } from "../draw/icons.js";
import { shapePreviewSvg } from "../draw/preview.js";
import type SceneLookup from "../draw/SceneLookup.js";
import type { C4Engine } from "../engine/C4Engine.js";
import {
  createdParentId,
  framingBoundaries,
  membersWithCreated,
} from "../frame-preview/createdMembers.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import type C4Modeling from "../modeling/C4Modeling.js";
import type { SceneNotation } from "../scene/notation.js";
import { isElementShape } from "../scene/types.js";
import type { C4ElementFactory, C4SceneService, C4Views } from "../services.js";
import { boxAround, findFreeSpot, panToShow } from "./freeSpot.js";
import { inspectorCover } from "./inspectorCover.js";

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

export interface CreatingEntry {
  readonly action: string;
  readonly title: string;
  readonly kind: CreatableKind;
  readonly shape: ShapeName;
  readonly tags?: readonly string[];
}

/** Guide §5.5: a keyboard-created element lands this far down-right of a spot that is taken. */
const KEYBOARD_CREATE_OFFSET = 24;
/** Room kept around a keyboard-created element: a relationship's label (48 high) fits between. */
const KEYBOARD_CREATE_GAP = 48;
/** The search out of sight runs on a coarser lattice: it may span the whole view. */
const BEYOND_STEP = 48;

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
export const CREATING_ENTRIES: Readonly<Partial<Record<ViewType, readonly CreatingEntry[]>>> = {
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
      const look = this.lookOf(entry);
      entries[entry.action] = {
        group: "elements",
        title: entry.title,
        html: paletteEntryHtml(shapePreviewSvg(look?.shape ?? entry.shape, look), true),
        action: { click: start, dragstart: start },
      };
    }
    return entries;
  }

  /**
   * What the entries show: the view's type, whether it is editable and the look of each element it
   * creates. The view service rebuilds the palette when this changes, after "Apply C4 colours" too.
   */
  signature(): string {
    const view = this.injector.get<C4Views>("c4Views", false)?.active();
    if (!view) return "";
    const entries = view.editable ? (CREATING_ENTRIES[view.type] ?? []) : [];
    return JSON.stringify([view.type, view.editable, entries.map((entry) => this.lookOf(entry))]);
  }

  /** The look the element lands in (WYSIWYG, guide §5.5): the workspace's styles for its kind. */
  private lookOf(entry: CreatingEntry): ResolvedElementStyle | undefined {
    return this.injector
      .get<SceneLookup>("c4SceneLookup", false)
      ?.createdStyle(entry.kind, entry.tags ?? []);
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
    const size = this.sizeOf(entry);
    if (size) Object.assign(shape, size);
    if (isKeyboardClick(event)) this.placeInFreeArea(shape, entry.kind);
    else this.create.start(event as MouseEvent, shape);
  }

  /** The size the element lands in: its style's, else its shape's default (SPEC 6.2). */
  private sizeOf(entry: CreatingEntry): Size | undefined {
    const look = this.lookOf(entry);
    const notation = this.injector.get<SceneNotation>("c4Notation", false);
    if (!look || !notation) return undefined;
    const fallback = notation.defaultSize(look.shape);
    return { width: look.width ?? fallback.width, height: look.height ?? fallback.height };
  }

  /**
   * Enter or Space on a creating entry (the shell's synthetic click, detail 0): diagram-js's create
   * tool follows the pointer and never ends without one, so the element goes straight to the
   * centre of the free area, selected, with the focus on the canvas and its name editor open. A
   * refused create selects nothing.
   */
  private placeInFreeArea(shape: Shape, kind: CreatableKind): void {
    const centre = this.freeAreaCentre() ?? this.visibleCentre();
    const { position, area } = this.freeSpot(centre, this.freeAreaBox(), shape, kind);
    this.panToShow(area, boxAround(position, { width: shape.width, height: shape.height }));
    const modeling = this.injector.get<C4Modeling>("modeling");
    const created = modeling.createShape(shape, position);
    if (!created || this.elementRegistry.get(created.id) !== created) return;
    this.selection.select(created);
    this.canvas.focus();
    if (isElementShape(created)) {
      this.injector.get<LabelEditing>("labelEditing", false)?.activate(created);
    }
  }

  /**
   * The keyboard create's spot (guide §5.5), clear of the elements, the relationship labels and
   * every frame the element will not belong to; a frame it joins may grow around it, but not over
   * an element it does not hold. The title moves below whatever the view then draws. Where the
   * view draws something, the spot keeps out from under the inspector its selection opens, so the
   * name editor shows; the first element of an empty view still goes where the hint stood.
   */
  private freeSpot(
    centre: DiagramPoint,
    freeArea: Box,
    shape: Shape,
    kind: CreatableKind,
  ): { position: DiagramPoint; area: Box } {
    const scene = this.injector.get<C4SceneService>("c4Scene", false)?.current();
    if (!scene) return { position: { x: centre.x, y: centre.y }, area: freeArea };
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const view = this.injector.get<C4Views>("c4Views").active();
    const engine = this.injector.get<C4Engine>("c4Engine");
    const members = engine.members(workspace, view);
    const parentId = createdParentId(kind, view, workspace);
    const framing = framingBoundaries(members, parentId);
    const obstacles: Box[] = [
      ...scene.elements.map((element) => element.box),
      ...scene.relationships.map((relationship) => relationship.labelBox),
      ...scene.boundaries.filter((boundary) => !framing.has(boundary.id)).map(({ box }) => box),
      ...scene.groups.map((group) => group.box),
    ];
    const grows =
      framing.size > 0 ? this.growsOverStrangers(view, framing, shape, parentId) : undefined;
    const size = { width: shape.width, height: shape.height };
    const area = obstacles.length > 0 ? this.clearOfInspector(freeArea) : freeArea;
    const position = findFreeSpot({
      centre,
      size,
      area,
      obstacles,
      gap: KEYBOARD_CREATE_GAP,
      step: KEYBOARD_CREATE_OFFSET,
      ...(grows ? { accepts: (box: Box) => !grows(box) } : {}),
      beyond: { area: beyondArea(area, obstacles, size), step: BEYOND_STEP },
    });
    return { position, area };
  }

  /**
   * The free area without what the host's inspector covers once it shows (`inspectorCover`): the
   * shell's fit insets count it only while it is open, and a keyboard create opens it.
   */
  private clearOfInspector(area: Box): Box {
    const cover = inspectorCover(this.canvas.getContainer());
    const { width, height } = this.canvas.getSize();
    if (!cover || !(width > 0 && height > 0)) return area;
    const { x, y, scale } = this.canvas.viewbox();
    const right = Math.min(area.x + area.width, x + (width - cover.right) / scale);
    const bottom = Math.min(area.y + area.height, y + (height - cover.bottom) / scale);
    if (!(right > area.x && bottom > area.y)) return area;
    return { x: area.x, y: area.y, width: right - area.x, height: bottom - area.y };
  }

  /**
   * A spot found out of sight comes to the middle of the free area; a spot in sight stays, since
   * placing an element never moves the view otherwise (guide §5.9).
   */
  private panToShow(area: Box, box: Box): void {
    const { x, y } = panToShow(area, box);
    if (x === 0 && y === 0) return;
    const viewbox = this.canvas.viewbox();
    this.canvas.viewbox({
      x: viewbox.x + x,
      y: viewbox.y + y,
      width: viewbox.width,
      height: viewbox.height,
    });
  }

  /** Whether a frame the new element joins would grow over an element it does not hold. */
  private growsOverStrangers(
    view: ViewEntry,
    framing: ReadonlySet<ElementId>,
    shape: Shape,
    parentId: ElementId | undefined,
  ): (box: Box) => boolean {
    const scene = this.injector.get<C4SceneService>("c4Scene").current();
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const engine = this.injector.get<C4Engine>("c4Engine");
    const members = membersWithCreated(engine.members(workspace, view), shape.id, parentId);
    const leaves = new Map(scene.boundaries.map((boundary) => [boundary.id, boundary.box]));
    return (box) => {
      const boxes = new Map(scene.boxes);
      boxes.set(shape.id, box);
      const { boundaries } = engine.frames(members, boxes, leaves);
      return [...framing].some((id) => (boundaries.get(id)?.intruders.length ?? 0) > 0);
    };
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

  /** The visible canvas without the host's insets, in diagram coordinates. */
  private freeAreaBox(): Box {
    const viewbox = this.canvas.viewbox();
    const visible = { x: viewbox.x, y: viewbox.y, width: viewbox.width, height: viewbox.height };
    const insets = this.config?.freeArea?.insets?.();
    const { width, height } = this.canvas.getSize();
    if (!insets || !(width > 0 && height > 0)) return visible;
    const left = insets.left / viewbox.scale;
    const top = insets.top / viewbox.scale;
    const freeWidth = (width - insets.left - insets.right) / viewbox.scale;
    const freeHeight = (height - insets.top - insets.bottom) / viewbox.scale;
    if (!(freeWidth > 0 && freeHeight > 0)) return visible;
    return { x: visible.x + left, y: visible.y + top, width: freeWidth, height: freeHeight };
  }

  private isLocked(): boolean {
    return this.injector.get<EditLock>("readOnly", false)?.isReadOnly() === true;
  }
}

/**
 * The visible area and everything drawn, widened by a free element's room on every side: past
 * the content there is always a clear spot.
 */
function beyondArea(area: Box, obstacles: readonly Box[], size: Size): Box {
  const room = 2 * (Math.max(size.width, size.height) + KEYBOARD_CREATE_GAP);
  const boxes = [area, ...obstacles];
  const left = Math.min(...boxes.map((box) => box.x)) - room;
  const top = Math.min(...boxes.map((box) => box.y)) - room;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + room;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + room;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The click the shell synthesises for Enter or Space on an entry: no pointer, detail 0. */
function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}
