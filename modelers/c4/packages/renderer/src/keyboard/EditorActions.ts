import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type BaseEditorActions from "diagram-js/lib/features/editor-actions/EditorActions";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import type C4Dialogs from "../navigation/C4Dialogs.js";
import type Navigation from "../navigation/Navigation.js";
import { isElementShape, isRelationshipConnection } from "../scene/types.js";
import type LabelEditing from "../label-editing/LabelEditing.js";

interface Toggle {
  toggle(): void;
}

interface EditLock {
  isReadOnly(): boolean;
}

/** Runs before the keyboard bindings (priority 500) look up the registered actions. */
const HIGH_PRIORITY = 1500;

/**
 * The actions the keyboard bindings and hosts trigger, beyond diagram-js's own: the tools, select
 * all, the label editor, "Delete from model…" (SPEC 5.4) and the navigation of SPEC 4.5.
 */
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
        const globalConnect = service<Toggle>("globalConnect");
        const selection = service<Selection>("selection");
        const registry = service<ElementRegistry>("elementRegistry");
        const labelEditing = service<LabelEditing>("labelEditing");
        const dialogs = service<C4Dialogs>("c4Dialogs");
        const navigation = service<Navigation>("c4Navigation");
        const locked = () => service<EditLock>("readOnly")?.isReadOnly() === true;
        if (handTool) editorActions.register({ handTool: () => handTool.toggle() });
        if (lassoTool) editorActions.register({ lassoTool: () => lassoTool.toggle() });
        if (globalConnect) {
          editorActions.register({
            globalConnectTool: () => {
              if (!locked()) globalConnect.toggle();
            },
          });
        }
        if (selection && registry) {
          editorActions.register({
            selectAll: () => selection.select(registry.filter(isElementShape)),
          });
        }
        if (selection && labelEditing) {
          editorActions.register({
            labelEditing: () => {
              const [selected, ...more] = selection.get();
              if (more.length > 0) return;
              if (isElementShape(selected) || isRelationshipConnection(selected)) {
                labelEditing.activate(selected);
              }
            },
          });
        }
        if (selection && dialogs) {
          editorActions.register({
            deleteFromModel: () => {
              if (locked()) return;
              const selected = selection.get();
              const ids = selected.filter(isElementShape).map((shape) => shape.c4.id);
              const relationships = selected
                .filter(isRelationshipConnection)
                .filter((connection) => !connection.c4.implied)
                .map((connection) => connection.c4.key);
              dialogs.deleteFromModel({ ids, relationships });
            },
          });
        }
        if (navigation) {
          editorActions.register({
            openChildView: () => navigation.openSelectedChild(),
            parentView: () => navigation.openParent(),
            showViews: () => navigation.showViews(),
          });
        }
      },
    );
  }
}
