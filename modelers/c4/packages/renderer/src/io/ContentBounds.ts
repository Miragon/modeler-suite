import type { C4SceneService } from "../services.js";
import type { Bounds } from "./types.js";

/**
 * The extent of the content: one source for the import's fit, the SVG export and a host's fit.
 * Read from the scene, never from the SVG, so it covers the title block and the labels and does
 * not move when a font arrives (SPEC 1.10).
 */
export default class ContentBounds {
  static $inject = ["c4Scene"];

  constructor(private readonly scenes: C4SceneService) {}

  isEmpty(): boolean {
    return this.scenes.current().contentBounds === undefined;
  }

  /** The bounds grown by `padding` on every side; undefined for a view with nothing drawn. */
  contentBounds(padding = 0): Bounds | undefined {
    const box = this.scenes.current().contentBounds;
    if (!box) return undefined;
    return {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + 2 * padding,
      height: box.height + 2 * padding,
    };
  }
}
