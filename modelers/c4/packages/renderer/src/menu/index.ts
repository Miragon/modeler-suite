export {
  PARENT_VIEW_KEY,
  SHORTCUTS_KEY,
  STRUCTURIZR_EXPORT_LABEL,
  TEXT_EXPORT_LABEL,
  VIEWS_KEY,
  c4Menu,
  c4ModelMenu,
  diagramMenu,
} from "./menu.js";
export type {
  C4MenuActions,
  C4MenuModeler,
  DiagramExport,
  DiagramMenu,
  DiagramMenuAction,
  DiagramMenuActions,
  DiagramMenuDialog,
  DiagramMenuEntry,
  DiagramMenuIcon,
} from "./menu.js";
export { SMART_DELETE_ROW, c4Shortcuts, commandKeyLabel, diagramShortcuts } from "./shortcuts.js";
export type {
  C4ShortcutsOptions,
  DiagramShortcutsOptions,
  ShortcutGroup,
  ShortcutHost,
  ShortcutKeyNames,
  ShortcutPlatform,
  ShortcutRow,
  ShortcutsChrome,
} from "./shortcuts.js";
export { createShortcutsDialog } from "./ShortcutsDialog.js";
export {
  BREADCRUMB_FIT_GAP,
  insetsClearOfBreadcrumb,
  type FitInsets,
} from "./breadcrumbClearance.js";
export { connectLegend, type LegendBinding } from "./legendBinding.js";
export type {
  ShortcutsDialog,
  ShortcutsDialogChrome,
  ShortcutsDialogOptions,
  ShownShortcutsDialog,
} from "./ShortcutsDialog.js";

// The other parts the apps mount around the diagram, exported with the menu: the package index
// re-exports this module as a whole.
export {
  mountInspector,
  type InspectorHandle,
  type InspectorOptions,
  type InspectorSlot,
} from "../inspector/index.js";
export {
  ADD_ELEMENT_TITLE,
  C4Dialogs,
  NO_CONFIRMATION_MESSAGE,
  VIEWS_DIALOG_TITLE,
  VIEW_SETTINGS_TITLE,
  WORKSPACE_SETTINGS_TITLE,
  addableElements,
  confirmDeleteFromModel,
  confirmDestructive,
  connectDialogs,
  deleteImpactIn,
  deleteImpactOf,
  deleteQuestion,
  navigationModule,
  reachesBeyondSelection,
  showAddElementDialog,
  showViewSettingsDialog,
  showViewsDialog,
  showWorkspaceSettingsDialog,
  type C4DialogModeler,
  type ConfirmRequest,
  type DeleteImpact,
  type DeleteQuestion,
  type DeleteSelection,
  type DialogChrome,
  type DialogOptions,
  type DialogTarget,
  type OpenDialog,
  type OpenedDialog,
} from "../navigation/index.js";
export { VIEW_TYPE_LABELS } from "../navigation/ViewsDialog.js";
export {
  editAtField,
  type FieldEdit,
  type LabelField,
  type LabelTarget,
} from "../label-editing/index.js";
