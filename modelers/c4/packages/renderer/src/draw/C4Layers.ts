import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Scene, SceneGroup } from "../scene/types.js";
import { groupTextLayout, titleTextLayout } from "../text/elementTextLayout.js";
import type SceneLookup from "./SceneLookup.js";
import { rectanglePath } from "./shapes.js";
import { applyRole } from "./styles.js";
import { append, appendBand, clearChildren, svgElement } from "./svg.js";

/** Below the root plane: groups are frames behind everything (SPEC 1.5 step 6, 6.5). */
export const FRAMES_LAYER = "c4-frames";
export const FRAMES_LAYER_INDEX = -1;
/** Above the plane; the title sits below the content, so nothing overlaps it. */
export const TITLE_LAYER = "c4-title";
export const TITLE_LAYER_INDEX = 1;

const GROUP_STROKE = 1.5;
const GROUP_DASH = "2 4";
const GROUP_RADIUS = 8;

/** A view with no element and no boundary (a blank landscape) shows no title (SPEC 6.5). */
export function drawsTitle(scene: Scene): boolean {
  return scene.elements.length > 0 || scene.boundaries.length > 0;
}

function framesSignature(scene: Scene): string {
  return JSON.stringify(scene.groups.map(({ key, name, box, depth }) => [key, name, box, depth]));
}

function titleSignature(scene: Scene): string {
  return drawsTitle(scene) ? JSON.stringify(scene.title) : "";
}

/**
 * The two layers of the canvas `<svg>` that hold no diagram-js element (SPEC 1.5 step 6): group
 * frames and the title block. They are never selected, lassoed or moved, and `saveSVG` keeps them.
 * Each redraws only when its signature changed. The reconciler calls `sync` after every sync;
 * `elements.changed`, which every command, import and view switch ends with, syncs them as well.
 */
export default class C4Layers {
  static $inject = ["canvas", "eventBus", "c4SceneLookup"];

  private frames: string | undefined;
  private title: string | undefined;
  private lastScene: Scene | undefined;

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly lookup: SceneLookup,
  ) {
    // Created at once, so the title sits below the utility layers diagram-js adds later (the
    // selection outline, resizers, bendpoints) and never covers them.
    this.layer(FRAMES_LAYER, FRAMES_LAYER_INDEX);
    this.layer(TITLE_LAYER, TITLE_LAYER_INDEX);
    eventBus.on("elements.changed", 1500, () => {
      const scene = this.lookup.scene();
      if (scene) this.sync(scene);
    });
    eventBus.on("diagram.clear", () => this.clear());
  }

  /** Redraws the frames and the title when their signature changed; true when it drew. */
  sync(scene: Scene): boolean {
    this.lastScene = scene;
    let drew = false;
    const frames = framesSignature(scene);
    if (frames !== this.frames) {
      this.drawFrames(scene.groups);
      this.frames = frames;
      drew = true;
    }
    const title = titleSignature(scene);
    if (title !== this.title) {
      this.drawTitle(scene);
      this.title = title;
      drew = true;
    }
    return drew;
  }

  /** Draws both again whatever their signature: the text was measured in another font. */
  redraw(): void {
    this.frames = undefined;
    this.title = undefined;
    if (this.lastScene) this.sync(this.lastScene);
  }

  clear(): void {
    clearChildren(this.layer(FRAMES_LAYER, FRAMES_LAYER_INDEX));
    clearChildren(this.layer(TITLE_LAYER, TITLE_LAYER_INDEX));
    this.frames = undefined;
    this.title = undefined;
    this.lastScene = undefined;
  }

  private layer(name: string, index: number): SVGGElement {
    const layer = this.canvas.getLayer(name, index) as SVGGElement;
    // Clicks pass through to the canvas and the elements below, as if the layer were not there.
    layer.setAttribute("pointer-events", "none");
    return layer;
  }

  private drawFrames(groups: readonly SceneGroup[]): void {
    const layer = this.layer(FRAMES_LAYER, FRAMES_LAYER_INDEX);
    clearChildren(layer);
    const outerFirst = [...groups].sort((a, b) => a.depth - b.depth);
    for (const group of outerFirst) {
      const node = append(layer, svgElement("g", { class: "c4-group", "data-group": group.key }));
      const inset = GROUP_STROKE / 2;
      const frame = svgElement("path", {
        class: "c4-frame",
        d: rectanglePath(
          group.box.x + inset,
          group.box.y + inset,
          group.box.width - GROUP_STROKE,
          group.box.height - GROUP_STROKE,
          GROUP_RADIUS,
        ),
        fill: "none",
        "stroke-width": GROUP_STROKE,
        "stroke-dasharray": GROUP_DASH,
      });
      applyRole(frame, "cd-c-stroke-kontur");
      append(node, frame);
      for (const band of groupTextLayout(group).bands) {
        appendBand(node, band, { x: 0, y: 0 }, "c4-band c4-band-name");
      }
    }
  }

  private drawTitle(scene: Scene): void {
    const layer = this.layer(TITLE_LAYER, TITLE_LAYER_INDEX);
    clearChildren(layer);
    if (!drawsTitle(scene)) return;
    const node = append(layer, svgElement("g", { class: "c4-title" }));
    for (const band of titleTextLayout(scene.title).bands) {
      appendBand(node, band, { x: 0, y: 0 }, `c4-band c4-band-${band.band}`);
    }
  }
}
