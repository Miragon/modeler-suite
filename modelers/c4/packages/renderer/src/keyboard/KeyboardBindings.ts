import BaseKeyboardBindings from "diagram-js/lib/features/keyboard/KeyboardBindings";
import { hasModifier, isCmd, isKey } from "diagram-js/lib/features/keyboard/KeyboardUtil";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type EditorActions from "diagram-js/lib/features/editor-actions/EditorActions";
import type Keyboard from "diagram-js/lib/features/keyboard/Keyboard";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";

interface KeyContext {
  keyEvent: KeyboardEvent;
}

export interface KeyboardConfig {
  /**
   * The contract's `undoRedoKeys` option: bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y to the
   * canvas history (default true). A host that owns the history (VS Code) passes false, and the
   * keys reach it unprevented.
   */
  undoRedoKeys?: boolean | undefined;
}

const UNDO_REDO_ACTIONS = new Set(["undo", "redo"]);

/** Ahead of diagram-js's own Delete binding, which ignores the modifiers. */
const BEFORE_THE_DELETE_BINDING = 1500;

/**
 * diagram-js's bindings (delete, the arrows, zoom, …) on the focused canvas, plus the keys of
 * SPEC 5.7: L (lasso), H (hand), C (connect), E (the name, a relationship's description),
 * Shift+Delete ("Delete from model…"), Escape (clears the selection, as Team Topologies' does) and
 * Cmd/Ctrl+A: diagram-js binds no select all, and an unprevented one reaches VS Code, whose
 * Select All then selects the chrome's text. Enter, U and G are the navigation's (`c4Navigation`),
 * which the viewer has too.
 */
export default class KeyboardBindings extends BaseKeyboardBindings {
  static override $inject = ["eventBus", "keyboard", "config.diagramKeyboard", "injector"];

  private readonly undoRedoKeys: boolean;

  constructor(
    eventBus: EventBus,
    keyboard: Keyboard,
    config: KeyboardConfig | undefined,
    private readonly injector: Injector,
  ) {
    super(eventBus, keyboard);
    this.undoRedoKeys = config?.undoRedoKeys ?? true;
  }

  override registerBindings(keyboard: Keyboard, editorActions: EditorActions): void {
    // Hiding undo and redo from the stock bindings leaves those keys unprevented.
    const bound = this.undoRedoKeys
      ? editorActions
      : (Object.create(editorActions, {
          isRegistered: {
            value: (action: string) =>
              !UNDO_REDO_ACTIONS.has(action) && editorActions.isRegistered(action),
          },
        }) as EditorActions);
    super.registerBindings(keyboard, bound);

    const addListener = (
      action: string,
      listener: (context: KeyContext) => boolean | undefined,
      priority?: number,
    ) => {
      if (!editorActions.isRegistered(action)) return;
      if (priority === undefined) keyboard.addListener(listener as never);
      else keyboard.addListener(priority, listener as never);
    };
    const bindKey = (action: string, keys: string[]) =>
      addListener(action, ({ keyEvent }) => {
        if (!isKey(keys, keyEvent) || hasModifier(keyEvent)) return undefined;
        editorActions.trigger(action, {});
        return true;
      });
    bindKey("lassoTool", ["l", "L"]);
    bindKey("handTool", ["h", "H"]);
    bindKey("globalConnectTool", ["c", "C"]);
    bindKey("labelEditing", ["e", "E"]);
    addListener(
      "deleteFromModel",
      ({ keyEvent }) => {
        const onlyShift =
          keyEvent.shiftKey && !keyEvent.ctrlKey && !keyEvent.metaKey && !keyEvent.altKey;
        if (!onlyShift || !isKey(["Delete", "Backspace"], keyEvent)) return undefined;
        editorActions.trigger("deleteFromModel", {});
        return true;
      },
      BEFORE_THE_DELETE_BINDING,
    );
    addListener("selectAll", ({ keyEvent }) => {
      if (!isCmd(keyEvent) || !isKey(["a", "A"], keyEvent) || keyEvent.shiftKey) return undefined;
      editorActions.trigger("selectAll", {});
      return true;
    });
    keyboard.addListener((({ keyEvent }: KeyContext) => this.clearSelection(keyEvent)) as never);
  }

  /**
   * Escape with nothing selected stays unhandled, so it reaches the host; during a drag or an armed
   * tool it is diagram-js's, which cancels on the key's release.
   */
  private clearSelection(keyEvent: KeyboardEvent): boolean | undefined {
    if (!isKey(["Escape", "Esc"], keyEvent) || hasModifier(keyEvent)) return undefined;
    const selection = this.injector.get<Selection>("selection", false);
    if (!selection || selection.get().length === 0) return undefined;
    if (this.injector.get<Dragging>("dragging", false)?.context()) return undefined;
    selection.select([]);
    return true;
  }
}
