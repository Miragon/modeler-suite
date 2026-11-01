import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Connection, Element, Root, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { IdChange } from "@miragon/c4-dsl";
import type { Box, ElementId, Point, RelationshipKey } from "@miragon/c4-schema-model";
import { shapeOutline } from "../draw/drawItems.js";
import { drawSignature } from "../draw/signature.js";
import { ROOT_ID } from "../io/types.js";
import { boxOf, type default as C4Layouter } from "../modeling/C4Layouter.js";
import { sameBox, samePoints, type DockTarget } from "../modeling/geometry.js";
import {
  c4ReferenceOf,
  type C4ElementReference,
  type C4RelationshipReference,
  type Scene,
  type SceneElement,
} from "../scene/types.js";

const BOUNDARY_PREFIX = "boundary:";
const RELATIONSHIP_PREFIX = "rel:";

/** Identifiers cannot contain `:`, so the three kinds of canvas ids never collide (SPEC 1.5). */
export function boundaryCanvasId(id: ElementId): string {
  return `${BOUNDARY_PREFIX}${id}`;
}

export function relationshipCanvasId(canvasKey: string): string {
  return `${RELATIONSHIP_PREFIX}${canvasKey}`;
}

/** The group frames and the title block, drawn outside diagram-js's elements (SPEC 1.5 step 6). */
export interface SceneLayers {
  sync(scene: Scene): unknown;
}

interface DesiredShape {
  readonly canvasId: string;
  readonly reference: C4ElementReference;
  readonly box: Box;
  readonly signature: string;
}

interface DesiredConnection {
  readonly canvasId: string;
  readonly reference: C4RelationshipReference;
  readonly sourceId: string;
  readonly targetId: string;
  /** The ends as the drawing outlines them, where the line docks (SPEC 5.7). */
  readonly source: DockTarget;
  readonly target: DockTarget;
  /** The scene's route: the stored vertices, or the bend that fans the line out. */
  readonly vertices: readonly Point[];
  readonly signature: string;
}

type ShapeWithReference = Shape & { c4: C4ElementReference };
type ConnectionWithReference = Connection & { c4: C4RelationshipReference };

/**
 * Brings the canvas to the scene in place (SPEC 1.5): a kept id keeps its shape object, so the
 * selection, a running label edit and diagram-js's own references to it survive an import, a
 * view switch and every command. The same sync serves all three; there is no full render.
 */
export default class Reconciler {
  static $inject = [
    "canvas",
    "elementFactory",
    "elementRegistry",
    "eventBus",
    "c4Layouter",
    "injector",
  ];

  private readonly signatures = new WeakMap<Element, string>();

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly elementRegistry: ElementRegistry,
    private readonly eventBus: EventBus,
    private readonly layouter: C4Layouter,
    private readonly injector: Injector,
  ) {}

  /** Returns the shapes and connections that are new or whose box or drawing changed. */
  sync(scene: Scene, idChanges: readonly IdChange[] = []): Element[] {
    const root = this.root();
    this.migrate(idChanges);
    const shapes = desiredShapes(scene);
    const connections = desiredConnections(scene);
    this.removeAllBut(new Set([...shapes, ...connections].map(({ canvasId }) => canvasId)));
    const changed: Element[] = [];
    this.syncShapes(root, shapes, changed);
    this.syncConnections(root, connections, changed);
    this.restoreOrder(root, [...shapes, ...connections]);
    this.injector.get<SceneLayers>("c4Layers", false)?.sync(scene);
    return changed;
  }

  /** Outside a command, where the command stack fires no `elements.changed` for the redraw. */
  syncAndRedraw(scene: Scene, idChanges: readonly IdChange[] = []): Element[] {
    const changed = this.sync(scene, idChanges);
    if (changed.length > 0) this.eventBus.fire("elements.changed", { elements: changed });
    return changed;
  }

  /** The one root of the canvas, created on first use; an implicit root diagram-js made goes. */
  root(): Root {
    const existing = this.registered(ROOT_ID) as Root | undefined;
    if (existing) return existing;
    const root = this.elementFactory.createRoot({ id: ROOT_ID });
    this.canvas.setRootElement(root);
    for (const other of this.canvas.getRootElements()) {
      if (other !== root) this.canvas.removeRootElement(other);
    }
    return root;
  }

  /** An element that got an identifier keeps its shape, its selection and an open label editor. */
  private migrate(idChanges: readonly IdChange[]): void {
    for (const change of idChanges) {
      if (change.kind === "element") {
        this.moveId(change.from, change.to, (element) => {
          (element as ShapeWithReference).c4.id = change.to;
        });
        this.moveId(boundaryCanvasId(change.from), boundaryCanvasId(change.to), (element) => {
          (element as ShapeWithReference).c4.id = change.to;
        });
      } else {
        this.moveId(
          relationshipCanvasId(change.from),
          relationshipCanvasId(change.to),
          (element) => {
            (element as ConnectionWithReference).c4.key = change.to;
          },
        );
      }
    }
  }

  private moveId(from: string, to: string, retarget: (element: Element) => void): void {
    const element = this.registered(from);
    if (!element || !c4ReferenceOf(element) || this.registered(to)) return;
    this.elementRegistry.updateId(element, to);
    retarget(element);
  }

  private registered(id: string): Element | undefined {
    return this.elementRegistry.get(id) as Element | undefined;
  }

  /** Connections first, so no removed shape leaves a connection behind. */
  private removeAllBut(wanted: ReadonlySet<string>): void {
    const unwanted = this.elementRegistry.filter((element) => {
      const reference = c4ReferenceOf(element);
      return reference !== undefined && reference.role !== "preview" && !wanted.has(element.id);
    }) as Element[];
    for (const element of unwanted) {
      if (isConnection(element)) this.removeConnection(element);
    }
    for (const element of unwanted) {
      if (!isConnection(element)) this.canvas.removeShape(element as Shape);
    }
  }

  /** As diagram-js's own delete does: the ends forget the connection. */
  private removeConnection(connection: Connection): void {
    this.canvas.removeConnection(connection);
    const detached = connection as { source: unknown; target: unknown };
    detached.source = null;
    detached.target = null;
  }

  /**
   * The drawing order a fresh render has (SPEC 1.5 step 2): kept elements stay where they were
   * and new ones go in at their place, but an edit or a switch can change the order of kept ones
   * (two relationships shown again in another order). Their graphics move in place, so nothing
   * is removed, deselected or redrawn; a relationship's label (its secondary graphics, in the
   * labels layer) moves with it, so the labels keep the order of their lines.
   */
  private restoreOrder(root: Root, desired: readonly { readonly canvasId: string }[]): void {
    const wanted = desired.flatMap(({ canvasId }) => this.registered(canvasId) ?? []);
    const placed = new Set(wanted);
    const children = root.children as Element[];
    const inOrder = children.filter((child) => placed.has(child));
    if (inOrder.every((child, index) => child === wanted[index])) return;
    const others = children.filter((child) => !placed.has(child));
    children.splice(0, children.length, ...wanted, ...others);
    const container = this.elementRegistry.getGraphics(root) as SVGElement | undefined;
    if (!container) return;
    for (const element of [...wanted, ...others]) {
      const group = this.elementRegistry.getGraphics(element)?.parentNode;
      if (group && group.parentNode === container) container.append(group);
      const label = this.elementRegistry.getGraphics(element, true) as SVGElement | undefined;
      label?.parentNode?.append(label);
    }
  }

  /** Boundaries below element shapes: a new shape goes in at its place among the kept ones. */
  private syncShapes(root: Root, shapes: readonly DesiredShape[], changed: Element[]): void {
    let insertAt = 0;
    for (const item of shapes) {
      const existing = this.registered(item.canvasId);
      if (existing && !isConnection(existing)) {
        const shape = existing as ShapeWithReference;
        let dirty = false;
        if (!sameBox(shape, item.box)) {
          Object.assign(shape, boxOf(item.box));
          dirty = true;
        }
        if (shape.c4.role !== item.reference.role || shape.c4.id !== item.reference.id) {
          shape.c4 = { ...item.reference };
          dirty = true;
        }
        if (this.signatures.get(shape) !== item.signature) {
          this.signatures.set(shape, item.signature);
          dirty = true;
        }
        if (dirty) changed.push(shape);
        insertAt = Math.max(insertAt, root.children.indexOf(shape) + 1);
        continue;
      }
      if (existing) this.removeConnection(existing as Connection);
      const shape = this.elementFactory.createShape({
        id: item.canvasId,
        ...boxOf(item.box),
        c4: { ...item.reference },
      } as Partial<Shape>);
      this.canvas.addShape(shape, root, Math.min(insertAt, root.children.length));
      this.signatures.set(shape, item.signature);
      insertAt = root.children.indexOf(shape) + 1;
      changed.push(shape);
    }
  }

  /** Appended after every shape, so relationships draw above the elements. */
  private syncConnections(
    root: Root,
    connections: readonly DesiredConnection[],
    changed: Element[],
  ): void {
    for (const item of connections) {
      const source = this.registered(item.sourceId) as Shape | undefined;
      const target = this.registered(item.targetId) as Shape | undefined;
      if (!source || !target) continue;
      const waypoints = this.layouter.waypoints(item.source, item.target, item.vertices);
      const existing = this.registered(item.canvasId);
      if (existing && isConnection(existing)) {
        const connection = existing as ConnectionWithReference;
        if (connection.source === source && connection.target === target) {
          let dirty = false;
          if (!samePoints(connection.waypoints, waypoints)) {
            connection.waypoints = waypoints;
            dirty = true;
          }
          if (
            connection.c4.key !== item.reference.key ||
            connection.c4.implied !== item.reference.implied
          ) {
            connection.c4 = { ...item.reference };
            dirty = true;
          }
          if (this.signatures.get(connection) !== item.signature) {
            this.signatures.set(connection, item.signature);
            dirty = true;
          }
          if (dirty) changed.push(connection);
          continue;
        }
        this.removeConnection(connection);
      } else if (existing) {
        this.canvas.removeShape(existing as Shape);
      }
      const connection = this.elementFactory.createConnection({
        id: item.canvasId,
        source,
        target,
        waypoints,
        c4: { ...item.reference },
      } as Partial<Connection>);
      this.canvas.addConnection(connection, root);
      this.signatures.set(connection, item.signature);
      changed.push(connection);
    }
  }
}

function isConnection(element: Element): element is Connection {
  return Array.isArray((element as { waypoints?: unknown }).waypoints);
}

/** Boundaries by depth (outer first), then in document order; then the elements. */
function desiredShapes(scene: Scene): DesiredShape[] {
  const boundaries = [...scene.boundaries].sort((left, right) => left.depth - right.depth);
  return [
    ...boundaries.map((boundary): DesiredShape => ({
      canvasId: boundaryCanvasId(boundary.id),
      reference: { role: "boundary", id: boundary.id },
      box: boundary.box,
      signature: drawSignature(boundary),
    })),
    ...scene.elements.map((element): DesiredShape => ({
      canvasId: element.id,
      reference: { role: "element", id: element.id },
      box: element.box,
      signature: drawSignature(element),
    })),
  ];
}

function desiredConnections(scene: Scene): DesiredConnection[] {
  const elements = new Map(scene.elements.map((element) => [element.id, element]));
  return scene.relationships.flatMap((relationship): DesiredConnection[] => {
    const source = elements.get(relationship.sourceId);
    const target = elements.get(relationship.destinationId);
    if (!source || !target) return [];
    return [
      {
        canvasId: relationshipCanvasId(relationship.canvasKey),
        reference: {
          role: "relationship",
          key: relationship.canvasKey as RelationshipKey,
          implied: relationship.implied,
        },
        sourceId: relationship.sourceId,
        targetId: relationship.destinationId,
        source: dockTargetOf(source),
        target: dockTargetOf(target),
        vertices: relationship.route,
        signature: drawSignature(relationship),
      },
    ];
  });
}

function dockTargetOf(element: SceneElement): DockTarget {
  return { box: element.box, outline: shapeOutline(element) };
}
