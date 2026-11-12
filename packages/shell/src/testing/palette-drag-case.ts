import {
  CREATE_WAIT_MS,
  DEFAULT_SIZES,
  LIGHT,
  PARK,
  closeByEscape,
  documentChangedFrom,
  documentStateSkip,
  finish,
  firstCreatingEntry,
  openHarness,
  pollUntil,
  shapes,
} from "./case-tools.js";
import { paletteDragProblems } from "./checks.js";
import { paletteEntriesProbe, type PaletteEntryState, type ShapeFacts } from "./facts.js";
import { DEFAULT_ROOT, freeRectangle, measureChrome, type Rectangle } from "./geometry.js";
import type { ShellConformanceCase, ShellConformanceHarness, ShellSkip } from "./harness.js";
import type { PageLike } from "./page.js";
import { inPage, settle, type RelativeBox } from "./page-tools.js";

/**
 * The first move stays on the entry, as a hand's first pixels do: the browser starts its drag
 * there, before the pointer reaches the canvas.
 */
const DRAG_START_PX = 6;

/** The length of each further move, as a hand drags in many small events. */
const DRAG_STEP_PX = 20;

/** Empty canvas the drop point keeps around it, so the new element lands on nothing else. */
const DROP_CLEARANCE_PX = 60;

const DROP_RASTER_PX = 24;

interface DropPoint {
  /** Viewport coordinates, for `page.mouse`. */
  client: { x: number; y: number };
  /** Relative to the root's padding box, as `ShapeFacts.box`. */
  relative: { x: number; y: number };
}

/**
 * The point of `free` nearest its centre, on a raster, with empty canvas under it and at
 * `clearance` around it: no element and no chrome a pointer would reach there.
 */
export const emptyDropPointProbe = ({
  root,
  free,
  clearance,
  raster,
}: {
  root: string;
  free: Rectangle;
  clearance: number;
  raster: number;
}): DropPoint | null => {
  const rootElement = document.querySelector<HTMLElement>(root);
  const svg = rootElement?.querySelector(".djs-container > svg");
  if (!rootElement || !svg) return null;
  const origin = rootElement.getBoundingClientRect();
  const offset = { x: origin.left + rootElement.clientLeft, y: origin.top + rootElement.clientTop };
  const emptyCanvasAt = (x: number, y: number): boolean => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && svg.contains(hit) && !hit.closest(".djs-element");
  };
  const around = [-clearance, 0, clearance];
  const centre = { x: (free.left + free.right) / 2, y: (free.top + free.bottom) / 2 };
  let nearest: DropPoint | null = null;
  let nearestDistance = Infinity;
  for (let y = free.top + clearance; y <= free.bottom - clearance; y += raster) {
    for (let x = free.left + clearance; x <= free.right - clearance; x += raster) {
      const client = { x: x + offset.x, y: y + offset.y };
      const clear = around.every((dy) =>
        around.every((dx) => emptyCanvasAt(client.x + dx, client.y + dy)),
      );
      const distance = Math.hypot(x - centre.x, y - centre.y);
      if (clear && distance < nearestDistance) {
        nearest = { client, relative: { x, y } };
        nearestDistance = distance;
      }
    }
  }
  return nearest;
};

/** `client` in diagram coordinates through the viewport layer, and the view's scale. */
export const diagramPointProbe = ({
  root,
  client,
}: {
  root: string;
  client: { x: number; y: number };
}): { x: number; y: number; scale: number } | null => {
  const viewport = document
    .querySelector(root)
    ?.querySelector<SVGGraphicsElement>(".djs-container > svg > .viewport");
  const toScreen = viewport?.getScreenCTM();
  if (!toScreen) return null;
  const point = new DOMPoint(client.x, client.y).matrixTransform(toScreen.inverse());
  return { x: point.x, y: point.y, scale: toScreen.a };
};

/** The visual of shape `id` in diagram coordinates, whatever the view. */
export const diagramBoxProbe = ({ root, id }: { root: string; id: string }): RelativeBox | null => {
  const rootElement = document.querySelector(root);
  const viewport = rootElement?.querySelector<SVGGraphicsElement>(
    ".djs-container > svg > .viewport",
  );
  const visual = rootElement?.querySelector<SVGGraphicsElement>(
    `.djs-shape[data-element-id="${CSS.escape(id)}"] .djs-visual`,
  );
  const viewportToScreen = viewport?.getScreenCTM();
  const visualToScreen = visual?.getScreenCTM();
  if (!visual || !viewportToScreen || !visualToScreen) return null;
  const toDiagram = viewportToScreen.inverse().multiply(visualToScreen);
  const local = visual.getBBox();
  const corners = [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x, local.y + local.height],
    [local.x + local.width, local.y + local.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(toDiagram));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

/** Mouse down on `entry`, small moves to `drop`, mouse up: the drag a hand makes. */
async function dragOntoCanvas(
  page: PageLike,
  entry: PaletteEntryState,
  drop: DropPoint,
): Promise<void> {
  const from = entry.client;
  const distance = Math.hypot(drop.client.x - from.x, drop.client.y - from.y);
  const pointAt = (travelled: number) => ({
    x: from.x + ((drop.client.x - from.x) * travelled) / distance,
    y: from.y + ((drop.client.y - from.y) * travelled) / distance,
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let travelled = DRAG_START_PX; travelled < distance; travelled += DRAG_STEP_PX) {
    const point = pointAt(travelled);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.move(drop.client.x, drop.client.y);
  await page.mouse.up();
  await settle(page);
}

/**
 * Real pointer input from the palette: mouse down on the first creating entry, moves to an empty
 * spot of the free rectangle, mouse up. One element lies under the drop point (in the free
 * rectangle for a notation that lays it out in a slot), and `documentState` changes with it.
 */
export const paletteDragCase: ShellConformanceCase = {
  name: "paletteDrag",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const entry = firstCreatingEntry(await inPage(page, paletteEntriesProbe, { root }));
    if (!entry) return undefined;
    await page.mouse.move(PARK.x, PARK.y);
    const free = freeRectangle(await measureChrome(page, root), harness.host);
    const drop = await inPage(page, emptyDropPointProbe, {
      root,
      free,
      clearance: DROP_CLEARANCE_PX,
      raster: DROP_RASTER_PX,
    });
    if (!drop) {
      const reason = `the free rectangle shows no empty spot ${DROP_CLEARANCE_PX}px clear of every element: the drag from the palette was not verified`;
      return { skipped: [{ hook: "open", reason }] };
    }
    const { documentState } = harness;
    const documentBefore = await documentState?.(page);
    const dropInDiagram = await inPage(page, diagramPointProbe, { root, client: drop.client });
    const before = await shapes(page, root);
    const known = new Set(before.map((shape) => shape.id));
    const isNew = (shape: ShapeFacts) => !known.has(shape.id);
    await dragOntoCanvas(page, entry, drop);
    const after = await pollUntil(
      page,
      () => shapes(page, root),
      (current) => current.some(isNew),
      CREATE_WAIT_MS,
    );
    const added = after.filter(isNew);
    const addedInDiagram =
      added.length === 1 ? await inPage(page, diagramBoxProbe, { root, id: added[0]!.id }) : null;
    const documentChanged =
      documentState && documentBefore !== undefined
        ? await documentChangedFrom(page, documentState, documentBefore, CREATE_WAIT_MS)
        : undefined;
    const problems = paletteDragProblems({
      entry: entry.action,
      drop: drop.relative,
      before,
      after,
      free,
      placement: harness.firstElement,
      diagram:
        dropInDiagram && addedInDiagram
          ? {
              drop: { x: dropInDiagram.x, y: dropInDiagram.y },
              added: addedInDiagram,
              scale: dropInDiagram.scale,
            }
          : undefined,
      documentChanged,
    });
    await closeByEscape(page);
    const skipped: ShellSkip[] = documentState
      ? []
      : [documentStateSkip("that a dropped element reaches the document")];
    return finish("paletteDrag", harness.host, problems, skipped);
  },
};
