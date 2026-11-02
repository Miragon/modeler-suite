import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type Gestures from "../gestures/Gestures.js";
import { isRelationshipConnection } from "../scene/types.js";
import type { C4Views } from "../services.js";
import type LabelEditing from "./LabelEditing.js";

/** After diagram-js's connect (1000) and its selection (500): the relationship is drawn and selected. */
const AFTER_THE_SELECTION = 250;
/** Ahead of diagram-js's own teardown. */
const FIRST = 100_000;

/**
 * The description editor a new relationship opens once diagram-js has cleaned its connect up, as
 * a pointer create opens the name editor (`CreateNameEditor`); Tab goes on to the technology. The
 * hold on the user's action is taken in the drop's own handler, so an import from the drop's
 * change event waits until the editor is open, and then keeps it. The step skips when the
 * relationship is gone or the view changed meanwhile, and a destroy cancels it.
 */
export default class ConnectLabelEditor {
  static $inject = ["eventBus", "elementRegistry", "injector"];

  private timer: ReturnType<typeof setTimeout> | undefined;
  private release: (() => void) | undefined;
  private destroyed = false;

  constructor(
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on(
      "connect.end",
      AFTER_THE_SELECTION,
      (event: { context: { connection?: Element | null } }) => {
        const created = event.context.connection;
        if (
          !isRelationshipConnection(created) ||
          this.elementRegistry.get(created.id) !== created
        ) {
          return;
        }
        this.settle();
        this.release = this.injector.get<Gestures>("gestures", false)?.holdAction();
        const viewAtDrop = this.views().active().key;
        this.timer = setTimeout(() => {
          try {
            if (
              !this.destroyed &&
              this.elementRegistry.get(created.id) === created &&
              this.views().active().key === viewAtDrop
            ) {
              const labelEditing = this.injector.get<LabelEditing>("labelEditing", false);
              if (labelEditing && labelEditing.openEdit()?.elementId !== created.c4.key) {
                labelEditing.activate(created, "description");
              }
            }
          } finally {
            this.settle();
          }
        }, 0);
      },
    );
    eventBus.on("diagram.destroy", FIRST, () => {
      this.destroyed = true;
      this.settle();
    });
  }

  private views(): C4Views {
    return this.injector.get<C4Views>("c4Views");
  }

  private settle(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const release = this.release;
    this.release = undefined;
    release?.();
  }
}
