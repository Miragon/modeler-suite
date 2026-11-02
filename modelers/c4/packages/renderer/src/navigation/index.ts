import type { ModuleDeclaration } from "didi";
import KeyboardModule from "diagram-js/lib/features/keyboard";
import OverlaysModule from "diagram-js/lib/features/overlays";
import SelectionModule from "diagram-js/lib/features/selection";
import CanvasKeys from "../keyboard/CanvasKeys.js";
import Breadcrumbs from "./Breadcrumbs.js";
import C4Dialogs from "./C4Dialogs.js";
import EmptyScopeHint from "./EmptyScopeHint.js";
import HiddenRelationshipsHint from "./HiddenRelationshipsHint.js";
import Navigation from "./Navigation.js";

/**
 * Drill-down, parent and the dialogs (SPEC 7). Navigation writes nothing, so the viewer loads it
 * too; it brings the canvas's key guard, since the viewer has no keyboard module of its own.
 */
export const navigationModule: ModuleDeclaration = {
  __depends__: [KeyboardModule, SelectionModule],
  __init__: ["canvasKeys", "c4Navigation", "c4Dialogs", "c4Breadcrumbs"],
  canvasKeys: ["type", CanvasKeys],
  c4Navigation: ["type", Navigation],
  c4Dialogs: ["type", C4Dialogs],
  c4Breadcrumbs: ["type", Breadcrumbs],
};

/** The modeler's hint in an empty scope frame: it points at the palette, which the viewer lacks. */
export const emptyScopeHintModule: ModuleDeclaration = {
  __depends__: [OverlaysModule],
  __init__: ["c4EmptyScopeHint"],
  c4EmptyScopeHint: ["type", EmptyScopeHint],
};

/** The modeler's chip of the relationships a view can't draw: it opens an editing dialog. */
export const hiddenRelationshipsHintModule: ModuleDeclaration = {
  __init__: ["c4HiddenRelationshipsHint"],
  c4HiddenRelationshipsHint: ["type", HiddenRelationshipsHint],
};

export {
  BREADCRUMBS_CLASS,
  BREADCRUMBS_LABEL,
  DRAFT_NOTE,
  default as Breadcrumbs,
} from "./Breadcrumbs.js";
export {
  EMPTY_SCOPE_HINT_ACTION,
  EMPTY_SCOPE_HINT_CLASS,
  default as EmptyScopeHint,
} from "./EmptyScopeHint.js";
export { LANDSCAPE_CRUMB, breadcrumbPath, crumbText, type Crumb } from "./breadcrumbPath.js";
export {
  HIDDEN_RELATIONSHIPS_CLASS,
  default as HiddenRelationshipsHint,
  hiddenRelationshipsText,
} from "./HiddenRelationshipsHint.js";
export {
  ASSIGN_LABEL,
  MOVE_TO_COMPONENT_TITLE,
  MOVE_TO_CONTAINER_TITLE,
  moveEntryLabel,
  showMoveRelationshipDialog,
} from "./MoveRelationshipDialog.js";

export {
  default as C4Dialogs,
  connectDialogs,
  DIALOGS_CONNECTED_EVENT,
  NO_CONFIRMATION_MESSAGE,
} from "./C4Dialogs.js";
export { default as Navigation } from "./Navigation.js";
export { ADD_ELEMENT_TITLE, addableElements, showAddElementDialog } from "./AddElementDialog.js";
export { confirmDeleteFromModel, deleteImpactIn, type DeleteSelection } from "./deleteFromModel.js";
export { confirmDestructive, type ConfirmRequest } from "./dialog.js";
export {
  deleteImpactOf,
  deleteQuestion,
  reachesBeyondSelection,
  type DeleteImpact,
  type DeleteQuestion,
} from "./impact.js";
export {
  VIEW_SETTINGS_TITLE,
  WORKSPACE_SETTINGS_TITLE,
  showViewSettingsDialog,
  showWorkspaceSettingsDialog,
} from "./SettingsDialogs.js";
export type {
  C4DialogModeler,
  DialogChrome,
  DialogOptions,
  DialogTarget,
  OpenDialog,
  OpenedDialog,
} from "./types.js";
export { VIEWS_DIALOG_TITLE, showViewsDialog } from "./ViewsDialog.js";
