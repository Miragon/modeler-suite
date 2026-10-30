import type Canvas from "diagram-js/lib/core/Canvas";

/** The focusable canvas svg diagram-js renders into its container. */
export function canvasSvg(canvas: Canvas): SVGElement | null {
  return (
    (canvas as unknown as { _svg?: SVGElement })._svg ??
    canvas.getContainer().querySelector<SVGElement>(":scope > svg")
  );
}

/**
 * Whether a keydown is aimed at `root` or an element inside it and still free to act on. A keydown
 * without a key (autofill), one a listener before this one took, and IME composition stay with the
 * page.
 */
export function isKeyAimedAt(event: KeyboardEvent, root: Node | null | undefined): boolean {
  const target = event.target;
  return (
    typeof event.key === "string" &&
    !event.defaultPrevented &&
    !event.isComposing &&
    target instanceof Node &&
    !!root?.contains(target)
  );
}

/**
 * A key is the canvas's only while the canvas `<svg>` has the focus, as with diagram-js' own
 * keyboard: the svg holds no editor, palette, context pad or popup, so they keep their keys, and so
 * do a host's controls inside the container or next to it and a page with nothing focused.
 */
export function isCanvasKey(event: KeyboardEvent, canvas: Canvas): boolean {
  return isKeyAimedAt(event, canvasSvg(canvas));
}

/**
 * Moves keyboard focus to the canvas after a pointer gesture or an editor commit. Pointer work
 * must not light up the keyboard focus ring around the whole viewport, and a press that suppressed
 * the browser's own focus change must still take focus away from host inputs (title, size
 * fields), or Delete/Undo would edit those instead of the map.
 */
export function focusCanvasWithoutRing(canvas: Canvas): void {
  const svg = canvasSvg(canvas);
  if (!svg) {
    canvas.focus();
    return;
  }
  svg.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}

let lastInteraction: "pointer" | "keyboard" = "pointer";
let modalityTracked = false;

/**
 * Starts following whether the user last used the pointer or the keyboard (idempotent). Editors
 * opened with the pointer hand focus back without the keyboard focus ring.
 */
export function trackInputModality(): void {
  if (modalityTracked || typeof document === "undefined") return;
  modalityTracked = true;
  document.addEventListener("pointerdown", () => (lastInteraction = "pointer"), true);
  document.addEventListener("mousedown", () => (lastInteraction = "pointer"), true);
  document.addEventListener(
    "keydown",
    (event) => {
      // Typing into an editor says nothing about how it was opened.
      if (!(event.target instanceof HTMLElement && event.target.closest("input, textarea"))) {
        lastInteraction = "keyboard";
      }
    },
    true,
  );
}

export function lastInteractionWasPointer(): boolean {
  return lastInteraction === "pointer";
}
