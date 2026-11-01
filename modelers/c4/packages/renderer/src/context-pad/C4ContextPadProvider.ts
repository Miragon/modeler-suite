import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type BaseContextPadProvider from "diagram-js/lib/features/context-pad/ContextPadProvider";
import type Connect from "diagram-js/lib/features/connect/Connect";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import type { FieldName } from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import { shapePreviewSvg } from "../draw/preview.js";
import type SceneLookup from "../draw/SceneLookup.js";
import { focusCanvasWithoutRing } from "../keyboard/CanvasKeys.js";
import type LabelEditing from "../label-editing/LabelEditing.js";
import type { LabelField } from "../label-editing/LabelEditing.js";
import type C4Dialogs from "../navigation/C4Dialogs.js";
import { CREATING_ENTRIES } from "../palette/PaletteProvider.js";
import { READ_ONLY_CHANGED_EVENT } from "../read-only/ReadOnly.js";
import {
  isElementShape,
  isRelationshipConnection,
  type C4Connection,
  type C4ElementShape,
} from "../scene/types.js";
import type { C4ModelingMethods, C4Views } from "../services.js";
import type C4Append from "./C4Append.js";
import { padEntryHtml, padPreviewEntryHtml, type PadIconName } from "./icons.js";

interface ContextPadEntry {
  group: string;
  html: string;
  title: string;
  action: Record<string, (event: Event) => void>;
}

type Entries = Record<string, ContextPadEntry>;

interface EditLock {
  isReadOnly(): boolean;
}

const EDIT_TITLES: Readonly<Record<LabelField, string>> = {
  name: "Edit name",
  description: "Edit description",
  technology: "Edit technology",
  metadata: "Edit metadata",
};

const EDIT_ICONS: Readonly<Record<LabelField, PadIconName>> = {
  name: "pencil",
  description: "text",
  technology: "cpu",
  metadata: "cpu",
};

/**
 * The context pad (SPEC 5.3), one column like the family's: on an element the appends of the kinds
 * the view creates, then, after a separator, connect and the label editors, then, after another,
 * remove from view and delete from model, by what is selected. No entry switches the view, and
 * none takes the element away but the two named so: the shell kit clicks every other entry and
 * needs the element again for the next (an append selects what it adds). A boundary has no pad, a
 * read-only canvas or view none at all.
 */
export default class C4ContextPadProvider {
  static $inject = ["eventBus", "contextPad", "connect", "canvas", "injector"];

  constructor(
    eventBus: EventBus,
    contextPad: ContextPad,
    private readonly connect: Connect,
    private readonly canvas: Canvas,
    private readonly injector: Injector,
  ) {
    contextPad.registerProvider(this as unknown as BaseContextPadProvider);
    // A pad open when the lock arrives would keep offering edits.
    eventBus.on(READ_ONLY_CHANGED_EVENT, () => {
      const selected = this.injector.get<Selection>("selection", false)?.get() ?? [];
      contextPad.close();
      const [only, ...more] = selected;
      if (only) contextPad.open(more.length > 0 ? selected : only);
    });
  }

  getContextPadEntries(element: Element): Entries {
    if (!this.editable()) return {};
    if (isElementShape(element)) return this.elementEntries(element);
    if (isRelationshipConnection(element)) return this.relationshipEntries(element);
    return {};
  }

  getMultiElementContextPadEntries(elements: Element[]): Entries {
    if (!this.editable()) return {};
    const ids = elements.filter(isElementShape).map((shape) => shape.c4.id);
    const relationships = elements.filter(isRelationshipConnection).map(({ c4 }) => c4.key);
    if (ids.length === 0 && relationships.length === 0) return {};
    const explicit = relationships.filter((key) => !this.isImplied(key));
    return {
      "remove-from-view": this.removeEntry(ids, relationships),
      ...(ids.length > 0 || explicit.length > 0
        ? { "delete-from-model": this.deleteEntry(ids, explicit) }
        : {}),
    };
  }

  private elementEntries(shape: C4ElementShape): Entries {
    const element = this.injector.get<SceneLookup>("c4SceneLookup").element(shape);
    const editable = (field: FieldName) => element?.editable[field] === true;
    const startConnect = this.focusingCanvas((event: Event) =>
      this.connect.start(event as MouseEvent, shape),
    );
    const entries: Entries = {
      ...this.appendEntries(shape),
      connect: {
        group: "edit",
        title: "Connect",
        html: padEntryHtml("workflow", { draggable: true }),
        action: { click: startConnect, dragstart: startConnect },
      },
    };
    if (editable("name")) entries["edit-name"] = this.editEntry(shape, "name");
    if (editable("description")) entries["edit-description"] = this.editEntry(shape, "description");
    const hasTechnology = element?.kind === "container" || element?.kind === "component";
    if (hasTechnology && editable("technology")) {
      entries["edit-technology"] = this.editEntry(shape, "technology");
    }
    if (!this.isScopeOfContextView(shape)) {
      entries["remove-from-view"] = this.removeEntry([shape.c4.id], []);
    }
    entries["delete-from-model"] = this.deleteEntry([shape.c4.id], []);
    return entries;
  }

  /**
   * One entry per kind the view creates, in the palette's order and look: a click appends it
   * beside the element, a drag where it is dropped, connected from the element either way.
   */
  private appendEntries(shape: C4ElementShape): Entries {
    const append = this.injector.get<C4Append>("c4Append", false);
    if (!append) return {};
    const view = this.injector.get<C4Views>("c4Views").active();
    const entries: Entries = {};
    for (const entry of CREATING_ENTRIES[view.type] ?? []) {
      const look = append.lookOf(entry);
      entries[entry.action.replace(/^create\./, "append.")] = {
        group: "append",
        title: `Append ${entry.title.toLowerCase()}`,
        html: padPreviewEntryHtml(shapePreviewSvg(look?.shape ?? entry.shape, look)),
        action: {
          click: this.focusingCanvas(() => append.append(shape, entry)),
          dragstart: this.focusingCanvas((event) => append.startAppend(event, shape, entry)),
        },
      };
    }
    return entries;
  }

  private relationshipEntries(connection: C4Connection): Entries {
    const { key } = connection.c4;
    if (this.isImplied(key)) return { "remove-from-view": this.removeEntry([], [key]) };
    const relationship = this.relationship(key);
    const editable = (field: "description" | "technology") =>
      relationship !== undefined && !relationship.bulk && relationship.fields[field].editable;
    return {
      ...(editable("description")
        ? { "edit-description": this.editEntry(connection, "description") }
        : {}),
      ...(editable("technology")
        ? { "edit-technology": this.editEntry(connection, "technology") }
        : {}),
      "remove-from-view": this.removeEntry([], [key]),
      "delete-from-model": this.deleteEntry([], [key]),
    };
  }

  private editEntry(target: C4ElementShape | C4Connection, field: LabelField): ContextPadEntry {
    return {
      group: "edit",
      title: EDIT_TITLES[field],
      html: padEntryHtml(EDIT_ICONS[field]),
      action: {
        click: () =>
          this.injector.get<LabelEditing>("labelEditing", false)?.activate(target, field),
      },
    };
  }

  private removeEntry(ids: readonly string[], relationships: readonly string[]): ContextPadEntry {
    return {
      group: "delete",
      title: "Remove from view",
      html: padEntryHtml("eye-off"),
      action: {
        click: this.focusingCanvas(() =>
          this.injector.get<C4ModelingMethods>("modeling").removeFromView(ids, relationships),
        ),
      },
    };
  }

  private deleteEntry(ids: readonly string[], relationships: readonly string[]): ContextPadEntry {
    return {
      group: "delete",
      title: "Delete from model…",
      html: padEntryHtml("trash-2", { danger: true }),
      action: {
        click: this.focusingCanvas(() =>
          this.injector.get<C4Dialogs>("c4Dialogs", false)?.deleteFromModel({ ids, relationships }),
        ),
      },
    };
  }

  /**
   * The entries take no focus, so a click on one drops it to `<body>`, where Delete and Cmd/Ctrl+Z
   * do nothing. Whatever the action focused itself (the confirmation dialog of a delete that
   * reaches further) keeps the focus.
   */
  private focusingCanvas(action: (event: Event) => void): (event: Event) => void {
    return (event) => {
      action(event);
      const active = this.canvas.getContainer().ownerDocument.activeElement;
      if (active === null || active.localName === "body") focusCanvasWithoutRing(this.canvas);
    };
  }

  /** A system context view always shows its system: the edit layer refuses to remove it. */
  private isScopeOfContextView(shape: C4ElementShape): boolean {
    const view = this.injector.get<C4Views>("c4Views").active();
    return view.type === "systemContext" && view.scopeId === shape.c4.id;
  }

  private relationship(key: string) {
    const { workspace } = this.injector.get<DocumentStore>("c4Document").current().parse;
    return workspace.relationships.find((relationship) => relationship.canvasKey === key);
  }

  private isImplied(key: string): boolean {
    return this.relationship(key)?.implied ?? false;
  }

  /** The lock and a view the modeler cannot edit leave nothing to do on the canvas. */
  private editable(): boolean {
    if (this.injector.get<EditLock>("readOnly", false)?.isReadOnly()) return false;
    return this.injector.get<C4Views>("c4Views").active().editable;
  }
}
