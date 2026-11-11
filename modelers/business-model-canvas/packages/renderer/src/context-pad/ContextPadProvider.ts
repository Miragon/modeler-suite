import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type {
  ContextPadEntries,
  default as BaseContextPadProvider,
} from "diagram-js/lib/features/context-pad/ContextPadProvider";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { findSticky } from "@miragon/business-model-canvas-schema-model";
import { CHROME_ICON, lucideIcon, type LucideIconName } from "../draw/lucide.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import { isStickyShape, type StickyShape } from "../model/di-types.js";
import type StickyFactory from "../model/StickyFactory.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/index.js";
import { COLOR_POPUP_ID } from "./ColorPopupProvider.js";
import type HostLauncher from "./HostLauncher.js";

interface EditLock {
  isReadOnly(): boolean;
}

function pointerOf(event: Event): { x: number; y: number } {
  const mouse = event as MouseEvent;
  return { x: mouse.clientX, y: mouse.clientY };
}

function entryHtml(icon: LucideIconName): string {
  return `<div class="entry bmc-cp-entry">${lucideIcon(icon, CHROME_ICON)}</div>`;
}

/** The family's pad on a selected sticky: add after, edit, colour, notes, delete. */
export default class ContextPadProvider {
  static $inject = [
    "contextPad",
    "modeling",
    "canvas",
    "selection",
    "popupMenu",
    "stickyFactory",
    "canvasModeling",
    "labelEditing",
    "hostLauncher",
    "readOnly",
    "eventBus",
  ];

  constructor(
    contextPad: ContextPad,
    private readonly modeling: Modeling,
    private readonly canvas: Canvas,
    private readonly selection: Selection,
    private readonly popupMenu: PopupMenu,
    private readonly factory: StickyFactory,
    private readonly canvasModeling: CanvasModeling,
    private readonly labelEditing: LabelEditing,
    private readonly host: HostLauncher,
    private readonly readOnly: EditLock,
    eventBus: EventBus,
  ) {
    contextPad.registerProvider(this as unknown as BaseContextPadProvider);
    eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (!event.readOnly) return;
      contextPad.close();
      popupMenu.close();
    });
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    if (this.readOnly.isReadOnly() || !isStickyShape(element)) return {};
    const shape = element;
    const placed = findSticky(this.canvasModeling.document(), shape.id);
    const entries: ContextPadEntries = {
      "append.sticky": {
        group: "model",
        title: "Add a sticky after this one",
        html: entryHtml("plus"),
        action: { click: () => this.appendAfter(shape) },
      },
      "edit-text": {
        group: "edit",
        title: "Edit text",
        html: entryHtml("pencil"),
        action: { click: () => this.labelEditing.activate(shape) },
      },
    };
    entries["color"] = {
      group: "edit",
      title: "Colour",
      html: entryHtml("palette"),
      action: {
        click: (event: Event) => this.popupMenu.open(shape, COLOR_POPUP_ID, pointerOf(event)),
      },
    };
    if (this.host.hasNotes()) {
      entries["notes"] = {
        group: "edit",
        title: "Notes",
        html: entryHtml("message-square-text"),
        action: {
          click: () =>
            this.host.openNotes(
              { kind: "sticky", id: shape.id },
              (placed?.sticky.notes.length ?? 0) === 0,
            ),
        },
      };
    }
    entries["delete"] = {
      group: "delete",
      title: "Delete",
      html: entryHtml("trash"),
      action: { click: () => this.modeling.removeElements([shape]) },
    };
    return entries;
  }

  /** A new sticky in the next slot of the same block, selected, with its label editor open. */
  private appendAfter(shape: StickyShape): void {
    const placed = findSticky(this.canvasModeling.document(), shape.id);
    if (!placed) return;
    const created = this.modeling.createShape(
      this.factory.createNew() as Shape,
      { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 },
      this.canvas.getRootElement() as Shape,
      { slot: { blockId: placed.blockId, index: placed.index + 1 } },
    ) as StickyShape;
    this.selection.select(created);
    this.canvas.focus();
    this.labelEditing.activate(created);
  }
}
