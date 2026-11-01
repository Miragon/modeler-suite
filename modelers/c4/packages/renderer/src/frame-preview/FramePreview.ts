import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { ViewFrame } from "@miragon/c4-layout";
import type { Box, ElementId, ViewMembers } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { FRAMES_LAYER, FRAMES_LAYER_INDEX } from "../draw/C4Layers.js";
import { rectanglePath } from "../draw/shapes.js";
import { append, clearChildren, svgElement } from "../draw/svg.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { boundaryCanvasId } from "../reconcile/Reconciler.js";
import {
  c4ReferenceOf,
  isBoundaryShape,
  isElementShape,
  type SceneBoundary,
  type SceneGroup,
} from "../scene/types.js";
import type { C4SceneService, C4Views } from "../services.js";
import { createdParentId, membersWithCreated } from "./createdMembers.js";
import {
  appendBoundaryCaption,
  appendGroupCaption,
  appendWarningChip,
  overlapText,
} from "./frameCaption.js";
import "./feedback.css";

/** After diagram-js's move, create and resize settled the drag (snapping included). */
const AFTER_THE_DRAG = 250;

export const FRAME_PREVIEW_LAYER = "c4-frame-preview";
/** Above the plane: a warning frame stays visible over the elements it runs across. */
const FRAME_PREVIEW_LAYER_INDEX = 1;

export const FRAME_PREVIEW_CLASS = "c4-frame-preview";
export const FRAME_WARNING_CLASS = "c4-frame-preview-warning";
/** One previewed frame: its outline, its caption and, when it warns, the chip that says why. */
export const FRAME_PREVIEW_ITEM_CLASS = "c4-frame-preview-item";
/** The frame as it was drawn before the drag, faded while its preview shows. */
export const STALE_FRAME_CLASS = "c4-frame-stale";

const BOUNDARY_RADIUS = 6;
const GROUP_RADIUS = 8;
const PREVIEW_STROKE = 2;

interface MoveContext {
  shapes?: Element[];
}

interface CreateContext {
  shape?: Shape;
}

interface ResizeContext {
  shape?: Shape;
  newBounds?: Box;
}

interface DragEvent<Context> {
  context?: Context;
  dx?: number;
  dy?: number;
  x?: number;
  y?: number;
  hover?: unknown;
}

/** What one drag compares against: the frames of the view as drawn when it started. */
interface DragBase {
  readonly members: ViewMembers;
  readonly boxes: ReadonlyMap<ElementId, Box>;
  readonly boundaries: ReadonlyMap<ElementId, Box>;
  readonly groups: ReadonlyMap<string, Box>;
  /** What each frame's caption shows. */
  readonly boundaryLooks: ReadonlyMap<ElementId, SceneBoundary>;
  readonly groupLooks: ReadonlyMap<string, SceneGroup>;
  /** The names a warning gives the elements a frame would run over. */
  readonly names: ReadonlyMap<ElementId, string>;
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  person: "person",
  softwareSystem: "software system",
  container: "container",
  component: "component",
};

/**
 * The live frames of a drag (SPEC 4.3: boundaries and groups are derived from their members, never
 * stored): while a member moves, a palette create follows the pointer or an element is resized,
 * every frame the drop would change is drawn where it will be, dashed in the interaction colour,
 * and the frame as drawn now fades. A frame that would run over an element it does not hold is
 * drawn in the danger colour: Structurizr allows the picture, so the drop goes through, but the
 * user sees it before letting go. Nothing here runs a layout.
 */
export default class FramePreview {
  static $inject = ["eventBus", "canvas", "elementRegistry", "injector"];

  private base: DragBase | undefined;
  private readonly stale = new Set<string>();

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on("shape.move.start", AFTER_THE_DRAG, () => this.start());
    eventBus.on("shape.move.move", AFTER_THE_DRAG, (event: DragEvent<MoveContext>) =>
      this.previewMove(event),
    );
    eventBus.on("create.start", AFTER_THE_DRAG, () => this.start());
    eventBus.on("create.move", AFTER_THE_DRAG, (event: DragEvent<CreateContext>) =>
      this.previewCreate(event),
    );
    eventBus.on("create.out", () => this.clear());
    eventBus.on("resize.start", AFTER_THE_DRAG, () => this.start());
    eventBus.on("resize.move", AFTER_THE_DRAG, (event: DragEvent<ResizeContext>) =>
      this.previewResize(event),
    );
    eventBus.on(["shape.move.cleanup", "create.cleanup", "resize.cleanup"], () => this.end());
    eventBus.on(["diagram.clear", "diagram.destroy"], () => this.end());
  }

  private start(): void {
    this.end();
    const scene = this.injector.get<C4SceneService>("c4Scene", false)?.current();
    if (!scene) return;
    const engine = this.injector.get<C4Engine>("c4Engine");
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const view = this.injector.get<C4Views>("c4Views").active();
    this.base = {
      members: engine.members(workspace, view),
      boxes: scene.boxes,
      boundaries: new Map(scene.boundaries.map((boundary) => [boundary.id, boundary.box])),
      groups: new Map(scene.groups.map((group) => [group.key, group.box])),
      boundaryLooks: new Map(scene.boundaries.map((boundary) => [boundary.id, boundary])),
      groupLooks: new Map(scene.groups.map((group) => [group.key, group])),
      names: new Map(scene.elements.map((element) => [element.id, element.name])),
    };
  }

  private previewMove(event: DragEvent<MoveContext>): void {
    const base = this.base;
    const shapes = event.context?.shapes;
    if (!base || !shapes) return;
    const dx = event.dx ?? 0;
    const dy = event.dy ?? 0;
    const boxes = new Map(base.boxes);
    const boundaries = new Map(base.boundaries);
    const carried = new Set<ElementId>();
    const moved = new Set<ElementId>();
    for (const shape of shapes) {
      if (isElementShape(shape)) {
        moved.add(shape.c4.id);
        boxes.set(shape.c4.id, movedBox(shape, dx, dy));
      }
      if (isBoundaryShape(shape)) {
        carried.add(shape.c4.id);
        boundaries.set(shape.c4.id, movedBox(shape, dx, dy));
      }
    }
    this.draw(base, base.members, boxes, boundaries, carried, moved);
  }

  private previewCreate(event: DragEvent<CreateContext>): void {
    const base = this.base;
    const shape = event.context?.shape;
    const reference = c4ReferenceOf(shape);
    if (!base || !shape || reference?.role !== "preview") return;
    if (!event.hover || event.x === undefined || event.y === undefined) {
      this.clear();
      return;
    }
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const view = this.injector.get<C4Views>("c4Views").active();
    const parentId = createdParentId(reference.kind, view, workspace);
    const members = membersWithCreated(base.members, shape.id, parentId);
    const boxes = new Map(base.boxes);
    boxes.set(shape.id, {
      x: event.x + shape.x,
      y: event.y + shape.y,
      width: shape.width,
      height: shape.height,
    });
    const name = reference.name ?? `the new ${KIND_WORDS[reference.kind] ?? "element"}`;
    this.draw(base, members, boxes, base.boundaries, new Set(), new Set([shape.id]), {
      [shape.id]: name,
    });
  }

  private previewResize(event: DragEvent<ResizeContext>): void {
    const base = this.base;
    const shape = event.context?.shape;
    const bounds = event.context?.newBounds;
    if (!base || !isElementShape(shape) || !bounds) return;
    const boxes = new Map(base.boxes);
    boxes.set(shape.c4.id, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    this.draw(base, base.members, boxes, base.boundaries, new Set(), new Set([shape.c4.id]));
  }

  /**
   * Draws each frame the drop changes, and each frame the dragged elements would end up over
   * without belonging to it: a frame that stays put still makes a stranger look like a member. A
   * boundary the drag carries along shows in diagram-js's own drag preview already, so it is drawn
   * only when its frame differs from that or warns.
   */
  private draw(
    base: DragBase,
    members: ViewMembers,
    boxes: ReadonlyMap<ElementId, Box>,
    boundaries: ReadonlyMap<ElementId, Box>,
    carried: ReadonlySet<ElementId>,
    dragged: ReadonlySet<ElementId>,
    createdNames: Readonly<Record<ElementId, string>> = {},
  ): void {
    const frames = this.injector.get<C4Engine>("c4Engine").frames(members, boxes, boundaries);
    const nameOf = (id: ElementId) => createdNames[id] ?? base.names.get(id) ?? id;
    const layer = this.previewLayer();
    clearChildren(layer);
    const stale = new Set<string>();
    const strayedInto = (frame: ViewFrame) => frame.intruders.some((id) => dragged.has(id));
    for (const [id, frame] of frames.boundaries) {
      const before = base.boundaries.get(id);
      if (before && sameBox(before, frame.box) && !strayedInto(frame)) continue;
      const shown = boundaries.get(id);
      const warns = frame.intruders.length > 0;
      if (carried.has(id) && shown && sameBox(shown, frame.box) && !warns) continue;
      const item = append(layer, svgElement("g", { class: FRAME_PREVIEW_ITEM_CLASS }));
      append(item, frameNode(frame, BOUNDARY_RADIUS, { "data-boundary": id }));
      const look = base.boundaryLooks.get(id);
      if (look) appendBoundaryCaption(item, look, frame.box);
      if (warns) appendWarningChip(item, frame.box, overlapText(frame.intruders.map(nameOf)));
      if (!carried.has(id)) stale.add(boundaryCanvasId(id));
    }
    for (const [key, frame] of frames.groups) {
      const before = base.groups.get(key);
      if (before && sameBox(before, frame.box) && !strayedInto(frame)) continue;
      const item = append(layer, svgElement("g", { class: FRAME_PREVIEW_ITEM_CLASS }));
      append(item, frameNode(frame, GROUP_RADIUS, { "data-group": key }));
      const look = base.groupLooks.get(key);
      if (look) appendGroupCaption(item, look, frame.box);
      if (frame.intruders.length > 0) {
        appendWarningChip(item, frame.box, overlapText(frame.intruders.map(nameOf)));
      }
      stale.add(groupSelector(key));
    }
    this.markStale(stale);
  }

  private markStale(next: ReadonlySet<string>): void {
    for (const key of this.stale) {
      if (!next.has(key)) this.setStale(key, false);
    }
    for (const key of next) {
      if (!this.stale.has(key)) this.setStale(key, true);
    }
  }

  private setStale(key: string, stale: boolean): void {
    if (stale) this.stale.add(key);
    else this.stale.delete(key);
    if (key.startsWith(GROUP_SELECTOR_PREFIX)) {
      const node = this.framesLayer().querySelector(key.slice(GROUP_SELECTOR_PREFIX.length));
      node?.classList.toggle(STALE_FRAME_CLASS, stale);
      return;
    }
    if (!this.elementRegistry.get(key)) return;
    if (stale) this.canvas.addMarker(key, STALE_FRAME_CLASS);
    else this.canvas.removeMarker(key, STALE_FRAME_CLASS);
  }

  private clear(): void {
    clearChildren(this.previewLayer());
    this.markStale(new Set());
  }

  private end(): void {
    if (this.base === undefined && this.stale.size === 0) return;
    this.base = undefined;
    this.clear();
  }

  private previewLayer(): SVGGElement {
    const layer = this.canvas.getLayer(
      FRAME_PREVIEW_LAYER,
      FRAME_PREVIEW_LAYER_INDEX,
    ) as SVGGElement;
    layer.setAttribute("pointer-events", "none");
    return layer;
  }

  private framesLayer(): SVGGElement {
    return this.canvas.getLayer(FRAMES_LAYER, FRAMES_LAYER_INDEX) as SVGGElement;
  }
}

const GROUP_SELECTOR_PREFIX = "group:";

function groupSelector(key: string): string {
  return `${GROUP_SELECTOR_PREFIX}[data-group="${CSS.escape(key)}"]`;
}

function frameNode(
  frame: ViewFrame,
  radius: number,
  data: Readonly<Record<string, string>>,
): SVGPathElement {
  const inset = PREVIEW_STROKE / 2;
  const warns = frame.intruders.length > 0;
  return svgElement("path", {
    class: warns ? `${FRAME_PREVIEW_CLASS} ${FRAME_WARNING_CLASS}` : FRAME_PREVIEW_CLASS,
    d: rectanglePath(
      frame.box.x + inset,
      frame.box.y + inset,
      frame.box.width - PREVIEW_STROKE,
      frame.box.height - PREVIEW_STROKE,
      radius,
    ),
    fill: "none",
    "stroke-width": PREVIEW_STROKE,
    ...data,
  });
}

function movedBox(shape: Box, dx: number, dy: number): Box {
  return { x: shape.x + dx, y: shape.y + dy, width: shape.width, height: shape.height };
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
