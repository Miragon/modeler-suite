import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import {
  BLOCK_PADDING,
  BLOCK_TITLES,
  blockOf,
  type Note,
} from "@miragon/business-model-canvas-schema-model";
import { TITLE_MARKER } from "../canvas-frame/CanvasFrame.js";
import { CHROME_ICON, lucideIcon } from "../draw/lucide.js";
import { BLOCK_INSET } from "../draw/styles.js";
import { documentOf } from "../io/documentOf.js";
import { layoutOf } from "../io/layoutOf.js";
import type ReadOnly from "../read-only/ReadOnly.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/index.js";
import { sameScope, type NotesScope } from "./notesScope.js";
import { NOTES_CARD_CLASS, labelCardHtml, notesCardHtml } from "./notesCard.js";

interface ServiceSource {
  get<T>(name: string, strict?: boolean): T;
}

interface Marker {
  /** Diagram coordinates of the marker's anchor edge and vertical centre. */
  x: number;
  centreY: number;
  /** A block's marker ends at its right edge, the canvas's starts after the title. */
  anchor: "left" | "right";
  element: HTMLElement;
}

const HIDE_BELOW_ZOOM = 0.5;
const TITLE_GAP = 12;
const TOOLTIP_WIDTH = 300;

function markerButton(className: string, html: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.className = className;
  button.innerHTML = html;
  button.setAttribute("aria-label", label);
  return button;
}

/** The canvas's own tooltip in the chrome's style: a place's notes, or what a control does. */
class NotesTooltip {
  private readonly element = document.createElement("div");

  constructor(private readonly container: HTMLElement) {
    this.element.className = NOTES_CARD_CLASS;
    this.element.hidden = true;
    container.append(this.element);
  }

  showNotes(target: HTMLElement, anchor: Marker["anchor"], title: string, notes: readonly Note[]) {
    this.element.classList.remove("bmc-notes-card-small");
    this.element.innerHTML = notesCardHtml(title, notes);
    this.place(target, anchor === "left" ? 0 : TOOLTIP_WIDTH, 8);
  }

  showLabel(target: HTMLElement, label: string) {
    this.element.classList.add("bmc-notes-card-small");
    this.element.innerHTML = labelCardHtml(label);
    this.place(target, 0, 6);
  }

  hide() {
    this.element.hidden = true;
  }

  remove() {
    this.element.remove();
  }

  private place(target: HTMLElement, leftOfRightEdge: number, gap: number) {
    const bounds = this.container.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const left = leftOfRightEdge === 0 ? box.left : box.right - leftOfRightEdge;
    this.element.style.left = `${Math.max(12, left - bounds.left)}px`;
    this.element.style.top = `${box.bottom - bounds.top + gap}px`;
    this.element.hidden = false;
  }
}

/**
 * The notes' markers over the canvas, HTML above the SVG so no export carries them: after the
 * canvas's title and at the right end of every block heading, one comment icon per place, with
 * the count of its notes once it has some.
 */
export class NoteMarkers {
  private readonly canvas: Canvas;
  private readonly elementRegistry: ElementRegistry;
  private readonly readOnly: ReadOnly | undefined;
  private readonly layer = document.createElement("div");
  private readonly tooltip: NotesTooltip;
  private markers: Marker[] = [];
  private destroyed = false;

  constructor(
    diagram: ServiceSource,
    private readonly onOpen: (scope: NotesScope, addNote: boolean) => void,
    private readonly activeScope: () => NotesScope | undefined,
  ) {
    this.canvas = diagram.get<Canvas>("canvas");
    this.elementRegistry = diagram.get<ElementRegistry>("elementRegistry");
    this.readOnly = diagram.get<ReadOnly | undefined>("readOnly", false);
    const container = this.canvas.getContainer();
    this.layer.className = "bmc-note-markers";
    container.append(this.layer);
    this.tooltip = new NotesTooltip(container);
    const eventBus = diagram.get<EventBus>("eventBus");
    eventBus.on("canvas.viewbox.changed", () => this.place());
    eventBus.on("diagram.destroy", () => this.destroy());
    // After the frame has drawn the title, which the canvas's marker follows. The listener returns
    // nothing: a value would stop the event for every listener after it (diagram-js).
    const later = (): void => {
      requestAnimationFrame(() => {
        if (!this.destroyed) this.refresh();
      });
    };
    eventBus.on(
      ["commandStack.changed", "import.done", "elements.changed", READ_ONLY_CHANGED_EVENT],
      later,
    );
    this.refresh();
  }

  refresh(): void {
    const document = documentOf(this.elementRegistry);
    this.layer.replaceChildren();
    this.markers = [];
    if (!document) return;
    const layout = layoutOf(document);
    const title = this.canvas.getContainer().querySelector<SVGGraphicsElement>(`.${TITLE_MARKER}`);
    const titleBox = title?.getBBox();
    const titleEnd = titleBox ? titleBox.x + titleBox.width : layout.header.x;
    this.add({ kind: "canvas" }, document.notes, "the whole canvas", {
      x: titleEnd + TITLE_GAP,
      centreY: layout.header.y + 22,
      anchor: "left",
    });
    for (const block of layout.blocks) {
      this.add(
        { kind: "block", blockId: block.blockId },
        blockOf(document, block.blockId)?.notes ?? [],
        BLOCK_TITLES[block.blockId],
        {
          x: block.rect.x + block.rect.width - BLOCK_INSET - BLOCK_PADDING + 6,
          centreY: block.rect.y + 25,
          anchor: "right",
        },
      );
    }
    for (const marker of this.markers) this.layer.append(marker.element);
    this.place();
  }

  destroy(): void {
    this.destroyed = true;
    this.layer.remove();
    this.tooltip.remove();
  }

  private add(
    scope: NotesScope,
    notes: readonly Note[],
    place: string,
    position: Omit<Marker, "element">,
  ): void {
    const locked = this.readOnly?.isReadOnly() ?? false;
    if (notes.length === 0 && locked) return;
    const element = document.createElement("div");
    element.className = "bmc-note-marker";
    element.dataset.anchor = position.anchor;
    element.append(this.commentButton(scope, notes, place, position.anchor));
    this.markers.push({ ...position, element });
  }

  /**
   * One comment per place: without notes a quiet icon that starts the first one, with notes the
   * icon and their count, which opens them to read, change and add to.
   */
  private commentButton(
    scope: NotesScope,
    notes: readonly Note[],
    place: string,
    anchor: Marker["anchor"],
  ): HTMLButtonElement {
    const empty = notes.length === 0;
    const label = empty ? `Add a note to ${place}` : `Notes on ${place}, ${notes.length}`;
    const button = markerButton(
      empty ? "bmc-note-marker-comment bmc-note-marker-empty" : "bmc-note-marker-comment",
      lucideIcon("message-square-text", { ...CHROME_ICON, size: 14 }) +
        (empty ? "" : `<span class="bmc-note-marker-count">${notes.length}</span>`),
      label,
    );
    const active = this.activeScope();
    if (active && sameScope(active, scope)) button.classList.add("bmc-note-marker-active");
    button.addEventListener("click", () => this.open(scope, empty));
    button.addEventListener("mouseenter", () =>
      empty
        ? this.tooltip.showLabel(button, label)
        : this.tooltip.showNotes(button, anchor, `Notes on ${place}`, notes),
    );
    button.addEventListener("mouseleave", () => this.tooltip.hide());
    return button;
  }

  private open(scope: NotesScope, addNote: boolean): void {
    this.tooltip.hide();
    this.onOpen(scope, addNote);
  }

  private place(): void {
    const viewbox = this.canvas.viewbox();
    const { scale } = viewbox;
    this.layer.hidden = scale < HIDE_BELOW_ZOOM;
    this.layer.style.setProperty("--bmc-zoom", String(scale));
    for (const marker of this.markers) {
      marker.element.style.left = `${(marker.x - viewbox.x) * scale}px`;
      marker.element.style.top = `${(marker.centreY - viewbox.y) * scale}px`;
    }
  }
}
