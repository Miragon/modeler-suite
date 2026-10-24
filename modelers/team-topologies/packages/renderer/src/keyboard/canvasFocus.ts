import type Canvas from "diagram-js/lib/core/Canvas";

/** A click the chrome synthesises for Enter or Space on an entry (no pointer, detail 0). */
export function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}

/**
 * After a palette or context-pad entry ran its action (guide §5.5, §5.8). The keyboard acts only
 * while the canvas has the focus, and a pointer press on an entry leaves it on the entry or on
 * `<body>`, so Delete or Cmd/Ctrl+Z would do nothing until the next click on the canvas. Enter or
 * Space leave the focus on the entry, unless the entry went away with its action.
 */
export function handFocusToCanvas(canvas: Canvas, event: Event): void {
  const ownerDocument = canvas.getContainer().ownerDocument;
  const focused = ownerDocument.activeElement;
  if (!isKeyboardClick(event) || focused === null || focused === ownerDocument.body) {
    canvas.focus();
  }
}
