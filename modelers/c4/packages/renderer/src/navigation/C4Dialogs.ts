import type EventBus from "diagram-js/lib/core/EventBus";
import type { Injector } from "didi";
import type { ViewKey } from "@miragon/c4-schema-model";
import {
  EDIT_REFUSED_EVENT,
  type C4ModelingMethods,
  type C4Views,
  type EditRefusedEvent,
} from "../services.js";
import { showAddElementDialog } from "./AddElementDialog.js";
import { deleteImpactIn, confirmDeleteFromModel, type DeleteSelection } from "./deleteFromModel.js";
import { reachesBeyondSelection } from "./impact.js";
import { showViewSettingsDialog, showWorkspaceSettingsDialog } from "./SettingsDialogs.js";
import type { C4DialogModeler, DialogChrome, DialogTarget, OpenedDialog } from "./types.js";
import { showViewsDialog } from "./ViewsDialog.js";

/** The viewer edits nothing. */
const NO_EDITS: C4ModelingMethods = {
  editElement: () => undefined,
  editRelationship: () => undefined,
  renameIdentifier: () => undefined,
  removeFromView: () => undefined,
  deleteFromModel: () => undefined,
  includeInView: () => undefined,
  createView: () => undefined,
  editView: () => undefined,
  deleteView: () => undefined,
  layOutAutomatically: () => undefined,
  editWorkspace: () => undefined,
  applyC4Colours: () => undefined,
  insertExample: () => undefined,
};

export const NO_CONFIRMATION_MESSAGE =
  "This also deletes what is nested in it or shown in other views, and the app can't ask first. Delete it in the text instead.";

/**
 * The service `c4Dialogs`: the modeler's dialogs for the canvas keys (G, Shift+Delete), the
 * context pad, the menu and the inspector. They open on the host's chrome, which the app hands
 * over once it is mounted (`connectDialogs`); without one, a dialog opens nothing. One dialog at
 * a time; it closes with the diagram.
 */
export default class C4Dialogs {
  static $inject = ["eventBus", "injector"];

  private chrome: DialogChrome | undefined;
  private shown: OpenedDialog | undefined;
  private destroyed = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly injector: Injector,
  ) {
    eventBus.on("diagram.destroy", () => {
      this.destroyed = true;
      this.shown?.close();
      this.shown = undefined;
      this.chrome = undefined;
    });
  }

  /** `{ container: shell.root, openDialog: openShellDialog }`; undefined disconnects. */
  connect(chrome: DialogChrome | undefined): void {
    if (!this.destroyed) this.chrome = chrome;
  }

  isConnected(): boolean {
    return this.chrome !== undefined && !this.destroyed;
  }

  showViews(): OpenedDialog | undefined {
    return this.show((target) => showViewsDialog(target));
  }

  showAddElement(): OpenedDialog | undefined {
    return this.show((target) => showAddElementDialog(target));
  }

  showViewSettings(view?: ViewKey): OpenedDialog | undefined {
    return this.show((target) =>
      showViewSettingsDialog(view === undefined ? target : { ...target, view }),
    );
  }

  showWorkspaceSettings(): OpenedDialog | undefined {
    return this.show((target) => showWorkspaceSettingsDialog(target));
  }

  /**
   * "Delete from model…" (SPEC 5.4): at once when nothing beyond the selection goes, else after
   * the user confirmed. Without a chrome to ask on, such a delete is refused.
   */
  deleteFromModel(selection: DeleteSelection): void {
    if (this.destroyed || (selection.ids.length === 0 && selection.relationships.length === 0)) {
      return;
    }
    const modeler = this.modeler();
    if (!reachesBeyondSelection(deleteImpactIn(modeler, selection))) {
      modeler.c4.deleteFromModel(selection.ids, selection.relationships);
      return;
    }
    const chrome = this.chrome;
    if (!chrome) {
      const refusal: EditRefusedEvent = { reason: "not-allowed", message: NO_CONFIRMATION_MESSAGE };
      this.eventBus.fire(EDIT_REFUSED_EVENT, refusal);
      return;
    }
    void confirmDeleteFromModel({ ...chrome, modeler, ...selection }).then((confirmed) => {
      if (confirmed && !this.destroyed) {
        modeler.c4.deleteFromModel(selection.ids, selection.relationships);
      }
    });
  }

  /** The diagram as the dialogs read and edit it. */
  modeler(): C4DialogModeler {
    const injector = this.injector;
    return {
      views: injector.get<C4Views>("c4Views"),
      c4: injector.get<C4ModelingMethods>("modeling", false) ?? NO_EDITS,
      diagram: { get: <T>(name: string) => injector.get<T>(name) },
    };
  }

  private show(open: (target: DialogTarget) => OpenedDialog): OpenedDialog | undefined {
    const chrome = this.chrome;
    if (!chrome || this.destroyed) return undefined;
    if (this.shown?.isOpen()) return this.shown;
    this.shown = open({ ...chrome, modeler: this.modeler() });
    return this.shown;
  }
}

/** Hands the app's dialog chrome to the diagram's `c4Dialogs` service. */
export function connectDialogs(
  modeler: { readonly diagram: { get<T>(name: string): T } },
  chrome: DialogChrome | undefined,
): void {
  modeler.diagram.get<C4Dialogs>("c4Dialogs").connect(chrome);
}
