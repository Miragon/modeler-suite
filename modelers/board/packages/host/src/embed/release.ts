/** nothing stays selected, open or focused in the diagram-js editor below `element` */
export function releaseDiagramJs(element: HTMLElement): void {
  const doc = element.ownerDocument;
  doc.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }));
  for (const canvas of element.querySelectorAll(".djs-container > svg")) {
    canvas.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: doc.defaultView,
        button: 0,
      }),
    );
  }
  const active = doc.activeElement;
  const focusable = active instanceof HTMLElement || active instanceof SVGElement;
  if (focusable && element.contains(active)) active.blur();
  const selection = doc.getSelection();
  if (selection?.anchorNode && element.contains(selection.anchorNode)) selection.removeAllRanges();
}
