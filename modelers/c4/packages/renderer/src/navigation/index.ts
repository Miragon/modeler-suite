import type { ModuleDeclaration } from "didi";
import KeyboardModule from "diagram-js/lib/features/keyboard";
import SelectionModule from "diagram-js/lib/features/selection";
import CanvasKeys from "../keyboard/CanvasKeys.js";
import Breadcrumbs from "./Breadcrumbs.js";
import C4Dialogs from "./C4Dialogs.js";
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

export { BREADCRUMBS_CLASS, BREADCRUMBS_LABEL, default as Breadcrumbs } from "./Breadcrumbs.js";
export { LANDSCAPE_CRUMB, breadcrumbPath, crumbText, type Crumb } from "./breadcrumbPath.js";

export { default as C4Dialogs, connectDialogs, NO_CONFIRMATION_MESSAGE } from "./C4Dialogs.js";
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
