import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type {
  C4Edit,
  EditOutcome,
  EditRefusal,
  ElementFields,
  RelationshipFields,
} from "@miragon/c4-dsl";
import type {
  Box,
  ElementId,
  Point,
  RelationshipKey,
  StaticViewType,
  ViewKey,
} from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { hashText } from "../document/hash.js";
import type { C4Engine } from "../engine/C4Engine.js";
import { relationshipCanvasId } from "../reconcile/Reconciler.js";
import type SceneService from "../scene/SceneService.js";
import {
  c4ReferenceOf,
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
} from "../scene/types.js";
import {
  EDIT_NOTICE_EVENT,
  EDIT_REFUSED_EVENT,
  type C4ModelingMethods,
  type EditRefusedEvent,
} from "../services.js";
import type ViewService from "../views/ViewService.js";
import DocumentChangeHandler, {
  DOCUMENT_CHANGE,
  type DocumentChangeContext,
} from "./DocumentChangeHandler.js";
import { framedClosure } from "./closure.js";
import { C4UnsupportedOperationError } from "./errors.js";

export const READ_ONLY_MESSAGE = "This diagram is read-only. Fix the file to edit it.";

/** The renderer option for collaborative hosts (SPEC 3.3). */
export interface C4ModelingConfig {
  identifiers?: "readable" | "collision-free" | undefined;
}

interface EditLock {
  isReadOnly(): boolean;
}

type Refusal = Extract<EditOutcome, { ok: false }>;

const RANDOM_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const RANDOM_LENGTH = 4;

/** Four characters of `[0-9a-z]` for a fresh identifier (SPEC 3.3). */
function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH));
  return Array.from(bytes, (byte) => RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length]).join("");
}

type ModelingConstructor = new (
  eventBus: EventBus,
  elementFactory: ElementFactory,
  commandStack: CommandStack,
) => object;

/**
 * diagram-js's Modeling, typed loosely: the stock calls keep their names and arguments, but a
 * create answers `undefined` when the edit layer refuses it, which the stock types cannot say.
 */
const ModelingBase = Modeling as unknown as ModelingConstructor;

/**
 * The service `modeling` (SPEC 1.3). Every stock call of diagram-js's interaction modules and
 * every domain method becomes one `C4Edit`, computed and verified before anything executes, then
 * runs as the one command `c4.document.change`. No stock handler is ever registered, so nothing
 * changes a shape that the document did not ask for.
 */
export default class C4Modeling extends ModelingBase implements C4ModelingMethods {
  static $inject = ["eventBus", "elementFactory", "commandStack", "injector"];

  constructor(
    private readonly bus: EventBus,
    elementFactory: ElementFactory,
    private readonly commands: CommandStack,
    private readonly injector: Injector,
  ) {
    super(bus, elementFactory, commands);
  }

  /** Called by diagram-js's Modeling on `diagram.init`. */
  getHandlers(): Record<string, unknown> {
    return { [DOCUMENT_CHANGE]: DocumentChangeHandler };
  }

  // The stock calls of diagram-js's interaction modules (SPEC 1.3, call-site table).

  moveElements(shapes: readonly Element[], delta: Point): void {
    const moved = this.movedClosure(shapes);
    const boxes = new Map<ElementId, Box>();
    for (const shape of moved) {
      boxes.set(shape.c4.id, {
        x: shape.x + delta.x,
        y: shape.y + delta.y,
        width: shape.width,
        height: shape.height,
      });
    }
    if (boxes.size === 0) return;
    const vertices = new Map<string, readonly Point[] | null>();
    for (const relationship of this.scenes().current().relationships) {
      if (relationship.vertices.length === 0) continue;
      if (!boxes.has(relationship.sourceId) || !boxes.has(relationship.destinationId)) continue;
      vertices.set(
        relationship.canvasKey,
        relationship.vertices.map(({ x, y }) => ({ x: x + delta.x, y: y + delta.y })),
      );
    }
    this.change({ type: "setLayout", boxes, vertices });
  }

  moveShape(shape: Element, delta: Point): void {
    this.moveElements([shape], delta);
  }

  /** The create of one preview (role `preview`); the registered new shape, or none when refused. */
  createElements(elements: readonly Element[], position: Point): Element[] {
    const [preview, ...more] = elements;
    const reference = c4ReferenceOf(preview);
    if (!preview || more.length > 0 || reference?.role !== "preview") {
      throw new C4UnsupportedOperationError("createElements of anything but one new element");
    }
    const { width, height } = preview as Shape;
    const outcome = this.change({
      type: "createElement",
      kind: reference.kind,
      ...(reference.name === undefined ? {} : { name: reference.name }),
      ...(reference.tags === undefined ? {} : { tags: reference.tags }),
      center: { x: position.x, y: position.y },
      size: { width, height },
    });
    const created = outcome?.ok ? outcome.created.elements[0] : undefined;
    const shape = created === undefined ? undefined : this.registry().get(created);
    return shape ? [shape as Element] : [];
  }

  /** Every caller checks the registry before it selects the result or opens an editor on it. */
  createShape(shape: Element, position: Point): Shape | undefined {
    return this.createElements([shape], position)[0] as Shape | undefined;
  }

  connect(source: Element, target: Element): Connection | undefined {
    if (!isElementShape(source) || !isElementShape(target)) return undefined;
    const outcome = this.change({
      type: "createRelationship",
      sourceId: source.c4.id,
      destinationId: target.c4.id,
    });
    const key = outcome?.ok ? outcome.created.relationships[0] : undefined;
    if (key === undefined) return undefined;
    return this.registry().get(relationshipCanvasId(key)) as Connection | undefined;
  }

  createConnection(source: Element, target: Element): Connection | undefined {
    return this.connect(source, target);
  }

  resizeShape(shape: Element, newBounds: Box): void {
    if (!isElementShape(shape)) return;
    const { x, y, width, height } = newBounds;
    this.change({
      type: "setLayout",
      boxes: new Map([[shape.c4.id, { x, y, width, height }]]),
      vertices: new Map(),
    });
  }

  /** Bendpoint and segment moves: the inner waypoints are the vertices; the ends dock again. */
  updateWaypoints(connection: Element, newWaypoints: readonly Point[]): void {
    if (!isRelationshipConnection(connection)) return;
    const inner = newWaypoints.slice(1, -1).map(({ x, y }) => ({ x, y }));
    this.change({
      type: "setLayout",
      boxes: new Map(),
      vertices: new Map([[connection.c4.key, inner.length > 0 ? inner : null]]),
    });
  }

  /** The smart delete of Delete and Backspace (SPEC 5.4); boundaries are never deleted. */
  removeElements(elements: readonly Element[]): void {
    const ids = elements.filter(isElementShape).map((shape) => shape.c4.id);
    const relationships = elements.filter(isRelationshipConnection).map(({ c4 }) => c4.key);
    if (ids.length === 0 && relationships.length === 0) return;
    this.change({ type: "smartDelete", ids, relationships });
  }

  removeShape(shape: Element): void {
    this.removeElements([shape]);
  }

  removeConnection(connection: Element): void {
    this.removeElements([connection]);
  }

  /** The scene lays every relationship out. */
  layoutConnection(): void {
    return undefined;
  }

  appendShape(): never {
    throw new C4UnsupportedOperationError("appendShape");
  }

  reconnect(): never {
    throw new C4UnsupportedOperationError("reconnect");
  }

  reconnectStart(): never {
    throw new C4UnsupportedOperationError("reconnectStart");
  }

  reconnectEnd(): never {
    throw new C4UnsupportedOperationError("reconnectEnd");
  }

  distributeElements(): never {
    throw new C4UnsupportedOperationError("distributeElements");
  }

  alignElements(): never {
    throw new C4UnsupportedOperationError("alignElements");
  }

  createSpace(): never {
    throw new C4UnsupportedOperationError("createSpace");
  }

  replaceShape(): never {
    throw new C4UnsupportedOperationError("replaceShape");
  }

  toggleCollapse(): never {
    throw new C4UnsupportedOperationError("toggleCollapse");
  }

  createLabel(): never {
    throw new C4UnsupportedOperationError("createLabel");
  }

  moveConnection(): never {
    throw new C4UnsupportedOperationError("moveConnection");
  }

  updateAttachment(): never {
    throw new C4UnsupportedOperationError("updateAttachment");
  }

  // The domain methods (SPEC 1.3).

  editElement(id: ElementId, fields: Partial<ElementFields>): EditOutcome | undefined {
    return this.change({ type: "updateElement", id, fields });
  }

  editRelationship(
    key: RelationshipKey,
    fields: Partial<RelationshipFields>,
  ): EditOutcome | undefined {
    return this.change({ type: "updateRelationship", key, fields });
  }

  renameIdentifier(id: ElementId, identifier: string): EditOutcome | undefined {
    return this.change({ type: "renameIdentifier", id, identifier });
  }

  removeFromView(
    ids: readonly ElementId[],
    relationships: readonly RelationshipKey[],
  ): EditOutcome | undefined {
    return this.change({ type: "removeFromView", ids, relationships });
  }

  deleteFromModel(
    ids: readonly ElementId[],
    relationships: readonly RelationshipKey[],
  ): EditOutcome | undefined {
    return this.change({ type: "deleteFromModel", ids, relationships });
  }

  includeInView(ids: readonly ElementId[]): EditOutcome | undefined {
    return this.change({ type: "includeInView", ids });
  }

  createView(type: StaticViewType, scopeId?: ElementId, title?: string): EditOutcome | undefined {
    return this.change({
      type: "createView",
      viewType: type,
      ...(scopeId === undefined ? {} : { scopeId }),
      ...(title === undefined ? {} : { title }),
    });
  }

  editView(
    key: ViewKey,
    fields: { title?: string | null; description?: string | null },
  ): EditOutcome | undefined {
    return this.change({ type: "updateView", key, fields });
  }

  deleteView(key: ViewKey): EditOutcome | undefined {
    return this.change({ type: "deleteView", key });
  }

  layOutAutomatically(): EditOutcome | undefined {
    return this.change({ type: "clearLayout" });
  }

  editWorkspace(fields: { name?: string; description?: string }): EditOutcome | undefined {
    return this.change({ type: "updateWorkspace", fields });
  }

  applyC4Colours(): EditOutcome | undefined {
    return this.change({ type: "applyC4Colours" });
  }

  insertExample(exampleText: string): EditOutcome | undefined {
    return this.change({ type: "insertExample", exampleText });
  }

  /**
   * Computes and verifies the edit before anything executes: a refusal leaves no command, no
   * change event and every shape where it was (a dragged one snaps back).
   */
  private change(edit: C4Edit): EditOutcome {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) {
      return this.refuse({ ok: false, reason: "read-only", message: READ_ONLY_MESSAGE });
    }
    const store = this.store();
    const state = store.current();
    const scene = this.scenes().current();
    const outcome = this.engine().applyEdit(state.parse, edit, {
      view: state.view,
      boxes: scene.boxes,
      vertices: scene.vertices,
      fresh: state.fresh,
      identifiers:
        this.injector.get<C4ModelingConfig>("config.c4Modeling", false)?.identifiers ?? "readable",
      random: randomSuffix,
    });
    if (!outcome.ok) return this.refuse(outcome);
    if (outcome.text === state.parse.text && outcome.view === state.view) return outcome;
    const afterHash = hashText(outcome.text);
    store.remember(outcome.document, afterHash);
    const context: DocumentChangeContext = {
      label: edit.type,
      edits: outcome.edits,
      inverse: outcome.inverse,
      beforeHash: store.textHash(),
      afterHash,
      viewBefore: state.view,
      viewAfter: outcome.view,
      viewCause: viewCauseOf(edit, state.view, outcome.view),
      freshBefore: state.fresh,
      freshAfter: outcome.fresh,
      idChanges: outcome.idChanges,
    };
    this.commands.execute(DOCUMENT_CHANGE, context);
    for (const notice of outcome.notices) this.bus.fire(EDIT_NOTICE_EVENT, { notice });
    return outcome;
  }

  private refuse(refusal: Refusal): Refusal {
    const event: EditRefusedEvent = {
      reason: refusal.reason as EditRefusal,
      message: refusal.message,
    };
    this.bus.fire(EDIT_REFUSED_EVENT, event);
    return refusal;
  }

  /**
   * The element shapes a move takes along: a boundary brings the members it frames and the
   * boundaries nested in it (SPEC 5.2), also for a keyboard nudge, which no drag start extended.
   */
  private movedClosure(shapes: readonly Element[]) {
    const moved = new Map(
      shapes.filter(isElementShape).map((shape) => [shape.c4.id, shape] as const),
    );
    const boundaries = shapes.filter(isBoundaryShape).map((shape) => shape.c4.id);
    if (boundaries.length > 0) {
      const state = this.store().current();
      const members = this.engine().members(state.parse.workspace, this.views().active());
      for (const id of framedClosure(members, boundaries).elements) {
        const member = this.registry().get(id);
        if (isElementShape(member)) moved.set(id, member);
      }
    }
    return [...moved.values()];
  }

  private store(): DocumentStore {
    return this.injector.get<DocumentStore>("c4Document");
  }

  private scenes(): SceneService {
    return this.injector.get<SceneService>("c4Scene");
  }

  private views(): ViewService {
    return this.injector.get<ViewService>("c4Views");
  }

  private engine(): C4Engine {
    return this.injector.get<C4Engine>("c4Engine");
  }

  private registry(): ElementRegistry {
    return this.injector.get<ElementRegistry>("elementRegistry");
  }
}

function viewCauseOf(
  edit: C4Edit,
  before: ViewKey,
  after: ViewKey,
): DocumentChangeContext["viewCause"] {
  if (before === after) return undefined;
  if (edit.type === "createView") return "user";
  if (edit.type === "renameIdentifier" || edit.type === "updateElement") return "rekey";
  return "removed";
}
