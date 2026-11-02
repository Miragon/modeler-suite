import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type Gestures from "../gestures/Gestures.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import { isElementShape } from "../scene/types.js";
import type { C4Views } from "../services.js";

/** After diagram-js's create (1000) and its selection (500): the shape is registered and selected. */
const AFTER_THE_DROP = 250;
/** Ahead of diagram-js's own teardown. */
const FIRST = 100_000;

/**
 * The name editor a pointer create opens once diagram-js has cleaned its drag up (SPEC 1.9). The
 * hold on the user's action is taken in the drop's own handler: taken inside the timer, it would
 * come after the action's microtask, and an import from the drop's change event would already
 * have run. The step skips when the shape is gone or the view changed meanwhile, and a destroy
 * cancels it.
 */
export default class CreateNameEditor {
  static $inject = ["eventBus", "elementRegistry", "injector"];

  private timer: ReturnType<typeof setTimeout> | undefined;
  private release: (() => void) | undefined;
  private destroyed = false;

  constructor(
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: Injector,
  ) {
    eventBus.on("create.end", AFTER_THE_DROP, (event: { context: { shape?: Element } }) => {
      const created = event.context.shape;
      if (!isElementShape(created) || this.elementRegistry.get(created.id) !== created) return;
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
            if (labelEditing && labelEditing.openEdit()?.elementId !== created.c4.id) {
              labelEditing.activate(created);
            }
          }
        } finally {
          this.settle();
        }
      }, 0);
    });
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
