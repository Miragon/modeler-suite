import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type BaseEditorActions from "diagram-js/lib/features/editor-actions/EditorActions";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import { isStickyShape, type StickyShape } from "../model/di-types.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";
import type { MoveDirection } from "../modeling/CanvasModeling.js";
import type LabelEditing from "../label-editing/LabelEditing.js";

interface Toggle {
  toggle(): void;
}

interface EditLock {
  isReadOnly(): boolean;
}

/** Runs before the keyboard bindings (priority 500) look up the registered actions. */
const HIGH_PRIORITY = 1500;

/** The actions the keyboard bindings and hosts trigger, beyond diagram-js's own. */
export default class EditorActions {
  static $inject = ["eventBus", "injector"];

  constructor(eventBus: EventBus, injector: Injector) {
    eventBus.on(
      "editorActions.init",
      HIGH_PRIORITY,
      (event: { editorActions: BaseEditorActions }) => {
        const { editorActions } = event;
        const service = <T>(name: string) => injector.get<T>(name, false);
        const handTool = service<Toggle>("handTool");
        const lassoTool = service<Toggle>("lassoTool");
        const selection = service<Selection>("selection");
        const registry = service<ElementRegistry>("elementRegistry");
        const labelEditing = service<LabelEditing>("labelEditing");
        const modeling = service<CanvasModeling>("canvasModeling");
        const readOnly = service<EditLock>("readOnly");
        const onlySticky = (): StickyShape | undefined => {
          const [selected, ...more] = selection?.get() ?? [];
          return isStickyShape(selected) && more.length === 0 ? selected : undefined;
        };
        if (modeling) {
          editorActions.register({
            moveSticky: (options: { direction: MoveDirection }) => {
              const sticky = onlySticky();
              if (sticky && !readOnly?.isReadOnly())
                modeling.moveByKey(sticky.id, options.direction);
            },
          });
        }
        if (handTool) editorActions.register({ handTool: () => handTool.toggle() });
        if (lassoTool) editorActions.register({ lassoTool: () => lassoTool.toggle() });
        if (selection && registry) {
          editorActions.register({
            selectAll: () => selection.select(registry.filter(isStickyShape)),
          });
        }
        if (selection && labelEditing) {
          editorActions.register({
            labelEditing: () => {
              const sticky = onlySticky();
              if (sticky) labelEditing.activate(sticky);
            },
          });
        }
      },
    );
  }
}
