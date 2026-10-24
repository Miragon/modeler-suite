/**
 * Keyboard shortcuts of the canvas: undo / redo / select all / delete-selection / copy / paste /
 * nudge the selection with the arrow keys / clear the selection (Escape).
 *
 * They act only while the canvas itself has the focus: the key press targets the canvas `<svg>` or
 * something inside it, as diagram-js 15 binds its own keyboard. diagram-js focuses the svg on
 * mouse-down, and the palette and the context pad hand the focus back to it. `<body>`, host chrome,
 * form fields, the label editor and the palette and context pad themselves never count, so a canvas
 * the host hides cannot take a key, and nothing acts while a modal dialog is open or the canvas is
 * `inert`. A key a closer listener already handled (`defaultPrevented`), part of an IME composition
 * or without a `key` is left alone.
 *
 * Zoom and fit keys are the host chrome's (guide §5.8: only Cmd/Ctrl + `+` `-` `0` and Shift+1,
 * each acting exactly once), so the canvas binds none. A host that owns the history (the VS Code
 * document) turns the undo and redo keys off with `undoRedoKeys: false`, so they reach it.
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type CopyPaste from "diagram-js/lib/features/copy-paste/CopyPaste";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type { Injector } from "didi";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type TtReadOnly from "../read-only/TtReadOnly.js";

const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;

const ARROW_DIRECTIONS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const MODAL_SELECTOR = '[aria-modal="true"], dialog[open]';

export interface TtKeyboardConfig {
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas command stack (default true).
   * A host that owns the history (the VS Code document) passes false so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
}

function isNode(target: EventTarget | null): target is Node {
  return typeof (target as Node | null)?.nodeType === "number";
}

function isOnCanvas(target: EventTarget | null, svg: SVGSVGElement): boolean {
  // A host marks the canvas inert while something else fronts it, e.g. a start screen.
  if (svg.closest("[inert]")) return false;
  return isNode(target) && svg.contains(target);
}

function isShape(element: Element): element is Shape {
  return !("waypoints" in element);
}

export default class TtKeyboard {
  static $inject = [
    "config.ttKeyboard",
    "eventBus",
    "canvas",
    "elementRegistry",
    "commandStack",
    "selection",
    "modeling",
    "copyPaste",
    "rules",
    "injector",
  ];

  constructor(
    config: TtKeyboardConfig | undefined,
    eventBus: EventBus,
    canvas: Canvas,
    elementRegistry: ElementRegistry,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
    copyPaste: CopyPaste,
    rules: Rules,
    injector: Injector,
  ) {
    const container = canvas.getContainer();
    const svg = container.querySelector<SVGSVGElement>(":scope > svg")!;
    const doc = container.ownerDocument ?? document;
    const undoRedoKeys = config?.undoRedoKeys ?? true;
    const dragging = injector.get<Dragging>("dragging", false);
    const readOnly = injector.get<TtReadOnly>("ttReadOnly", false);

    /** Keys that only read the diagram; they stay under the read-only lock. */
    const handleReadingKey = (e: KeyboardEvent, cmd: boolean, key: string): boolean => {
      if (cmd && key === "a" && !e.shiftKey) {
        e.preventDefault();
        selection.select(elementRegistry.filter((element) => Boolean(element.parent)));
      } else if (cmd && key === "c" && !e.shiftKey) {
        const sel = selection.get() as Element[];
        if (!sel.length) return true;
        e.preventDefault();
        copyPaste.copy(sel);
      } else if (!cmd && key === "escape") {
        if (dragging?.context() || !selection.get().length) return true;
        e.preventDefault();
        selection.select(null);
      } else {
        return false;
      }
      return true;
    };

    const handleEditingKey = (e: KeyboardEvent, cmd: boolean, key: string): void => {
      const undo = cmd && key === "z" && !e.shiftKey;
      const redo = (cmd && key === "z" && e.shiftKey) || (cmd && key === "y" && !e.shiftKey);
      if (undo || redo) {
        if (!undoRedoKeys) return;
        e.preventDefault();
        if (undo && commandStack.canUndo()) commandStack.undo();
        if (redo && commandStack.canRedo()) commandStack.redo();
      } else if (key === "delete" || key === "backspace") {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          modeling.removeElements([...sel]);
        }
      } else if (cmd && key === "v" && !e.shiftKey) {
        e.preventDefault();
        copyPaste.paste();
      } else if (!cmd && Object.hasOwn(ARROW_DIRECTIONS, e.key)) {
        const shapes = (selection.get() as Element[]).filter(isShape);
        if (!shapes.length || !rules.allowed("elements.move", { shapes })) return;
        e.preventDefault();
        const direction = ARROW_DIRECTIONS[e.key]!;
        const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
        modeling.moveElements(shapes, { x: direction.x * step, y: direction.y * step });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (typeof e.key !== "string" || e.defaultPrevented || e.altKey || e.isComposing) return;
      if (!isOnCanvas(e.target, svg) || doc.querySelector(MODAL_SELECTOR)) return;
      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (handleReadingKey(e, cmd, key)) return;
      if (readOnly?.isReadOnly()) return;
      handleEditingKey(e, cmd, key);
    };

    doc.addEventListener("keydown", onKeyDown);
    eventBus.on("diagram.destroy", () => doc.removeEventListener("keydown", onKeyDown));
  }
}
