/*
 * The canvas invariant of SPEC 9.4 (P-NAT §9.2): at rest the canvas is exactly what a fresh
 * import of the exported text draws in the same view. The in-place sync of imports, view switches
 * and commands must never leave a shape behind, miss one, keep a stale box or a stale drawing, or
 * draw in another order than a fresh render would.
 */
import { expect } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { Element } from "diagram-js/lib/model/Types";
import type { BaseViewer } from "../../../src/BaseViewer.js";
import {
  createCollaborativeViewer,
  type CollaborativeDiagram,
} from "../../../src/collaborative/index.js";
import {
  FRAMES_LAYER,
  FRAMES_LAYER_INDEX,
  TITLE_LAYER,
  TITLE_LAYER_INDEX,
} from "../../../src/draw/C4Layers.js";
import type DocumentStore from "../../../src/document/DocumentStore.js";
import { c4ReferenceOf } from "../../../src/scene/types.js";

/** One element of the canvas as a fresh render would draw it, in drawing order. */
export interface CanvasItem {
  readonly id: string;
  readonly c4: unknown;
  readonly geometry: unknown;
  readonly visual: string;
}

export interface CanvasState {
  readonly view: string;
  readonly items: readonly CanvasItem[];
  readonly frames: string;
  readonly title: string;
}

/** What the canvas of `diagram` shows: the view, every element in z-order, the two layers. */
export function canvasState(diagram: BaseViewer): CanvasState {
  const canvas = diagram.get<Canvas>("canvas");
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  const root = canvas.getRootElement();
  const items = (root.children as Element[]).map((element): CanvasItem => {
    const gfx = registry.getGraphics(element);
    return {
      id: element.id,
      c4: structuredClone(c4ReferenceOf(element)),
      geometry: geometryOf(element),
      visual: gfx?.querySelector(".djs-visual")?.innerHTML ?? "",
    };
  });
  return {
    view: diagram.get<DocumentStore>("c4Document").current().view,
    items,
    frames: canvas.getLayer(FRAMES_LAYER, FRAMES_LAYER_INDEX).innerHTML,
    title: canvas.getLayer(TITLE_LAYER, TITLE_LAYER_INDEX).innerHTML,
  };
}

function geometryOf(element: Element): unknown {
  const connection = element as {
    waypoints?: { x: number; y: number }[];
    source?: { id: string } | null;
    target?: { id: string } | null;
  };
  if (Array.isArray(connection.waypoints)) {
    return {
      source: connection.source?.id,
      target: connection.target?.id,
      waypoints: connection.waypoints.map(({ x, y }) => ({ x, y })),
    };
  }
  const { x, y, width, height } = element as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  return { x, y, width, height };
}

/** Everything registered is drawn on the one root, and nothing but the notation's elements. */
function expectRegistryClean(diagram: BaseViewer): void {
  const canvas = diagram.get<Canvas>("canvas");
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  const root = canvas.getRootElement();
  const drawn = new Set(root.children);
  for (const element of registry.getAll()) {
    if (element === root) continue;
    const reference = c4ReferenceOf(element);
    expect(reference?.role, `registered ${element.id}`).not.toBe("preview");
    expect(reference, `registered ${element.id} carries no reference`).toBeDefined();
    expect(drawn.has(element), `registered ${element.id} is not on the root`).toBe(true);
  }
  expect(canvas.getRootElements()).toEqual([root]);
}

/**
 * Re-imports `exportText()` into a fresh viewer in the view `modeler` shows and expects the same
 * canvas: ids, references, boxes, waypoints, drawings and layers, in the same order.
 */
export function expectCanvasMatchesDocument(modeler: CollaborativeDiagram): void {
  const actual = canvasState(modeler.diagram);
  expectRegistryClean(modeler.diagram);
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:800px;height:600px;overflow:hidden";
  document.body.append(host);
  const fresh = createCollaborativeViewer({ fitOnImport: false });
  try {
    fresh.attachTo(host);
    fresh.diagram.importText(modeler.exportText(), { view: actual.view });
    const expected = canvasState(fresh.diagram);
    expect(actual.view).toBe(expected.view);
    expect(actual.items.map(({ id }) => id)).toEqual(expected.items.map(({ id }) => id));
    expect(actual.items).toEqual(expected.items);
    expect(actual.frames).toBe(expected.frames);
    expect(actual.title).toBe(expected.title);
    expect(modeler.views.active().key).toBe(actual.view);
  } finally {
    fresh.destroy();
    host.remove();
  }
}
