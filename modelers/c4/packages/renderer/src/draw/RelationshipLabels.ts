import type { Injector } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type PreviewSupport from "diagram-js/lib/features/preview-support/PreviewSupport";
import type { Element, ElementLike } from "diagram-js/lib/model/Types";
import { append, clearChildren, svgElement } from "./svg.js";

/**
 * Above the plane, so every label sits above every line; created at once, so it stays below the
 * utility layers diagram-js adds later (bendpoints, resize handles, selection outlines).
 */
export const LABELS_LAYER = "c4-labels";
export const LABELS_LAYER_INDEX = 1;
/** The group of one relationship's label in the labels layer. */
export const LABEL_CLASS = "c4-label";
/**
 * Right above the labels: the previews of a move, a create and a resize, which diagram-js puts
 * into the plane, below every label.
 */
export const DRAG_LAYER = "c4-drag";

/** After diagram-js's MovePreview (499), CreatePreview (750) and ResizePreview (500). */
const AFTER_THE_PREVIEWS = 250;

interface ElementEvent {
  readonly element?: Element;
}

interface PreviewEvent {
  readonly context?: { readonly dragGroup?: SVGElement; readonly frame?: SVGElement };
}

/**
 * The labels of the relationships, in one layer above the plane (guide §10.1): drawn in its
 * connection's own graphics, a label would lie under the line of every relationship drawn after it.
 *
 * Each label's group is its connection's secondary graphics in the element registry, as the
 * `<svg>` is the root's. So diagram-js resolves a pointer event on the label to the relationship
 * (`djs-element` and `data-element-id`, which the registry keeps through an id change), a click
 * on a label selects its relationship however many lines cross it, and every marker the canvas
 * sets on the relationship (hover, selected, dragging, hidden) reaches the label as well.
 *
 * diagram-js's previews know only the primary graphics: a moved relationship's preview gets its
 * label here, and every preview goes into the drag layer, so no label covers what is dragged.
 */
export default class RelationshipLabels {
  static $inject = ["canvas", "elementRegistry", "eventBus", "injector"];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    this.layer();
    this.dragLayer();
    eventBus.on("connection.remove", ({ element }: ElementEvent) => {
      if (element) this.group(element)?.remove();
    });
    eventBus.on("diagram.clear", () => clearChildren(this.layer()));
    eventBus.on("shape.move.start", AFTER_THE_PREVIEWS, ({ context }: PreviewEvent) => {
      if (!context?.dragGroup) return;
      this.addLabelDraggers(context.dragGroup);
      this.raise(context.dragGroup);
    });
    eventBus.on("create.move", AFTER_THE_PREVIEWS, ({ context }: PreviewEvent) =>
      this.raise(context?.dragGroup),
    );
    eventBus.on("resize.move", AFTER_THE_PREVIEWS, ({ context }: PreviewEvent) =>
      this.raise(context?.frame),
    );
  }

  /**
   * The emptied visual of `connection`'s label, created with its group on first use; undefined
   * for a connection the registry does not hold (a preview), whose label stays in its own visual.
   */
  visual(connection: ElementLike): SVGGElement | undefined {
    if (this.elementRegistry.get(connection.id) !== connection) return undefined;
    const group = this.group(connection) ?? this.create(connection);
    const visual = group.querySelector<SVGGElement>(":scope > .djs-visual");
    if (!visual) return undefined;
    clearChildren(visual);
    return visual;
  }

  /** The label's group, where its hits go; undefined before its first drawing. */
  group(connection: ElementLike): SVGGElement | undefined {
    return (
      (this.elementRegistry.getGraphics(connection, true) as SVGGElement | undefined) ?? undefined
    );
  }

  /** The label of every relationship the move preview carries along, after all of its lines. */
  private addLabelDraggers(dragGroup: SVGElement): void {
    const previewSupport = this.injector.get<PreviewSupport>("previewSupport", false);
    if (!previewSupport) return;
    for (const dragger of [...dragGroup.children]) {
      const id = dragger.getAttribute("data-preview-support-element-id");
      const element = id === null ? undefined : this.elementRegistry.get(id);
      const label = element && this.group(element);
      if (element && label) previewSupport.addDragger(element, dragGroup, label);
    }
  }

  private raise(preview: SVGElement | undefined): void {
    const layer = this.dragLayer();
    if (preview?.parentNode && preview.parentNode !== layer) layer.append(preview);
  }

  private create(connection: ElementLike): SVGGElement {
    const group = svgElement("g", { class: `djs-element ${LABEL_CLASS}` });
    const markers = (connection as { markers?: Iterable<string> }).markers ?? [];
    for (const marker of markers) group.classList.add(marker);
    append(group, svgElement("g", { class: "djs-visual" }));
    this.layer().append(group);
    this.elementRegistry.updateGraphics(connection, group, true);
    return group;
  }

  private layer(): SVGGElement {
    return this.canvas.getLayer(LABELS_LAYER, LABELS_LAYER_INDEX) as SVGGElement;
  }

  private dragLayer(): SVGGElement {
    return this.canvas.getLayer(DRAG_LAYER, LABELS_LAYER_INDEX) as SVGGElement;
  }
}
