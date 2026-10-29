import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import { POPUP_PROVIDER_ID } from "../popup/index.js";
import { STICKY_STYLES } from "../draw/styles.js";

interface ConnectionPreviewLike {
  drawPreview(context: object, canConnect: unknown, hints: object): void;
  cleanUp(context: object): void;
}

interface LabelEditingLike {
  activate(element: object): void;
}

interface PopupMenuLike {
  open(target: object, providerId: string, position: { x: number; y: number }): void;
  isOpen(): boolean;
}

interface ModelingLike {
  removeElements(elements: object[]): void;
}

interface CanvasLike {
  getAbsoluteBBox(element: object): { x: number; y: number; width: number; height: number };
  getContainer(): HTMLElement;
}

interface SourceShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CreatedShape {
  id?: string;
  eventStormingType?: string;
  eventStormingLabel?: string;
  /** Blank append sticky awaiting its kind — see EventStormingElementFactory.createProvisional. */
  provisional?: boolean;
  /** Unset again once the shape leaves the canvas (e.g. undo of the create). */
  parent?: object | null;
}

interface ElementRegistryLike {
  get(id: string): unknown;
}

interface GesturesLike {
  holdDrop(): () => void;
}

interface CreateEvent {
  x: number;
  y: number;
  context: {
    source?: SourceShape;
    shape?: CreatedShape;
    canExecute?: { connect?: unknown } | false | null;
  };
}

// diagram-js runs listeners in descending priority order; the default create.end handler (creation)
// sits at 1000 -> with < 1000 we run AFTERWARDS, once the shape already exists.
const AFTER_CREATE = 500;

/** Gap (px) between the placed sticky's bottom edge and the kind-chooser popup. */
const CHOOSER_GAP = 6;

/** The kind a blank append sticky holds until the user picks one (`createProvisional`). */
const PLACEHOLDER_KIND = "event";

/**
 * Behavior for "append sticky" (`create.start` with `context.source`):
 *  1. LIVE arrow preview from the source to the cursor (analogous to diagram-js ConnectPreview,
 *     but in the create flow) — requires the `connectionPreview` service (ConnectionPreviewModule).
 *  2. After creation of the provisional (blank) sticky, opens the change-type popup on it so the
 *     user picks the kind first; the retype then hands over to the label editor (step 2 of the
 *     chain). Dismissing the popup without choosing removes the blank sticky (and thereby its
 *     auto-arrow) again.
 * Both only when `context.source` is set; ordinary palette-create stays untouched.
 *
 * The step after the placement belongs to the drop (`eventStormingGestures.holdDrop`): a host that
 * imports from the change listener of the create waits for it, so the popup or the editor opens
 * on the sticky the user placed. The import then replaces that sticky, and the popup reopens on
 * the sticky with its id while that one is still blank (contract L1, keep and reopen). A host
 * that echoes the retype replaces the sticky again before the label editor opens, so the editor
 * opens on the sticky with that id.
 */
export default class EventStormingAppendBehavior {
  static $inject = ["injector", "eventBus"];

  constructor(injector: Injector, eventBus: EventBus) {
    const connectionPreview = injector.get(
      "connectionPreview",
      false,
    ) as ConnectionPreviewLike | null;
    const labelEditing = injector.get(
      "eventStormingLabelEditing",
      false,
    ) as LabelEditingLike | null;
    const popupMenu = injector.get("popupMenu", false) as PopupMenuLike | null;
    const modeling = injector.get("modeling", false) as ModelingLike | null;
    const canvas = injector.get("canvas", false) as CanvasLike | null;
    const elementRegistry = injector.get("elementRegistry", false) as ElementRegistryLike | null;
    const gestures = injector.get("eventStormingGestures", false) as GesturesLike | null;

    // The chain steps run deferred (setTimeout) — after a teardown they must become no-ops
    // instead of executing commands on a destroyed diagram.
    let destroyed = false;
    eventBus.on("diagram.destroy", () => {
      destroyed = true;
    });

    // (1) arrow preview
    if (connectionPreview) {
      eventBus.on("create.move", (event: CreateEvent) => {
        const { context } = event;
        const source = context.source;
        if (!source) return;
        const canConnect =
          context.canExecute && (context.canExecute as { connect?: unknown }).connect;
        connectionPreview.drawPreview(context, canConnect ?? false, {
          source,
          connectionStart: { x: source.x + source.width / 2, y: source.y + source.height / 2 },
          connectionEnd: { x: event.x, y: event.y },
        });
      });

      eventBus.on(
        ["create.end", "create.cancel", "create.cleanup"],
        (event: { context: object }) => {
          connectionPreview.cleanUp(event.context);
        },
      );
    }

    /**
     * Kind chooser on the freshly placed blank sticky. Choose vs dismiss is decided AT close
     * time: picking a kind runs the retype action — which clears `provisional` and auto-closes
     * the popup via `commandStack.changed` — BEFORE the close event, so a shape still
     * provisional on close means nothing was chosen.
     */
    const openKindChooser = (shape: CreatedShape) => {
      if (destroyed || !shape.parent || !popupMenu || !modeling || !canvas) return;
      // Anchor right below the placed sticky (client coords — the popup is position: fixed).
      const bbox = canvas.getAbsoluteBBox(shape);
      const container = canvas.getContainer().getBoundingClientRect();
      popupMenu.open(shape, POPUP_PROVIDER_ID, {
        x: container.left + bbox.x,
        y: container.top + bbox.y + bbox.height + CHOOSER_GAP,
      });
      if (!popupMenu.isOpen()) {
        // No chooser came up (e.g. a vetoed open): a blank sticky without one is unusable.
        modeling.removeElements([shape]);
        return;
      }
      eventBus.once("popupMenu.close", () => {
        // Deferred: the close event fires INSIDE PopupMenu.close() — executing a command here
        // would re-enter close() via its auto-close binding, and the label editor would lose
        // focus to the popup teardown's focus restore.
        setTimeout(() => {
          if (destroyed) return;
          if (shape.provisional) {
            // Dismissed without choosing: the blank sticky goes away, its auto-arrow with it —
            // unless something else (e.g. undo of the create) already removed it.
            if (shape.parent) {
              modeling.removeElements([shape]);
              return;
            }
            const replacement = blankReplacementOf(shape);
            if (replacement) reopenKindChooser(replacement);
            return;
          }
          // A host that echoes the retype imports inside its change listener, before this runs.
          const named = shape.parent ? shape : replacementOf(shape);
          if (named) labelEditing?.activate(named);
        }, 0);
      });
    };

    /** The sticky an import put on the board in the place of `shape`: the same id. */
    const replacementOf = (shape: CreatedShape): CreatedShape | undefined => {
      if (shape.id === undefined) return undefined;
      const element = elementRegistry?.get(shape.id) as CreatedShape | undefined;
      return element && element !== shape && element.parent ? element : undefined;
    };

    /**
     * The sticky an import put in the place of `shape`: the same id, and still the blank event the
     * placeholder exports as (its empty label is written as the kind's default name), so nobody
     * has given it a kind or a label meanwhile.
     */
    const blankReplacementOf = (shape: CreatedShape): CreatedShape | undefined => {
      const element = replacementOf(shape);
      if (!element) return undefined;
      const label = element.eventStormingLabel ?? "";
      const blank =
        element.eventStormingType === PLACEHOLDER_KIND &&
        (label === "" || label === STICKY_STYLES[PLACEHOLDER_KIND].label);
      return blank ? element : undefined;
    };

    /**
     * Back to the placeholder the user placed. The empty label exports as the default name it
     * came back with, so the document stays as imported, and the label editor that follows the
     * kind opens empty, as it does without the import.
     */
    const reopenKindChooser = (shape: CreatedShape) => {
      shape.provisional = true;
      shape.eventStormingLabel = "";
      eventBus.fire("element.changed", { element: shape });
      openKindChooser(shape);
    };

    // (2) post-placement chain: provisional stickies get the kind chooser first (label editing
    // follows the retype); a non-provisional append opens the label editor directly.
    eventBus.on("create.end", AFTER_CREATE, (event: CreateEvent) => {
      const { context } = event;
      if (!context.source || !context.canExecute || !context.shape) return;
      const shape = context.shape;
      const release = gestures?.holdDrop();
      const afterDrop = (step: () => void) => () => {
        try {
          step();
        } finally {
          release?.();
        }
      };
      if (shape.provisional && popupMenu && modeling && canvas) {
        // Open only after render/cleanup — like the label edit below, plus the create's own
        // commandStack.changed would auto-close a popup opened synchronously.
        const original = (event as { originalEvent?: Event }).originalEvent;
        if (original?.type === "mousedown") {
          // Click-to-place: the create ends on MOUSEDOWN, so the gesture's trailing click is
          // still pending — it would hit the freshly opened popup as an outside click and
          // dismiss it (removing the blank sticky right away). Open after that click passed;
          // the timeout covers gestures whose click never fires (e.g. mouseup off-window).
          const openAfterClick = () => {
            document.removeEventListener("click", openAfterClick, true);
            clearTimeout(fallback);
            setTimeout(
              afterDrop(() => openKindChooser(shape)),
              0,
            );
          };
          document.addEventListener("click", openAfterClick, true);
          const fallback = setTimeout(openAfterClick, 300);
          return;
        }
        setTimeout(
          afterDrop(() => openKindChooser(shape)),
          0,
        );
        return;
      }
      if (!labelEditing) {
        release?.();
        return;
      }
      // Activate only after render/cleanup so the editor is positioned correctly.
      setTimeout(
        afterDrop(() => labelEditing.activate(shape)),
        0,
      );
    });
  }
}
