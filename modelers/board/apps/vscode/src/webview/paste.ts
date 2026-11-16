/**
 * A paste, aimed where a browser aims it. VS Code keeps the paste key from a webview's page
 * and runs its own paste command instead, and the event of that command lands on `<body>`
 * whatever has the focus (seen in VS Code 1.146 on Linux). A browser aims a paste at the
 * focused element, and the board takes a pasted picture only when it is aimed at the board: a
 * paste on the body is somebody else's. So a paste that lands on the body while another
 * element has the focus is told again, at that element, with the same clipboard.
 */
export function aimPastes(page: Document): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    const focused = page.activeElement;
    if (event.target !== page.body || focused === null || focused === page.body) return;
    // Read while the first event is still being told: its clipboard is closed afterwards.
    const aimed = new ClipboardEvent("paste", {
      clipboardData: event.clipboardData,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    // Nobody hears the paste twice, and whoever takes the aimed one has taken this one.
    event.stopImmediatePropagation();
    if (!focused.dispatchEvent(aimed)) event.preventDefault();
  };
  // On the way down, before the board's own listener on the document hears it.
  page.addEventListener("paste", onPaste, true);
  return () => page.removeEventListener("paste", onPaste, true);
}
