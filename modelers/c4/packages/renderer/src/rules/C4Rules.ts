import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { CreatableKind } from "@miragon/c4-dsl";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { ElementId, ShapeName, Size, ViewType, Workspace } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { framedClosure } from "../modeling/closure.js";
import { boundaryCanvasId } from "../reconcile/Reconciler.js";
import type { SceneNotation } from "../scene/notation.js";
import {
  c4ReferenceOf,
  type C4ElementShape,
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
  RELATIONSHIP_PREVIEW,
} from "../scene/types.js";
import type { C4SceneService, C4Views, EditRefusedEvent } from "../services.js";

/** Below the read-only lock (5000), which vetoes every edit while it holds. */
const PRIORITY = 1000;
/** After diagram-js's Move took the selection (1500), before its rule check (1250) and preview. */
const COLLECT_FRAMED = 1400;
/** Ahead of diagram-js's own start listener, which turns the minimum into the drag's constraint. */
const BEFORE_THE_RESIZE = 1500;

/** The smallest box a resize drag leaves an element (SPEC 5.7). */
const MIN_RESIZE: Size = { width: 140, height: 100 };
const MIN_PERSON_RESIZE: Size = { width: 140, height: 140 };
const PERSON_SHAPES: ReadonlySet<ShapeName> = new Set(["Person", "Robot"]);
const MOBILE_SHAPES: ReadonlySet<ShapeName> = new Set([
  "MobileDevicePortrait",
  "MobileDeviceLandscape",
]);

/** What a connect and a bendpoint drag draw while they run: the line with its chevron. */
type PreviewAnswer = typeof RELATIONSHIP_PREVIEW;

/** What a palette may create in a view of each type (SPEC 5.1). */
const CREATABLE: Readonly<Partial<Record<ViewType, readonly CreatableKind[]>>> = {
  systemLandscape: ["person", "softwareSystem"],
  systemContext: ["person", "softwareSystem"],
  container: ["person", "softwareSystem", "container"],
  component: ["person", "softwareSystem", "container", "component"],
};

interface CreateContext {
  shape?: Element;
  elements?: Element[];
  target?: Element | null;
}

interface MoveContext {
  shapes?: Element[];
  target?: Element | null;
}

interface ResizeContext {
  shape?: Element;
  minDimensions?: Size;
}

interface ConnectContext {
  source?: Element | null;
  target?: Element | null;
}

/**
 * The rules of SPEC 5.2. Every action a loaded diagram-js module asks is answered explicitly:
 * `CommandStack.canExecute` refuses an action no listener answers and no handler serves, and the
 * C4 modeling registers no stock handler. A shape is never a parent: a drop target that is a
 * shape is ignored (`null`), so the drop goes on with the root.
 */
export default class C4Rules extends RuleProvider {
  static override $inject = ["eventBus", "injector"];

  constructor(
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    super(eventBus);
    // A dragged boundary shows its content moving with it; the drop moves the same closure.
    eventBus.on("shape.move.start", COLLECT_FRAMED, (event: { context?: MoveContext }) => {
      const context = event.context;
      if (context?.shapes) context.shapes = this.withFramed(context.shapes);
    });
    // The drag stops at the minimum instead of turning into a refused drop (Event Storming's clamp).
    eventBus.on("resize.start", BEFORE_THE_RESIZE, (event: { context?: ResizeContext }) => {
      const context = event.context;
      if (context && isElementShape(context.shape)) {
        context.minDimensions = this.minimumSize(context.shape);
      }
    });
  }

  override init(): void {
    this.addRule(["shape.create", "elements.create"], PRIORITY, (context: CreateContext) =>
      this.canCreate(context),
    );
    this.addRule(["elements.move", "shape.move"], PRIORITY, (context: MoveContext) =>
      this.canMove(context),
    );
    this.addRule(
      "shape.resize",
      PRIORITY,
      ({ shape }: { shape?: Element }) => this.editable() && isElementShape(shape),
    );
    this.addRule("connection.start", PRIORITY, ({ source }: ConnectContext) =>
      isElementShape(source) ? this.editable() : null,
    );
    this.addRule("connection.create", PRIORITY, (context: ConnectContext) =>
      this.canConnect(context),
    );
    this.addRule(
      "connection.updateWaypoints",
      PRIORITY,
      ({ connection }: { connection?: Element }) => this.canBend(connection),
    );
    this.addRule(["connection.reconnect", "shape.append", "shape.attach"], PRIORITY, () => false);
    this.addRule("elements.delete", PRIORITY, ({ elements }: { elements?: Element[] }) =>
      this.editable() ? (elements ?? []).filter((element) => !isBoundaryShape(element)) : false,
    );
  }

  private canCreate({ shape, elements, target }: CreateContext): boolean | null {
    if (!this.editable()) return false;
    const created = shape ? [shape] : (elements ?? []);
    const allowed = CREATABLE[this.views().active().type] ?? [];
    const creatable = created.every((element) => {
      const reference = c4ReferenceOf(element);
      return reference?.role === "preview" && allowed.includes(reference.kind);
    });
    if (!creatable || created.length !== 1) return false;
    return isRoot(target) ? true : null;
  }

  /**
   * diagram-js moves the whole selection, a lassoed relationship included: it goes along (its
   * vertices follow when both of its ends move), so it never keeps the elements from moving.
   */
  private canMove({ shapes, target }: MoveContext): boolean | null {
    if (!this.editable()) return false;
    const moved = shapes ?? [];
    const placed = (shape: Element) => isElementShape(shape) || isBoundaryShape(shape);
    if (!moved.some(placed)) return false;
    if (!moved.every((shape) => placed(shape) || isRelationshipConnection(shape))) return false;
    if (target === undefined || isRoot(target)) return true;
    return null;
  }

  /** An implied relationship without a key takes no vertices (SPEC 3.6); an explicit one is named. */
  private canBend(connection: Element | undefined): PreviewAnswer | false {
    if (!this.editable() || !isRelationshipConnection(connection)) return false;
    if (!connection.c4.implied) return RELATIONSHIP_PREVIEW;
    const scene = this.injector.get<C4SceneService>("c4Scene");
    const named = scene
      .current()
      .relationships.some(
        (relationship) =>
          relationship.canvasKey === connection.c4.key && relationship.key !== undefined,
      );
    return named ? RELATIONSHIP_PREVIEW : false;
  }

  /**
   * Only an element is a target: the canvas, a boundary and a relationship are ignored (`null`),
   * so the pointer over them reads as "not there yet" instead of "forbidden".
   */
  private canConnect({ source, target }: ConnectContext): PreviewAnswer | false | null {
    if (!this.editable() || !isElementShape(source)) return false;
    // The context pad's dragged append: diagram-js's create asks for the element it drops, which
    // makes its drop an append (`C4Modeling.appendShape`), never a bare create.
    if (c4ReferenceOf(target)?.role === "preview") return RELATIONSHIP_PREVIEW;
    if (!isElementShape(target)) return null;
    return this.connectRefusal(source, target) === undefined ? RELATIONSHIP_PREVIEW : false;
  }

  /**
   * Why the edit layer would refuse a relationship from `source` to `target`, in its own words:
   * not to itself, not between an element and its ancestor, not over an unnamed duplicate.
   */
  connectRefusal(source: Element, target: Element): EditRefusedEvent | undefined {
    if (!isElementShape(source) || !isElementShape(target)) return undefined;
    const from = source.c4.id;
    const to = target.c4.id;
    if (from === to) {
      return { reason: "not-allowed", message: "An element can't have a relationship to itself." };
    }
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    if (isAncestor(workspace, from, to) || isAncestor(workspace, to, from)) {
      return {
        reason: "not-allowed",
        message: "Structurizr refuses a relationship between an element and its parent or child.",
      };
    }
    const duplicate = workspace.relationships.find(
      (relationship) =>
        relationship.sourceId === from &&
        relationship.destinationId === to &&
        relationship.description === "",
    );
    if (!duplicate) return undefined;
    return {
      reason: "relationship-exists",
      message: duplicate.implied
        ? "An implied relationship already connects these. Give the new one a description."
        : "These are already connected by a relationship without a description.",
    };
  }

  /** The shapes plus what the boundaries among them frame, nested boundaries included. */
  private withFramed(shapes: Element[]): Element[] {
    const boundaries = shapes.filter(isBoundaryShape).map((shape) => shape.c4.id);
    if (boundaries.length === 0) return shapes;
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    const members = this.injector
      .get<C4Engine>("c4Engine")
      .members(workspace, this.views().active());
    const closure = framedClosure(members, boundaries);
    const registry = this.injector.get<ElementRegistry>("elementRegistry");
    const all = new Set(shapes);
    for (const id of closure.boundaries) {
      const boundary = registry.get(boundaryCanvasId(id));
      if (boundary) all.add(boundary as Element);
    }
    for (const id of closure.elements) {
      const element = registry.get(id);
      if (isElementShape(element)) all.add(element);
    }
    return [...all];
  }

  /** A person stays square; a mobile device keeps the aspect of its default size. */
  private minimumSize(shape: C4ElementShape): Size {
    const drawn = this.injector
      .get<C4SceneService>("c4Scene")
      .current()
      .elements.find((element) => element.id === shape.c4.id)?.shape;
    if (drawn !== undefined && PERSON_SHAPES.has(drawn)) return { ...MIN_PERSON_RESIZE };
    if (drawn === undefined || !MOBILE_SHAPES.has(drawn)) return { ...MIN_RESIZE };
    const { width, height } = this.injector.get<SceneNotation>("c4Notation").defaultSize(drawn);
    const scale = Math.max(
      MIN_RESIZE.height / Math.min(width, height),
      MIN_RESIZE.width / Math.max(width, height),
    );
    return { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
  }

  private editable(): boolean {
    return this.views().active().editable;
  }

  private views(): C4Views {
    return this.injector.get<C4Views>("c4Views");
  }
}

function isRoot(element: Element | null | undefined): boolean {
  return !!element && !(element as { parent?: unknown }).parent && !c4ReferenceOf(element);
}

function isAncestor(workspace: Workspace, ancestor: ElementId, of: ElementId): boolean {
  const parents = new Map(workspace.elements.map((element) => [element.id, element.parentId]));
  let current = parents.get(of);
  while (current !== undefined) {
    if (current === ancestor) return true;
    current = parents.get(current);
  }
  return false;
}
