import CopyPaste, {
  type DuplicateContext,
  type PasteContext,
  type Tree,
} from "diagram-js/lib/features/copy-paste/CopyPaste";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Clipboard from "diagram-js/lib/features/clipboard/Clipboard";
import type Create from "diagram-js/lib/features/create/Create";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Mouse from "diagram-js/lib/features/mouse/Mouse";
import type Rules from "diagram-js/lib/features/rules/Rules";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ElementLike, ShapeLike } from "diagram-js/lib/core/Types";
import type { Element } from "diagram-js/lib/model/Types";
import { getBBox } from "diagram-js/lib/util/Elements";

/**
 * How far to the right and down a copy that follows no pointer lands from what it copies: two cells
 * of the grid.
 */
export const PASTE_OFFSET = 20;

/** A copied element as diagram-js keeps it in the clipboard. */
interface Descriptor {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  waypoints?: { x: number; y: number }[];
}

/**
 * Copy, cut, paste and duplicate on diagram-js's own feature, which copies an element as the rules
 * allow (`element.copy` in `VcRules`), gives every copy a fresh id and pastes it as one command.
 *
 * - A paste follows the pointer while it is on the canvas, until a click places it (Escape ends
 *   it). Without the pointer there (the keyboard alone) the copy lands next to what was copied,
 *   one offset further with each paste, and the first paste after a cut lands where the cut
 *   elements were, unless they are back (an undo or an import), so a copy never hides under its
 *   original.
 * - A duplicate always lands next to the original, so it never waits for a click.
 * - What a paste or a duplicate places is selected.
 */
export default class VcCopyPaste extends CopyPaste {
  static override $inject = [
    "canvas",
    "create",
    "clipboard",
    "elementFactory",
    "eventBus",
    "modeling",
    "mouse",
    "rules",
    "selection",
    "elementRegistry",
  ];

  private pointerOnCanvas = false;
  private offsetsOfNextPaste = 1;
  private destroyed = false;

  constructor(
    private readonly diagramCanvas: Canvas,
    create: Create,
    private readonly elementClipboard: Clipboard,
    elementFactory: ElementFactory,
    eventBus: EventBus,
    modeling: Modeling,
    mouse: Mouse,
    rules: Rules,
    private readonly selection: Selection,
    private readonly elementRegistry: ElementRegistry,
  ) {
    super(
      diagramCanvas,
      create,
      elementClipboard,
      elementFactory,
      eventBus,
      modeling,
      mouse,
      rules,
    );
    // diagram-js's mouse remembers only the last move over the canvas <svg>, also once the pointer
    // has left it for the palette, an overlay or the page, and makes up one at the page's corner
    // before the first.
    const svg = diagramCanvas.getContainer().querySelector<SVGSVGElement>(":scope > svg");
    const onPointerMove = (): void => {
      this.pointerOnCanvas = true;
    };
    const onPointerLeave = (): void => {
      this.pointerOnCanvas = false;
    };
    svg?.addEventListener("mousemove", onPointerMove);
    svg?.addEventListener("mouseleave", onPointerLeave);
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
      svg?.removeEventListener("mousemove", onPointerMove);
      svg?.removeEventListener("mouseleave", onPointerLeave);
    });
  }

  override copy(elements: ElementLike[], hints?: { clip: boolean }): Tree {
    const tree = super.copy(elements, hints);
    if (hints?.clip !== false) this.offsetsOfNextPaste = 1;
    return tree;
  }

  override cut(elements: ElementLike[]): Tree {
    const tree = super.cut(elements);
    this.offsetsOfNextPaste = 0;
    return tree;
  }

  override paste(context: PasteContext = {}): Element[] {
    if (isDirect(context) || this.pointerOnCanvas) return super.paste(context);
    const tree: Tree = context.tree ?? this.elementClipboard.get();
    const offsets = this.isAnyOriginalOnCanvas(tree)
      ? Math.max(this.offsetsOfNextPaste, 1)
      : this.offsetsOfNextPaste;
    const pasted = this.pasteNextTo(tree, offsets, context.hints);
    if (pasted) this.offsetsOfNextPaste = offsets + 1;
    return pasted as Element[];
  }

  override duplicate(
    elements: ElementLike[],
    context: DuplicateContext = {},
  ): ElementLike[] | undefined {
    if (isDirect(context)) return super.duplicate(elements, context);
    return this.pasteNextTo(this.copy(elements, { clip: false }), 1, context.hints);
  }

  /** Pastes `tree` where it was copied from, `offsets` times `PASTE_OFFSET` further, selected. */
  private pasteNextTo(
    tree: Tree,
    offsets: number,
    hints: Record<string, unknown> | undefined,
  ): Element[] | undefined {
    const descriptors = descriptorsOf(tree);
    if (!descriptors.some(isShapeDescriptor)) return undefined;
    // The box diagram-js centres the pasted elements in, waypoints included.
    const box = getBBox(descriptors as unknown as Element[]);
    const point = {
      x: box.x + box.width / 2 + PASTE_OFFSET * offsets,
      y: box.y + box.height / 2 + PASTE_OFFSET * offsets,
    };
    const element = this.diagramCanvas.getRootElement() as unknown as ShapeLike;
    const pasted = super.paste({ tree, hints: { ...hints }, element, point }) as
      Element[] | undefined;
    if (!pasted?.length) return undefined;
    // A host may destroy the modeler from its change listener, which the paste's command calls.
    if (!this.destroyed) this.selection.select(pasted);
    return pasted;
  }

  private isAnyOriginalOnCanvas(tree: Tree): boolean {
    return descriptorsOf(tree).some(
      (descriptor) =>
        descriptor.id !== undefined && this.elementRegistry.get(descriptor.id) !== undefined,
    );
  }
}

function isDirect(context: PasteContext | DuplicateContext): boolean {
  return "element" in context && context.element !== undefined;
}

function descriptorsOf(tree: Tree): Descriptor[] {
  if (typeof tree !== "object" || tree === null) return [];
  return Object.values(tree as Record<string, Descriptor[]>).flat();
}

function isShapeDescriptor(descriptor: Descriptor): boolean {
  return descriptor.waypoints === undefined && typeof descriptor.width === "number";
}
