/**
 * Keyboard shortcuts: select all, undo / redo, delete-selection. They act only while the canvas
 * itself has the focus, the rule of diagram-js 15's own keyboard: a key whose target is the canvas
 * `<svg>` or inside it. Keys on the page (`<body>`), on a host's chrome, on the palette, the context
 * pad or an editor in the canvas container pass, and so do keys someone closer to the target
 * already handled (`defaultPrevented`) and keys of an IME composition. No container `tabindex`, so
 * the canvas adds no tab stop of its own.
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Element } from "diagram-js/lib/model/Types";
import { isCmElement } from "../model/di-types.js";
import type CmReadOnly from "../read-only/CmReadOnly.js";

export interface CmKeyboardConfig {
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas command stack (default true).
   * A host that owns the history (the VS Code document) passes false, so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
}

/**
 * A canvas inside an `inert` subtree or below an ancestor with `display: none` or
 * `visibility: hidden` takes no key either: Chromium moves the focus off an element the host made
 * inert or hid only at its next rendering update, so until then the key still reaches it.
 */
function isKeyForCanvas(event: KeyboardEvent, svg: SVGElement | null): boolean {
  const target = event.target;
  return (
    typeof event.key === "string" &&
    !event.defaultPrevented &&
    !event.isComposing &&
    target instanceof Element &&
    svg?.contains(target) === true &&
    target.closest("[inert]") === null &&
    isRendered(svg)
  );
}

/**
 * Whether a key reaches an element the host made inert or hid, before the browser moved the focus
 * off it. The map's own chrome (the label editor, the context pad's description field) leaves such
 * a key to the page, as the canvas does.
 */
export function isKeyOnHiddenTarget(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof globalThis.Element &&
    (target.closest("[inert]") !== null || !isRendered(target))
  );
}

/**
 * `opacity: 0` keeps the focus and the keys. Without `checkVisibility` (Safari before 17.4) the
 * browser's focus fixup alone has to do.
 */
function isRendered(element: globalThis.Element): boolean {
  return (
    typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true })
  );
}

export default class CmKeyboard {
  static $inject = [
    "config.cmKeyboard",
    "canvas",
    "commandStack",
    "selection",
    "modeling",
    "elementRegistry",
    "eventBus",
    "cmReadOnly",
  ];

  constructor(
    config: CmKeyboardConfig | undefined,
    canvas: Canvas,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
    elementRegistry: ElementRegistry,
    eventBus: EventBus,
    readOnly: Pick<CmReadOnly, "isReadOnly">,
  ) {
    const container = canvas.getContainer();
    const doc = container.ownerDocument ?? document;
    const svg = container.querySelector<SVGElement>(":scope > svg");
    const undoRedoKeys = config?.undoRedoKeys ?? true;

    const onKeydown = (e: KeyboardEvent): void => {
      if (!isKeyForCanvas(e, svg)) return;
      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Select all reads the map, so it stays under the read-only lock; without it the host
      // (VS Code) would run its own Select All over the chrome's text.
      if (cmd && key === "a" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        selection.select(elementRegistry.filter((element) => isCmElement(element)) as Element[]);
        return;
      }
      if (readOnly.isReadOnly()) return;

      const isUndo = cmd && key === "z" && !e.shiftKey;
      const isRedo = (cmd && key === "z" && e.shiftKey) || (cmd && key === "y" && !e.shiftKey);
      if (isUndo || isRedo) {
        if (!undoRedoKeys) return;
        e.preventDefault();
        if (isUndo && commandStack.canUndo()) commandStack.undo();
        if (isRedo && commandStack.canRedo()) commandStack.redo();
      } else if (key === "delete" || key === "backspace") {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          modeling.removeElements([...sel]);
        }
      }
    };

    doc.addEventListener("keydown", onKeydown);
    eventBus.on("diagram.destroy", () => doc.removeEventListener("keydown", onKeydown));
  }
}
