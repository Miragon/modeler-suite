import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Create from "diagram-js/lib/features/create/Create";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { Size } from "@miragon/c4-schema-model";
import type SceneLookup from "../draw/SceneLookup.js";
import type Gestures from "../gestures/Gestures.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import type C4Modeling from "../modeling/C4Modeling.js";
import { reveal } from "../navigation/reveal.js";
import type { CreatingEntry } from "../palette/PaletteProvider.js";
import { relationshipCanvasId } from "../reconcile/Reconciler.js";
import type { SceneNotation } from "../scene/notation.js";
import {
  c4ReferenceOf,
  isElementShape,
  isRelationshipConnection,
  type C4Connection,
  type C4ElementShape,
} from "../scene/types.js";
import { VIEW_CHANGED_EVENT, type C4ElementFactory, type C4Views } from "../services.js";

/** After diagram-js's Create (1000) and its preview (750), before the line is drawn (500). */
const KEEP_THE_APPEND = 600;
/** After diagram-js's CreatePreview (750) drew the dragged element, so the line ends on it. */
const AFTER_CREATE_PREVIEW = 500;
/** After the name editor's own `create.end` step (250) took its hold. */
const AFTER_THE_NAME_EDITOR = 200;
const LABEL_EDITOR_CLASS = "diagram-label-editor";

interface EditLock {
  isReadOnly(): boolean;
}

interface ConnectionPreview {
  drawPreview(context: object, canConnect: unknown, hints: object): void;
  cleanUp(context: object): void;
}

interface CreateContext {
  source?: Element;
  shape?: Element;
  target?: Element | null;
  canExecute?: false | null | { attach?: unknown; connect?: unknown };
}

interface Rules {
  allowed(action: string, context: object): unknown;
}

interface CreateEvent {
  x: number;
  y: number;
  context: CreateContext;
}

/** An appended element whose name editor, on Enter, goes on to its relationship's description. */
interface Followed {
  readonly element: C4ElementShape;
  readonly connection: C4Connection | undefined;
  readonly view: string;
}

/**
 * The context pad's append (the family's, SPEC 5.3): an element of a kind the view creates, with a
 * relationship from the selected element to it, as one edit and one undo step. A click places it
 * where the view places an element connected to the source (`placeUnplaced`: beside it, clear of
 * every box and frame, in its parent's frame without that frame reaching a stranger), a drag where
 * it is dropped, also over another element, with the relationship's line drawn from the source
 * while it follows the pointer. Its name editor opens, and Enter there goes on to the
 * relationship's description, Tab to the technology as after a connect; Escape, a click away or
 * another key on the canvas ends the chain.
 */
export default class C4Append {
  static $inject = ["eventBus", "canvas", "elementRegistry", "injector"];

  private followed: Followed | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private release: (() => void) | undefined;
  private check: ReturnType<typeof setTimeout> | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    // Over an element, a boundary or a line the create's rule answers null, so that nothing is
    // marked there: diagram-js would then drop a bare create, without the relationship.
    eventBus.on(["create.move", "create.hover"], KEEP_THE_APPEND, (event: CreateEvent) =>
      this.keepTheAppend(event.context),
    );
    eventBus.on("create.move", AFTER_CREATE_PREVIEW, (event: CreateEvent) => this.drawLine(event));
    eventBus.on(["create.end", "create.cancel", "create.cleanup"], (event: CreateEvent) => {
      this.connectionPreview()?.cleanUp(event.context);
    });
    eventBus.on("create.end", AFTER_THE_NAME_EDITOR, (event: CreateEvent) =>
      this.followDrop(event.context),
    );
    eventBus.on(
      [
        "element.mousedown",
        "element.dblclick",
        "drag.init",
        "keyboard.keydown",
        VIEW_CHANGED_EVENT,
      ],
      () => this.forget(),
    );
    // A label commit by a click on the chrome, or Tab past the last field, ends the chain too:
    // only Enter goes on, and its own step is already scheduled when the commit runs.
    eventBus.on("commandStack.changed", () => {
      if (!this.followed || this.timer !== undefined) return;
      clearTimeout(this.check);
      this.check = setTimeout(() => this.forgetUnlessEditing(), 0);
    });
    canvas.getContainer().addEventListener("keydown", this.onEditorKey, true);
    eventBus.on("diagram.destroy", () => {
      canvas.getContainer().removeEventListener("keydown", this.onEditorKey, true);
      this.forget();
    });
  }

  /** A click on an append entry: placed beside the source. */
  append(source: C4ElementShape, entry: CreatingEntry): void {
    if (this.isLocked()) return;
    const modeling = this.injector.get<C4Modeling>("modeling");
    const outcome = modeling.appendElement(source.c4.id, entry.kind, entry.tags);
    if (!outcome?.ok) return;
    const created = this.elementRegistry.get(outcome.created.elements[0] ?? "");
    const key = outcome.created.relationships[0];
    const connection =
      key === undefined
        ? undefined
        : (this.elementRegistry.get(relationshipCanvasId(key)) as Element | undefined);
    if (!isElementShape(created)) return;
    this.injector.get<Selection>("selection", false)?.select(created);
    reveal(this.injector, [created]);
    this.canvas.focus();
    if (this.labelEditing()?.activate(created)) this.follow(created, connection);
  }

  /** A drag from an append entry: diagram-js's create, whose drop appends (`appendShape`). */
  startAppend(event: Event, source: C4ElementShape, entry: CreatingEntry): void {
    if (this.isLocked()) return;
    const factory = this.injector.get<C4ElementFactory>("c4ElementFactory");
    const shape = factory.createNew(entry.kind, undefined, entry.tags);
    const size = this.sizeOf(entry);
    if (size) Object.assign(shape, size);
    this.injector.get<Create>("create").start(event as MouseEvent, shape, { source });
  }

  /** The look an entry's element lands in, for its pad entry and its drag. */
  lookOf(entry: CreatingEntry) {
    return this.injector
      .get<SceneLookup>("c4SceneLookup", false)
      ?.createdStyle(entry.kind, entry.tags ?? []);
  }

  private sizeOf(entry: CreatingEntry): Size | undefined {
    const look = this.lookOf(entry);
    const notation = this.injector.get<SceneNotation>("c4Notation", false);
    if (!look || !notation) return undefined;
    const fallback = notation.defaultSize(look.shape);
    return { width: look.width ?? fallback.width, height: look.height ?? fallback.height };
  }

  /** A drop the create allows (`null`, on the canvas it last hovered) appends there too. */
  private keepTheAppend(context: CreateContext): void {
    const { source, shape, target } = context;
    if (context.canExecute !== null || !isElementShape(source) || !shape || !target) return;
    const rules = this.injector.get<Rules>("rules");
    const connect = rules.allowed("connection.create", { source, target: shape });
    if (connect) context.canExecute = { attach: false, connect };
  }

  /** The relationship's line from the source to the outline of the element under the pointer. */
  private drawLine({ x, y, context }: CreateEvent): void {
    const { source, shape } = context;
    if (!isElementShape(source) || !shape) return;
    const preview = this.connectionPreview();
    if (!preview) return;
    const allowed = typeof context.canExecute === "object" && context.canExecute?.connect;
    const { id, width, height } = shape as Shape;
    const c4 = c4ReferenceOf(shape);
    const target = { id, c4, x: x - width / 2, y: y - height / 2, width, height };
    preview.drawPreview(context, allowed || false, { source, target, noNoop: true });
  }

  private followDrop(context: CreateContext): void {
    const { source, shape } = context;
    if (!isElementShape(source) || !isElementShape(shape)) return;
    if (this.elementRegistry.get(shape.id) !== shape) return;
    const connection = (shape.incoming ?? []).find(
      (candidate: Connection) => candidate.source === source,
    );
    this.follow(shape, connection);
  }

  private follow(element: C4ElementShape, connection: Element | undefined): void {
    this.forget();
    this.followed = {
      element,
      connection: isRelationshipConnection(connection) ? connection : undefined,
      view: this.views().active().key,
    };
  }

  /**
   * In the capture phase on the container: the label editor stops its keys from reaching the
   * page. Enter commits there first; the step after it waits for the commit, holding the user's
   * action, so an import from the commit's change event waits until the next editor is open.
   */
  private readonly onEditorKey = (event: KeyboardEvent): void => {
    const followed = this.followed;
    const field = event.target;
    if (!followed || !(field instanceof HTMLTextAreaElement)) return;
    if (!field.classList.contains(LABEL_EDITOR_CLASS)) return;
    const open = this.labelEditing()?.openEdit();
    if (!open || open.elementId !== followed.element.c4.id) return;
    if (event.key === "Escape") {
      this.forget();
      return;
    }
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    if (event.shiftKey && open.field === "description") return;
    this.settle();
    this.release = this.injector.get<Gestures>("gestures", false)?.holdAction();
    this.timer = setTimeout(() => {
      try {
        this.goOn(followed);
      } finally {
        this.settle();
      }
    }, 0);
  };

  /** Once the element's editor closed on Enter: its relationship's description editor. */
  private goOn(followed: Followed): void {
    const labelEditing = this.labelEditing();
    // A refused value keeps the field open, and the next Enter tries again.
    if (!labelEditing || labelEditing.isActive()) return;
    this.followed = undefined;
    const { connection } = followed;
    if (!connection || this.elementRegistry.get(connection.id) !== connection) return;
    if (this.views().active().key !== followed.view) return;
    this.injector.get<Selection>("selection", false)?.select(connection);
    labelEditing.activate(connection, "description");
  }

  private forgetUnlessEditing(): void {
    this.check = undefined;
    const followed = this.followed;
    if (!followed || this.timer !== undefined) return;
    if (this.labelEditing()?.openEdit()?.elementId === followed.element.c4.id) return;
    this.followed = undefined;
  }

  private forget(): void {
    this.followed = undefined;
    clearTimeout(this.check);
    this.check = undefined;
    this.settle();
  }

  private settle(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const release = this.release;
    this.release = undefined;
    release?.();
  }

  private labelEditing(): LabelEditing | undefined {
    return this.injector.get<LabelEditing>("labelEditing", false) ?? undefined;
  }

  private connectionPreview(): ConnectionPreview | undefined {
    return this.injector.get<ConnectionPreview>("connectionPreview", false) ?? undefined;
  }

  private views(): C4Views {
    return this.injector.get<C4Views>("c4Views");
  }

  private isLocked(): boolean {
    return this.injector.get<EditLock>("readOnly", false)?.isReadOnly() === true;
  }
}
