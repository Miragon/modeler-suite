/**
 * Mounts the drawing alone on a hand-built scene (SPEC 11.2 WP7): diagram-js with `drawModule`,
 * interaction events for the hits, and a `c4Scene` that returns the scene given. Shapes and
 * connections get the canvas ids and references the reconciler gives them (SPEC 1.5 step 2).
 */
import Diagram from "diagram-js/lib/Diagram";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import InteractionEventsModule from "diagram-js/lib/features/interaction-events";
import type { Shape } from "diagram-js/lib/model/Types";
import "../../../src/assets/c4.css";
import { drawModule } from "../../../src/draw/index.js";
import type C4Layers from "../../../src/draw/C4Layers.js";
import type { Scene } from "../../../src/scene/types.js";
import type { C4SceneService } from "../../../src/services.js";
import { waypointsOf } from "../../support/handBuiltScenes.js";
import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

export interface MountedDrawing {
  readonly diagram: Diagram;
  readonly container: HTMLElement;
  readonly registry: ElementRegistry;
  readonly canvas: Canvas;
  readonly eventBus: EventBus;
  /** Replaces the canvas with `scene`, as an import would. */
  show(scene: Scene): void;
  /**
   * The `.djs-visual` of an element, a boundary (`boundary:<id>`) or a relationship (`rel:<key>`),
   * whose line and chevron it holds.
   */
  visual(canvasId: string): SVGGElement;
  /** The `.djs-visual` of a relationship's label, in the labels layer. */
  label(canvasId: string): SVGGElement;
  destroy(): void;
}

const mounted: MountedDrawing[] = [];

export function destroyDrawings(): void {
  for (const drawing of mounted.splice(0)) drawing.destroy();
}

export function mountDrawing(
  scene: Scene,
  size: { width: number; height: number } = { width: 1600, height: 1100 },
): MountedDrawing {
  const container = document.createElement("div");
  container.className = "c4-container";
  Object.assign(container.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${size.width}px`,
    height: `${size.height}px`,
  });
  document.body.append(container);
  const holder = { scene };
  const sceneService: C4SceneService = { current: () => holder.scene, of: () => holder.scene };
  const diagram = new Diagram({
    canvas: { container },
    modules: [InteractionEventsModule, drawModule, { c4Scene: ["value", sceneService] }],
  });
  const canvas = diagram.get<Canvas>("canvas");
  const registry = diagram.get<ElementRegistry>("elementRegistry");
  const factory = diagram.get<ElementFactory>("elementFactory");
  const eventBus = diagram.get<EventBus>("eventBus");

  function show(next: Scene): void {
    holder.scene = next;
    diagram.clear();
    const root = canvas.getRootElement();
    const shapes = new Map<string, Shape>();
    const boundaries = [...next.boundaries].sort((a, b) => a.depth - b.depth);
    for (const boundary of boundaries) {
      canvas.addShape(
        factory.createShape({
          id: `boundary:${boundary.id}`,
          ...boundary.box,
          c4: { role: "boundary", id: boundary.id },
        }),
        root,
      );
    }
    for (const element of next.elements) {
      const shape = factory.createShape({
        id: element.id,
        ...element.box,
        c4: { role: "element", id: element.id },
      });
      canvas.addShape(shape, root);
      shapes.set(element.id, shape);
    }
    for (const relationship of next.relationships) {
      canvas.addConnection(
        factory.createConnection({
          id: `rel:${relationship.canvasKey}`,
          source: shapes.get(relationship.sourceId)!,
          target: shapes.get(relationship.destinationId)!,
          waypoints: waypointsOf(next, relationship),
          c4: { role: "relationship", key: relationship.canvasKey, implied: relationship.implied },
        }),
        root,
      );
    }
    diagram.get<C4Layers>("c4Layers").sync(next);
    const bounds = next.contentBounds ?? { x: 0, y: 0, width: 10, height: 10 };
    canvas.viewbox({ x: bounds.x - 40, y: bounds.y - 40, width: size.width, height: size.height });
  }

  const drawing: MountedDrawing = {
    diagram,
    container,
    registry,
    canvas,
    eventBus,
    show,
    visual(canvasId) {
      const gfx = registry.getGraphics(canvasId);
      const visual = gfx?.querySelector<SVGGElement>(".djs-visual");
      if (!visual) throw new Error(`No visual for ${canvasId}.`);
      return visual;
    },
    label(canvasId) {
      const gfx = registry.getGraphics(canvasId, true);
      const visual = gfx?.querySelector<SVGGElement>(":scope > .djs-visual");
      if (!visual) throw new Error(`No label for ${canvasId}.`);
      return visual;
    },
    destroy() {
      diagram.destroy();
      container.remove();
    },
  };
  mounted.push(drawing);
  show(scene);
  return drawing;
}

/** A box in diagram coordinates around what `node` draws, from its geometry (no stroke). */
export function drawnBox(
  node: SVGGraphicsElement,
  origin: { x: number; y: number } = { x: 0, y: 0 },
) {
  const { x, y, width, height } = node.getBBox();
  return { x: x + origin.x, y: y + origin.y, width, height };
}

export function inside(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  tolerance = 0.5,
): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

const faces: FontFace[] = [];

/** Geist's latin face, registered but not loaded: the page then waits for the canvas font. */
export function registerGeist(): FontFace {
  const face = new FontFace("Geist Variable", `url(${geistLatin})`, { weight: "100 900" });
  document.fonts.add(face);
  faces.push(face);
  return face;
}

export async function loadGeist(): Promise<FontFace> {
  const face = registerGeist();
  await face.load();
  await document.fonts.ready;
  return face;
}

export function removeFonts(): void {
  for (const face of faces.splice(0)) document.fonts.delete(face);
}
