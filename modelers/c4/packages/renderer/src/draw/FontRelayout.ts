import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import { c4ReferenceOf } from "../scene/types.js";
import { cssFont, resetTextMeasurement } from "../text/textMetrics.js";
import { ELEMENT_FONTS } from "../text/typography.js";
import type C4Layers from "./C4Layers.js";

/** Fired after the drawing was laid out again in the web font; the label editor follows it. */
export const TEXT_RELAYOUT_EVENT = "c4.text.relayout";

/** The faces every band uses: Geist is one variable file, so these two load every weight. */
const FACES = [cssFont(ELEMENT_FONTS.name), cssFont(ELEMENT_FONTS.description)];

type FontSet = Pick<FontFaceSet, "check" | "load">;

/** Whether the canvas measures in the web font already: then no relayout is ever scheduled. */
export function fontsReady(fonts: FontSet): boolean {
  return FACES.every((face) => fonts.check(face));
}

/**
 * Text drawn before Geist arrived was measured in the fallback font: lines wrap and ellipsise
 * differently once the font renders (Value Chain's `relayoutLabelsWhenTheFontArrives`). When the
 * faces are not loaded yet at the start, every element, relationship and layer is drawn again once
 * they are, as diagram-js's ChangeSupport redraws a changed element. A page that loaded the faces
 * first (the kit harness does) never relays out, so two exports stay byte-identical.
 */
export default class FontRelayout {
  static $inject = ["eventBus", "elementRegistry", "graphicsFactory", "c4Layers"];

  private destroyed = false;
  /** Settles once the faces arrived and the drawing was laid out again, or nothing was due. */
  readonly settled: Promise<boolean>;

  constructor(
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly graphicsFactory: GraphicsFactory,
    private readonly layers: C4Layers,
  ) {
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
    });
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    this.settled = fonts && !fontsReady(fonts) ? this.whenLoaded(fonts) : Promise.resolve(false);
  }

  private async whenLoaded(fonts: FontSet): Promise<boolean> {
    try {
      const loaded = await Promise.all(FACES.map((face) => fonts.load(face)));
      if (this.destroyed || loaded.every((faces) => faces.length === 0)) return false;
    } catch {
      return false;
    }
    this.relayout();
    return true;
  }

  /** Measures again and redraws everything that shows text. */
  relayout(): void {
    if (this.destroyed) return;
    resetTextMeasurement();
    for (const element of this.elementRegistry.getAll()) {
      const reference = c4ReferenceOf(element);
      if (!reference) continue;
      const type = reference.role === "relationship" ? "connection" : "shape";
      const gfx = this.elementRegistry.getGraphics(element);
      if (!gfx) continue;
      this.graphicsFactory.update(type, element, gfx);
      this.eventBus.fire(`${type}.changed`, { element, gfx });
    }
    this.layers.redraw();
    this.eventBus.fire(TEXT_RELAYOUT_EVENT, {});
  }
}
