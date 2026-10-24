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

/**
 * Calls `onDrop` when an element inside `scope` had the focus and left the DOM with it, so the
 * focus fell to `<body>`, where no canvas key acts. Chromium reports that removal as a `focusout`
 * while the element is still connected and other engines report nothing, so the removal itself is
 * what counts: a `focusout` forgets the element only if it is still there right after. Only while
 * the document has the focus, so a change made in another window does not pull the focus here.
 */
export function watchDroppedFocus(scope: HTMLElement, onDrop: (lost: Element) => void): () => void {
  const ownerDocument = scope.ownerDocument;
  let focused: Element | null = null;
  const remember = (event: FocusEvent): void => {
    focused = event.target as Element | null;
  };
  const forget = (event: FocusEvent): void => {
    const left = event.target;
    queueMicrotask(() => {
      if (focused === left && focused?.isConnected) focused = null;
    });
  };
  const observer = new MutationObserver(() => {
    const lost = focused;
    if (!lost || lost.isConnected) return;
    focused = null;
    if (ownerDocument.activeElement === ownerDocument.body && ownerDocument.hasFocus()) {
      onDrop(lost);
    }
  });
  scope.addEventListener("focusin", remember);
  scope.addEventListener("focusout", forget);
  observer.observe(scope, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    scope.removeEventListener("focusin", remember);
    scope.removeEventListener("focusout", forget);
  };
}
