import type { ElementBounds, ElementInfo, ElementsSurface } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { ElementId, ViewKey } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { C4Engine } from "../engine/C4Engine.js";
import type Gestures from "../gestures/Gestures.js";
import type { Modeler } from "../Modeler.js";
import type { NavigatedViewer } from "../NavigatedViewer.js";
import { boundaryCanvasId } from "../reconcile/Reconciler.js";
import type SceneService from "../scene/SceneService.js";
import {
  isBoundaryShape,
  isElementShape,
  type C4BoundaryShape,
  type C4ElementShape,
} from "../scene/types.js";
import type ViewService from "../views/ViewService.js";

/** The elements surface with `bounds`, which every mount of this renderer answers. */
export type DiagramElementsSurface = ElementsSurface & Required<Pick<ElementsSurface, "bounds">>;

type DrawnShape = C4ElementShape | C4BoundaryShape;

interface SelectionListeners {
  subscribe(callback: (selected: unknown[]) => void): () => void;
}

/**
 * The contract's `elements` (SPEC 1.10): the elements of the view shown, by document id. A
 * boundary stands for its scope element (`boundary:<id>` is `<id>`); relationships are not
 * listed. `reveal` of an element the view does not show switches to a written view that shows
 * it, unless the user's action is being applied.
 */
export function elementsSurfaceOf(
  diagram: Modeler | NavigatedViewer,
  selections: SelectionListeners,
  isDestroyed: () => boolean,
): DiagramElementsSurface {
  const canvas = diagram.get<Canvas>("canvas");
  const elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
  const selection = diagram.get<Selection>("selection");
  const views = diagram.get<ViewService>("c4Views");
  const scenes = diagram.get<SceneService>("c4Scene");
  const store = diagram.get<DocumentStore>("c4Document");
  const engine = diagram.get<C4Engine>("c4Engine");
  const gestures = diagram.getOptional<Gestures>("gestures");

  /** An element of the view shown, else the boundary that frames its members. */
  const shapeOf = (id: string): DrawnShape | undefined => {
    const element = elementRegistry.get(id);
    if (isElementShape(element)) return element;
    const boundary = elementRegistry.get(boundaryCanvasId(id));
    return isBoundaryShape(boundary) ? boundary : undefined;
  };
  const idsOf = (selected: readonly unknown[]): string[] => [
    ...new Set(
      selected.flatMap((element) =>
        isElementShape(element) || isBoundaryShape(element) ? [element.c4.id] : [],
      ),
    ),
  ];
  /** Element shapes in document order first, so `list()[0]` is deletable; then boundaries. */
  const listed = (): ElementInfo[] => {
    const scene = scenes.current();
    const seen = new Set<string>();
    const infos: ElementInfo[] = [];
    for (const item of [...scene.elements, ...scene.boundaries]) {
      if (seen.has(item.id) || !shapeOf(item.id)) continue;
      seen.add(item.id);
      infos.push({ id: item.id, name: item.name });
    }
    return infos;
  };
  const select = (shape: DrawnShape): void => {
    selection.select(shape);
    canvas.scrollToElement(shape);
  };
  /** The first written editable view that shows `id`, the default view first (SPEC 1.7). */
  const viewShowing = (id: ElementId): ViewKey | undefined => {
    const catalog = views.catalog();
    const fallback = catalog.defaultView();
    const { workspace } = store.current().parse;
    const candidates = [fallback, ...catalog.list().filter((entry) => entry !== fallback)];
    return candidates.find((entry) => {
      if (entry.state !== "written" || !entry.editable) return false;
      const members = engine.members(workspace, entry);
      return (
        members.elements.includes(id) ||
        members.boundaries.some((boundary) => boundary.elementId === id)
      );
    })?.key;
  };

  return {
    list: () => (isDestroyed() ? [] : listed()),
    reveal(id) {
      if (isDestroyed()) return false;
      const shown = shapeOf(id);
      if (shown) {
        select(shown);
        return true;
      }
      // A switch during the user's action would pull the canvas out from under it.
      if (gestures?.isActionRunning()) return false;
      const target = viewShowing(id);
      if (target === undefined || !views.open(target, { cause: "reveal" })) return false;
      const revealed = isDestroyed() ? undefined : shapeOf(id);
      if (!revealed) return false;
      select(revealed);
      return true;
    },
    selection: () => (isDestroyed() ? [] : idsOf(selection.get())),
    onSelection: (callback) => selections.subscribe((selected) => callback(idsOf(selected))),
    bounds(id): ElementBounds | undefined {
      const shape = isDestroyed() ? undefined : shapeOf(id);
      return shape && { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    },
  };
}
