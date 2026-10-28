import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  collectVocabulary,
  spellingVariants,
  type VocabularyTerm,
} from "@miragon/event-storming-schema-model";
import { focusCanvasWithoutRing } from "../keyboard/index.js";
import { isEventStormingShape, type EventStormingShape } from "../model/di-types.js";
import type EventStormingModeling from "../modeling/EventStormingModeling.js";
import { READ_ONLY_CHANGED_EVENT, type EventStormingReadOnly } from "../read-only/index.js";
import { CHROME_SPACING } from "../theme/palette.js";
import { boardStickies } from "./board-stickies.js";

/** The diagram-js overlay type of the dots. */
export const SPELLING_VARIANT_OVERLAY = "event-storming-spelling-variant";

/** Hover time before the tooltip shows, as for the chrome's tooltip (guide §5.6). */
const TOOLTIP_DELAY_MS = 300;

/** The tooltip's gap to the dot and its least distance to the container edge (guide §5.6). */
const { luecke: TOOLTIP_GAP, rand: TOOLTIP_EDGE } = CHROME_SPACING;

let tooltipCount = 0;

/** A spelling as the tooltip quotes it, a line break shown as ↵ so it stays visible. */
function quoted(label: string): string {
  return `“${label.replace(/\r?\n/g, "↵")}”`;
}

/** The tooltip of `shape`, one of the stickies of `term`. */
export function spellingVariantText(shape: EventStormingShape, term: VocabularyTerm): string {
  const others = term.spellings
    .filter((spelling) => spelling.label !== shape.eventStormingLabel)
    .map((spelling) => quoted(spelling.label));
  const list = new Intl.ListFormat("en", { type: "conjunction" }).format(others);
  return `Also spelled ${list} on this board. Unify spelling from the context pad.`;
}

interface ShownDot {
  overlayId: string;
  text: string;
}

/**
 * Spelling variants on the canvas (issue #115): a sticky whose name the board also writes another
 * way (`Order`, `order`, `Orders`, see `normalizeLabel`) gets a dot in `--cd-ui-warning` on its
 * top right corner, with a tooltip that names the other spellings. The dot is an HTML overlay, so
 * no export carries it, and it never reaches the problems of a host: different names stay legal,
 * since a real language conflict is what a workshop wants to see. `unify` rewrites every other
 * spelling to the sticky's own in one command, so one undo takes it back. The dots hide while the
 * read-only lock holds, as the context pad's entries do.
 */
export default class EventStormingSpellingVariants {
  static $inject = [
    "eventBus",
    "canvas",
    "elementRegistry",
    "overlays",
    "selection",
    "eventStormingModeling",
    "eventStormingReadOnly",
  ];

  private readonly shown = new Map<string, ShownDot>();
  private tooltip: HTMLElement | undefined;
  private tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  /** The sticky whose tooltip shows or waits for its delay, and its dot. */
  private tooltipElementId: string | undefined;
  private tooltipAnchor: HTMLElement | undefined;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.hideTooltip();
  };

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly overlays: Overlays,
    private readonly selection: Selection,
    private readonly modeling: EventStormingModeling,
    private readonly readOnly: Pick<EventStormingReadOnly, "isReadOnly">,
  ) {
    eventBus.on(["import.done", "elements.changed", READ_ONLY_CHANGED_EVENT], () => this.refresh());
    eventBus.on(["canvas.viewbox.changing", "drag.init", "element.mousedown"], () =>
      this.hideTooltip(),
    );
    // diagram-js drops the overlays of a removed shape itself, an import's clear included. The
    // dot is forgotten with it, so the next refresh draws it again for a sticky of the same id.
    eventBus.on("shape.remove", (event: { element?: { id?: string } }) => {
      const id = event.element?.id;
      if (id !== undefined) this.forget(id);
    });
    eventBus.on(["diagram.clear", "diagram.destroy"], () => {
      this.hideTooltip();
      this.shown.clear();
    });
  }

  /** The spelling variants on the board: the terms it writes in more than one way. */
  variants(): VocabularyTerm[] {
    return spellingVariants(collectVocabulary(boardStickies(this.elementRegistry)));
  }

  /** The term of `shape` when the board writes it in more than one way. */
  variantOf(shape: EventStormingShape): VocabularyTerm | undefined {
    return this.variants().find((term) =>
      term.spellings.some((spelling) => spelling.elementIds.includes(shape.id)),
    );
  }

  /**
   * Gives every sticky of `shape`'s term the spelling of `shape`, as one command. `false` when the
   * board writes that term one way only.
   */
  unify(shape: EventStormingShape): boolean {
    const term = this.variantOf(shape);
    if (!term) return false;
    const label = shape.eventStormingLabel;
    const changes = term.spellings
      .flatMap((spelling) => spelling.elementIds)
      .map((id) => this.elementRegistry.get(id))
      .filter(isEventStormingShape)
      .map((element) => ({ element, label }));
    this.modeling.updateLabels(changes);
    return true;
  }

  /** The ids of the stickies that show a dot now, for hosts and tests. */
  markedIds(): string[] {
    return [...this.shown.keys()];
  }

  private refresh(): void {
    const wanted = new Map<string, string>();
    if (!this.readOnly.isReadOnly()) {
      for (const term of this.variants()) {
        for (const id of term.spellings.flatMap((spelling) => spelling.elementIds)) {
          const shape = this.elementRegistry.get(id);
          if (isEventStormingShape(shape)) wanted.set(id, spellingVariantText(shape, term));
        }
      }
    }
    for (const [id, dot] of this.shown) {
      if (wanted.get(id) === dot.text) continue;
      this.overlays.remove(dot.overlayId);
      this.forget(id);
    }
    for (const [id, text] of wanted) {
      if (this.shown.has(id)) continue;
      const shape = this.elementRegistry.get(id);
      if (!isEventStormingShape(shape)) continue;
      const overlayId = this.overlays.add(shape, SPELLING_VARIANT_OVERLAY, {
        position: { top: 0, right: 0 },
        scale: false,
        html: this.dot(shape, text),
      });
      this.shown.set(id, { overlayId, text });
    }
  }

  /** Drops the dot of `id` from the record, and its tooltip with it, shown or still waiting. */
  private forget(id: string): void {
    this.shown.delete(id);
    if (this.tooltipElementId === id) this.hideTooltip();
  }

  private dot(shape: EventStormingShape, text: string): HTMLElement {
    const dot = document.createElement("div");
    dot.className = "event-storming-spelling-variant";
    dot.dataset["elementId"] = shape.id;
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", "Spelling variant");
    dot.addEventListener("pointerenter", () => this.scheduleTooltip(dot, shape.id, text));
    dot.addEventListener("pointerleave", () => this.hideTooltip());
    dot.addEventListener("click", () => {
      this.hideTooltip();
      this.selection.select(shape);
      focusCanvasWithoutRing(this.canvas);
    });
    return dot;
  }

  private scheduleTooltip(dot: HTMLElement, elementId: string, text: string): void {
    this.hideTooltip();
    this.tooltipElementId = elementId;
    this.tooltipAnchor = dot;
    // Escape hides the tooltip without moving the pointer (guide §5.6, WCAG 1.4.13). The key is
    // not consumed, so the canvas still gets its own Escape.
    dot.ownerDocument.addEventListener("keydown", this.onKeyDown, true);
    this.tooltipTimer = setTimeout(() => this.showTooltip(dot, elementId, text), TOOLTIP_DELAY_MS);
  }

  private showTooltip(dot: HTMLElement, elementId: string, text: string): void {
    this.tooltipTimer = undefined;
    if (!dot.isConnected) {
      this.hideTooltip();
      return;
    }
    const container = this.canvas.getContainer();
    tooltipCount += 1;
    const tooltip = document.createElement("div");
    tooltip.id = `event-storming-spelling-tooltip-${tooltipCount}`;
    tooltip.className = "event-storming-spelling-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.dataset["elementId"] = elementId;
    tooltip.textContent = text;
    container.appendChild(tooltip);
    dot.setAttribute("aria-describedby", tooltip.id);

    const origin = container.getBoundingClientRect();
    const anchor = dot.getBoundingClientRect();
    const centre = anchor.left + anchor.width / 2 - origin.left;
    const maxLeft = container.clientWidth - tooltip.offsetWidth - TOOLTIP_EDGE;
    const left = Math.max(TOOLTIP_EDGE, Math.min(centre - tooltip.offsetWidth / 2, maxLeft));
    const below = anchor.bottom - origin.top + TOOLTIP_GAP;
    const fitsBelow = below + tooltip.offsetHeight <= container.clientHeight - TOOLTIP_EDGE;
    const top = fitsBelow ? below : anchor.top - origin.top - TOOLTIP_GAP - tooltip.offsetHeight;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(TOOLTIP_EDGE, top)}px`;
    this.tooltip = tooltip;
  }

  private hideTooltip(): void {
    clearTimeout(this.tooltipTimer);
    this.tooltipTimer = undefined;
    this.tooltipElementId = undefined;
    const anchor = this.tooltipAnchor;
    this.tooltipAnchor = undefined;
    anchor?.ownerDocument.removeEventListener("keydown", this.onKeyDown, true);
    if (!this.tooltip) return;
    anchor?.removeAttribute("aria-describedby");
    this.tooltip.remove();
    this.tooltip = undefined;
  }
}
