/*
 * The renderer's services and events that the drawing, the interaction, the apps and the tests
 * build on (SPEC 1.3, 1.7, 11.2 WP6). Frozen interface: a change goes to every work package that
 * depends on it.
 */
import type { Shape } from "diagram-js/lib/model/Types";
import type { ImportResult } from "@miragon/modeler-api";
import type {
  CreatableKind,
  EditNotice,
  EditOutcome,
  EditRefusal,
  ElementFields,
  RelationshipFields,
} from "@miragon/c4-dsl";
import type {
  Box,
  ElementId,
  RelationshipKey,
  StaticViewType,
  ViewCatalog,
  ViewEntry,
  ViewKey,
} from "@miragon/c4-schema-model";
import type { Scene } from "./scene/types.js";

/** The names the injector knows the services by. */
export const C4_SERVICES = {
  document: "c4Document",
  engine: "c4Engine",
  views: "c4Views",
  scene: "c4Scene",
  reconciler: "c4Reconciler",
  modeling: "modeling",
  elementFactory: "c4ElementFactory",
} as const;

export const VIEW_CHANGED_EVENT = "c4.view.changed";
export const EDIT_REFUSED_EVENT = "c4.edit.refused";
export const EDIT_NOTICE_EVENT = "c4.edit.notice";
/**
 * `rebaseText` took new bytes without a render: what reads positions in the text (the
 * inspector's "Defined on line N") shows them anew.
 */
export const TEXT_REBASED_EVENT = "c4.text.rebased";
/**
 * "Lay out automatically" changed the layout of the view shown, after its command ran: the apps
 * fit the view to the new layout, which may lie where the viewport doesn't look.
 */
export const LAYOUT_APPLIED_EVENT = "c4.layout.applied";
/**
 * Delete or Backspace (the smart delete) ran, after its command: what went from the model and
 * what only from the view shown, which the app tells the user, since the key chose for them.
 */
export const DELETE_DONE_EVENT = "c4.delete.done";

/** Why the canvas shows another view; `removed`: the edit deleted the view that was shown. */
export type ViewChangeCause = "user" | "reveal" | "host" | "undo" | "redo" | "rekey" | "removed";

export interface ViewChangedEvent {
  readonly view: ViewKey;
  readonly previous: ViewKey;
  readonly cause: ViewChangeCause;
}

/**
 * How the app shows a refusal (guide §9): `info` when the message explains a rule the edit would
 * break, `danger` when an edit went wrong.
 */
export type RefusalLevel = "info" | "danger";

export interface EditRefusedEvent {
  readonly reason: EditRefusal;
  readonly message: string;
  /** `refusalLevel(reason)` where the renderer fires it; without it, the apps show `danger`. */
  readonly level?: RefusalLevel;
}

export interface EditNoticeEvent {
  readonly notice: EditNotice;
}

export interface LayoutAppliedEvent {
  readonly view: ViewKey;
}

/** Selected items of one outcome of the smart delete, in the order of the selection. */
export interface DeletedItems {
  /** The elements' names. */
  readonly elements: readonly string[];
  /** Each relationship as "Source → Destination", by the names of its ends. */
  readonly relationships: readonly string[];
}

export interface DeleteDoneEvent {
  readonly view: ViewKey;
  readonly fromModel: DeletedItems;
  /** Still in the model, since another view, a dynamic step, an instance or a scope needs it. */
  readonly fromView: DeletedItems;
}

/** The service `c4Views`: one view on the canvas at a time (SPEC 1.7, 4.5). */
export interface C4Views {
  active(): ViewEntry;
  catalog(): ViewCatalog;
  resolves(key: ViewKey): boolean;
  open(key: ViewKey, options: { readonly cause: ViewChangeCause }): boolean;
  parent(): ViewEntry | undefined;
  childOf(id: ElementId): ViewEntry | undefined;
  /** The viewbox the view was left at, remembered at the switch. */
  viewboxFor(key: ViewKey): Box | undefined;
}

/** The service `c4Scene`. */
export interface C4SceneService {
  current(): Scene;
  of(view: ViewKey): Scene;
}

/** The service `c4ElementFactory`: a preview shape `preview:<n>` of the default size (SPEC 1.1). */
export interface C4ElementFactory {
  createNew(kind: CreatableKind, name?: string, tags?: readonly string[]): Shape;
}

/**
 * The domain methods of `C4Modeling` for the label editor, the inspector, the menus, the dialogs,
 * the apps and the harness (SPEC 1.3). Each runs one document command, or refuses and fires
 * `c4.edit.refused`; `undefined` when nothing ran.
 */
export interface C4ModelingMethods {
  editElement(id: ElementId, fields: Partial<ElementFields>): EditOutcome | undefined;
  /** "Add relationship…": a relationship of the current view, as the connect tool draws one. */
  createRelationship(
    sourceId: ElementId,
    destinationId: ElementId,
    fields?: Partial<Pick<RelationshipFields, "description" | "technology">>,
  ): EditOutcome | undefined;
  editRelationship(
    key: RelationshipKey,
    fields: Partial<RelationshipFields>,
  ): EditOutcome | undefined;
  renameIdentifier(id: ElementId, identifier: string): EditOutcome | undefined;
  removeFromView(
    ids: readonly ElementId[],
    relationships: readonly RelationshipKey[],
  ): EditOutcome | undefined;
  deleteFromModel(
    ids: readonly ElementId[],
    relationships: readonly RelationshipKey[],
  ): EditOutcome | undefined;
  includeInView(ids: readonly ElementId[]): EditOutcome | undefined;
  createView(type: StaticViewType, scopeId?: ElementId, title?: string): EditOutcome | undefined;
  editView(
    key: ViewKey,
    fields: { title?: string | null; description?: string | null },
  ): EditOutcome | undefined;
  deleteView(key: ViewKey): EditOutcome | undefined;
  /** `clearLayout` on the current view. */
  layOutAutomatically(): EditOutcome | undefined;
  editWorkspace(fields: { name?: string; description?: string }): EditOutcome | undefined;
  applyC4Colours(): EditOutcome | undefined;
  insertExample(exampleText: string): EditOutcome | undefined;
}

/** What the contract wrapper adds for the apps and the harness. */
export interface C4DiagramExtras {
  /** `view` is renderer-only (the VS Code webview); a contract import shows the default view. */
  importText(text: string, options?: { readonly view?: ViewKey }): Promise<ImportResult>;
  /** Takes a formatting-only or comment-only change without a render; false otherwise. */
  rebaseText(text: string): boolean;
  /** The model has no element (the empty-file hint), not "this view is empty". */
  isModelEmpty(): boolean;
  readonly views: Pick<C4Views, "active" | "catalog" | "open" | "parent" | "viewboxFor">;
  readonly c4: C4ModelingMethods;
}
