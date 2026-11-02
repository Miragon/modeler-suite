import type { FreeAreaInsets } from "@miragon/modeler-api";

/** The shell's island for the inspector, which opens on the selection a keyboard create makes. */
const INSPECTOR_SELECTOR = '[data-chrome="inspector"]';
/** Guide §5.11: up to 45% of the container high as a bottom sheet; the most it covers. */
const SHEET_HEIGHT_SHARE = 0.45;

/**
 * The canvas insets, in pixels from the container's edges, that the host's inspector covers once it
 * shows, with the fit's gap beside it (guide §5.9): the side panel on the right, the bottom sheet up
 * to `--cd-shell-schmal`. An inspector that is still closed covers where it will open, at its
 * tallest. Undefined without a shell inspector around the canvas.
 */
export function inspectorCover(container: HTMLElement): FreeAreaInsets | undefined {
  const root = container.closest<HTMLElement>(".cd-shell");
  const inspector = root?.querySelector<HTMLElement>(INSPECTOR_SELECTOR);
  if (!root || !inspector) return undefined;
  const bounds = container.getBoundingClientRect();
  if (!(bounds.width > 0 && bounds.height > 0)) return undefined;
  const tokens = getComputedStyle(inspector);
  const edge = tokenPx(tokens, "--cd-shell-rand", 12);
  const side = tokenPx(tokens, "--cd-shell-einpassen-seite", 24);
  const width = tokenPx(tokens, "--cd-shell-inspector-breite", 288);
  const narrow = root.getBoundingClientRect().width <= tokenPx(tokens, "--cd-shell-schmal", 760);
  const shown = !inspector.hidden ? restingBox(inspector) : undefined;
  const open = shown && shown.width > 0 && shown.height > 0 ? shown : undefined;
  if (narrow) {
    const sheetTop = open ? open.top : bounds.bottom - edge - bounds.height * SHEET_HEIGHT_SHARE;
    return { top: 0, right: 0, bottom: Math.max(0, bounds.bottom - sheetTop + edge), left: 0 };
  }
  const panelLeft = open ? open.left : bounds.right - edge - width;
  return { top: 0, right: Math.max(0, bounds.right - panelLeft + side), bottom: 0, left: 0 };
}

/** The panel's box once its entrance animation, a translation (guide §5.11), has ended. */
function restingBox(panel: HTMLElement): DOMRect {
  const box = panel.getBoundingClientRect();
  const transform = getComputedStyle(panel).transform;
  if (!transform || transform === "none" || typeof DOMMatrixReadOnly === "undefined") return box;
  const { m41: translateX, m42: translateY } = new DOMMatrixReadOnly(transform);
  return new DOMRect(box.x - translateX, box.y - translateY, box.width, box.height);
}

function tokenPx(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(token));
  return Number.isFinite(value) ? value : fallback;
}
