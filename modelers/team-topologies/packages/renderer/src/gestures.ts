/** What diagram-js's dragging service holds while a drag runs (`dragging.context()`). */
export type DragContext = { prefix: string; active?: boolean } | null | undefined;

/**
 * The drags of a palette tool that only waits for its next press: no gesture yet. They hold no
 * element, so an import leaves them armed, and the user's next press still draws a lasso instead
 * of moving the element under the pointer.
 */
const ARMED_TOOL_PREFIXES: ReadonlySet<string> = new Set(["lasso.selection"]);

export function isArmedTool(context: DragContext): boolean {
  return !!context && ARMED_TOOL_PREFIXES.has(context.prefix);
}

/**
 * A gesture of contract 1.5: a drag past its threshold (a move, resize, connect or lasso) or a
 * placement whose preview follows the pointer (a palette create, also while the pointer is still
 * on the palette). A press below the threshold and an armed tool are none.
 */
export function isGesture(context: DragContext): boolean {
  return !!context && context.active === true && !isArmedTool(context);
}
