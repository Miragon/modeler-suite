import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Create from "diagram-js/lib/features/create/Create";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type Mouse from "diagram-js/lib/features/mouse/Mouse";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type EventStormingCopyPaste from "../modeling/EventStormingCopyPaste.js";
import type EventStormingElementFactory from "../model/EventStormingElementFactory.js";
import type EventStormingReadOnly from "../read-only/EventStormingReadOnly.js";
import { STICKY_STYLES } from "../draw/styles.js";
import { isEventStormingConnection, isEventStormingShape } from "../model/di-types.js";
import { isUnhandledKey, targetsCanvas } from "./key-scope.js";

/** Arrow-key nudge in diagram px (Shift = coarse). */
const NUDGE_STEP = 2;
const NUDGE_STEP_COARSE = 10;

const ARROW_DELTAS: Record<string, { x: number; y: number }> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

interface BoardKey {
  readsTheBoard: boolean;
  /**
   * The lasso and the creates at the pointer (E, C and a paste) start a gesture there, which would
   * take the press meant for the next point of a line the draw tool holds, or end with the release
   * of a drawing's point drag.
   */
  startsAGesture: boolean;
  /**
   * The nudge and the duplicate act on the selection, which during a drawing's point drag is that
   * drawing: the release writes back every point as the press found it, over a nudge, and a
   * duplicate would select the copy under the drag.
   */
  nudgesOrDuplicates: boolean;
  handle(): void;
}

const reading = (handle: () => void): BoardKey => ({
  readsTheBoard: true,
  startsAGesture: false,
  nudgesOrDuplicates: false,
  handle,
});
const editing = (handle: () => void): BoardKey => ({
  readsTheBoard: false,
  startsAGesture: false,
  nudgesOrDuplicates: false,
  handle,
});
const startingAGesture = (boardKey: BoardKey): BoardKey => ({ ...boardKey, startsAGesture: true });
const nudgingOrDuplicating = (boardKey: BoardKey): BoardKey => ({
  ...boardKey,
  nudgesOrDuplicates: true,
});

/** What the keyboard reads of `EventStormingDrawTool`, which imports the key scope from here. */
interface DrawToolLine {
  holdsLine(): boolean;
}

/** What the keyboard reads of `EventStormingDrawingHandles`, which imports the key scope too. */
interface DrawingPointDrag {
  isDraggingPoint(): boolean;
}

export interface EventStormingKeyboardConfig {
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas command stack (default true).
   * A host that owns the history (the VS Code document) passes false so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
}

/**
 * Minimal keyboard binding: undo/redo, select all, delete, copy/paste/duplicate, arrow-key nudge
 * of the selection, plus the single-key tools E (domain event), C (command) and L (lasso).
 * Deliberately a DOM listener (no diagram-js keyboard-service binding needed) that acts only while
 * the canvas has the focus, as diagram-js 15's own keyboard does. Under the read-only lock only
 * select all, copy and the lasso stay. While the draw tool holds a line in progress, the keys that
 * start a gesture at the pointer (L, E, C and paste) do nothing, and Enter and Escape are the
 * tool's. While a point of a drawing is dragged, these keys, the arrow keys and duplicate do
 * nothing; Escape is the drag's, and Delete, undo and redo run a command, which ends the drag.
 */
export default class EventStormingKeyboard {
  static $inject = [
    "config.eventStormingKeyboard",
    "canvas",
    "commandStack",
    "selection",
    "modeling",
    "eventStormingCopyPaste",
    "eventStormingElementFactory",
    "create",
    "mouse",
    "lassoTool",
    "eventBus",
    "elementRegistry",
    "eventStormingReadOnly",
    "injector",
  ];

  constructor(
    config: EventStormingKeyboardConfig | undefined,
    canvas: Canvas,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
    copyPaste: EventStormingCopyPaste,
    factory: EventStormingElementFactory,
    create: Create,
    mouse: Mouse,
    lassoTool: LassoTool,
    eventBus: EventBus,
    elementRegistry?: ElementRegistry,
    readOnly?: Pick<EventStormingReadOnly, "isReadOnly">,
    injector?: Pick<Injector, "get">,
  ) {
    const undoRedoKeys = config?.undoRedoKeys ?? true;

    // Looked up, not injected: the keyboard module also runs on a diagram without the draw tool.
    const drawTool = () => injector?.get<DrawToolLine | null>("eventStormingDrawTool", false);
    const drawingHandles = () =>
      injector?.get<DrawingPointDrag | null>("eventStormingDrawingHandles", false);

    // On the document, after every listener closer to the target, so a key one of them handled
    // stays theirs. The label editor's field, the palette and the context pad sit in the container
    // next to the <svg>, so the board ignores their keys.
    const onKeydown = (e: KeyboardEvent) => {
      if (!isUnhandledKey(e) || !targetsCanvas(e, canvas)) return;
      const boardKey = boardKeyOf(e);
      if (!boardKey) return;
      // A line in progress owns the presses on the canvas (#243): a lasso or a create started next
      // to it would take the press meant for its next point. Taken without acting, so a host sees
      // the board's key as it does while no line is drawn.
      if (boardKey.startsAGesture && drawTool()?.holdsLine()) {
        e.preventDefault();
        return;
      }
      // A point drag owns its drawing and the release (#375); its keys are taken the same way.
      if (
        (boardKey.startsAGesture || boardKey.nudgesOrDuplicates) &&
        drawingHandles()?.isDraggingPoint()
      ) {
        e.preventDefault();
        return;
      }
      if (!boardKey.readsTheBoard && readOnly?.isReadOnly()) return;
      boardKey.handle();
    };

    /**
     * The board's own key for `e`, `undefined` for one it leaves alone. The keys that read the board
     * (select all, copy, lasso) stay under the read-only lock.
     */
    const boardKeyOf = (e: KeyboardEvent): BoardKey | undefined => {
      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const isUndo = cmd && key === "z" && !e.shiftKey;
      const isRedo = (cmd && key === "z" && e.shiftKey) || (cmd && key === "y");

      if (cmd && key === "a" && !e.shiftKey && !e.altKey) {
        return reading(() => {
          e.preventDefault();
          const all = (elementRegistry?.getAll() ?? []).filter(
            (element) => isEventStormingShape(element) || isEventStormingConnection(element),
          );
          selection.select(all as Element[]);
        });
      }
      if (cmd && key === "c") {
        return reading(() => {
          if (copyPaste.copy()) e.preventDefault();
        });
      }
      if (!cmd && !e.altKey && key === "l") {
        return startingAGesture(
          reading(() => {
            e.preventDefault();
            const lastMove = mouse.getLastMoveEvent();
            lassoTool.activateSelection((lastMove ?? e) as MouseEvent, !!lastMove);
          }),
        );
      }
      if (isUndo || isRedo) {
        if (!undoRedoKeys) return undefined;
        return editing(() => {
          e.preventDefault();
          if (isUndo) commandStack.undo();
          else commandStack.redo();
        });
      }
      if (cmd && key === "v") {
        return startingAGesture(
          editing(() => {
            if (copyPaste.paste()) e.preventDefault();
          }),
        );
      }
      if (cmd && key === "d") {
        return nudgingOrDuplicating(
          editing(() => {
            e.preventDefault();
            copyPaste.duplicate();
          }),
        );
      }
      if (key === "delete" || key === "backspace") {
        return editing(() => {
          const sel = selection.get() as Element[];
          if (sel.length) {
            e.preventDefault();
            modeling.removeElements(sel);
          }
        });
      }
      if (!cmd && !e.altKey && (key === "e" || key === "c")) {
        // Quick create: the new sticky attaches to the cursor (like palette create).
        return startingAGesture(
          editing(() => {
            const lastMove = mouse.getLastMoveEvent();
            if (lastMove) {
              e.preventDefault();
              const shape =
                key === "e"
                  ? factory.createNew("event", STICKY_STYLES.event.label)
                  : factory.createNew("command", STICKY_STYLES.command.label);
              create.start(lastMove, shape as unknown as Element);
            }
          }),
        );
      }
      if (key in ARROW_DELTAS && !cmd) {
        return nudgingOrDuplicating(
          editing(() => {
            const sel = selection.get() as Element[];
            if (sel.length) {
              e.preventDefault();
              const step = e.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
              const d = ARROW_DELTAS[key]!;
              modeling.moveElements(sel, { x: d.x * step, y: d.y * step });
            }
          }),
        );
      }
      return undefined;
    };

    document.addEventListener("keydown", onKeydown);
    eventBus.on("diagram.destroy", () => document.removeEventListener("keydown", onKeydown));
  }
}
