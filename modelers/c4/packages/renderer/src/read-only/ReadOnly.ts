import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";

/** Fired with `{ readOnly }` whenever the lock changes. */
export const READ_ONLY_CHANGED_EVENT = "readOnly.changed";

/** Above every edit rule of the renderer and diagram-js, so the lock wins. */
const LOCK_PRIORITY = 5000;

const EDIT_RULES = [
  "elements.move",
  "shape.move",
  "shape.resize",
  "shape.create",
  "elements.create",
  "elements.delete",
  "connection.start",
  "connection.create",
  "connection.updateWaypoints",
];

interface Interruptible {
  cancel(): void;
}

/**
 * The canvas's own lock for a document it cannot save (an invalid file in the IDE host, guide
 * §13.5), toggled together with `shell.setReadOnly`: the rules veto every edit, the label editor
 * stays shut. Selection, lasso, hand, zoom and export keep working.
 */
export default class ReadOnly extends RuleProvider {
  static override $inject = ["eventBus", "injector"];

  private readOnly = false;

  constructor(
    private readonly bus: EventBus,
    private readonly injector: Injector,
  ) {
    super(bus);
  }

  override init(): void {
    this.addRule(EDIT_RULES, LOCK_PRIORITY, () => (this.readOnly ? false : undefined));
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    if (readOnly) {
      // What was under way when the lock arrived must not land on the locked canvas.
      this.injector.get<Interruptible>("labelEditing", false)?.cancel();
      this.injector.get<Interruptible>("dragging", false)?.cancel();
    }
    this.bus.fire(READ_ONLY_CHANGED_EVENT, { readOnly });
  }
}
