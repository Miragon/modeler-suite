const isHistoryKey = (event: KeyboardEvent): boolean =>
  (event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase());

/**
 * Keeps the undo and redo keys of an armed editor from whatever listens on the window. Returns
 * the function that takes the listener off again.
 */
export function containHistoryKeys(element: HTMLElement, armed: () => boolean): () => void {
  // On the document, as the last stop before the window: Wardley Maps and Team Topologies act on
  // their keys in a listener on the document, so on the element nothing is handled yet. The other
  // listeners of the document still run; what listens on the window (VS Code's key forwarding,
  // which would undo the board file as well) does not hear the key.
  const onKey = (event: KeyboardEvent): void => {
    if (
      armed() &&
      isHistoryKey(event) &&
      event.target instanceof Node &&
      element.contains(event.target)
    ) {
      event.stopPropagation();
    }
  };
  const page = element.ownerDocument;
  page.addEventListener("keydown", onKey);
  return () => page.removeEventListener("keydown", onKey);
}
