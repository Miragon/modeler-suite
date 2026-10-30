/**
 * @miragon/team-topologies-renderer — a framework-agnostic diagram-js modeler for the Team
 * Topologies notation. React-free and DOM-dependent, so it can be embedded
 * as-is in any host (the web app, or later a VS Code webview). Depends only on
 * diagram-js and @miragon/team-topologies-schema-model.
 */

import "./assets/team-topologies.css";

// Viewer layering
export { Viewer } from "./Viewer.js";
export { NavigatedViewer } from "./NavigatedViewer.js";
export { Modeler } from "./Modeler.js";
export { TtBaseViewer } from "./TtBaseViewer.js";
export type { TtViewerOptions, ImportOptions, EventCallback } from "./TtBaseViewer.js";

// The collaborative-modeler contract of @miragon/modeler-api
export {
  TEAM_TOPOLOGIES_NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
  parseDocumentText,
} from "./collaborative/index.js";
export { TEAM_TOPOLOGIES_THEMES } from "./theme/themes.js";
export type {
  CollaborativeTeamTopologiesModeler,
  CollaborativeTeamTopologiesOptions,
  TtElementsSurface,
} from "./collaborative/index.js";

// Modules (for additionalModules / extension) + their services
export { ttModelModule, TtElementFactory } from "./model/index.js";
export { ttDrawModule, TeamTopologiesRenderer } from "./draw/index.js";
export { ioModule, TtImporter, TtExporter, TtViewport, saveSVG, ROOT_ID } from "./io/index.js";
export { ttModelingModule, TtModeling, TtLayouter } from "./modeling/index.js";
export { ttRulesModule, TtRules } from "./rules/index.js";
export {
  ttBehaviorsModule,
  TtFlatModelBehavior,
  TtAssociationBehavior,
} from "./behaviors/index.js";
export { ttPaletteModule, TtPaletteProvider } from "./palette/index.js";
export type { TtPaletteConfig, Point } from "./palette/TtPaletteProvider.js";
export { ttContextPadModule, TtContextPadProvider } from "./context-pad/index.js";
export { ttLabelEditingModule, TtLabelEditing } from "./label-editing/index.js";
export { ttKeyboardModule, TtKeyboard } from "./keyboard/index.js";
export type { TtKeyboardConfig } from "./keyboard/index.js";
export { ttReadOnlyModule, TtReadOnly, READ_ONLY_CHANGED_EVENT } from "./read-only/index.js";
export { ttZOrderModule, TtZOrder } from "./zorder/index.js";

// Runtime types & guards
export {
  isTtElement,
  isTtTeam,
  isTtInteraction,
  isTtFlow,
  isTtAnnotation,
  isTtAssociation,
} from "./model/di-types.js";
export type {
  TtElement,
  TtTeam,
  TtInteraction,
  TtFlow,
  TtAnnotation,
  TtAssociation,
} from "./model/di-types.js";
export type { ImportWarning, RootBusinessObject } from "./io/index.js";

// Miragon design tokens (pure data) — for host code that paints outside CSS, e.g. canvas exports.
export { MIRAGON, CD_TOKENS } from "./theme/index.js";

// Functional icons as SVG markup (context pad, palette tools).
export {
  ICON_LINK,
  ICON_MESSAGE_SQUARE_PLUS,
  ICON_PENCIL,
  ICON_SQUARE_DASHED_MOUSE_POINTER,
  ICON_TRASH,
  iconMarkup,
} from "./draw/icons.js";
export type { IconMarkupOptions, IconNode } from "./draw/icons.js";

// Palette glyphs — reusable for host chrome (e.g. the legend).
export {
  teamIconSvg,
  interactionIconSvg,
  flowIconSvg,
  annotationIconSvg,
} from "./draw/palette-icons.js";

// What a host's chrome shows around the canvas, typed structurally (a modeler-shell handle fits):
// the menu entries, the shortcut groups, the title dialog and the legend rows.
export {
  JSON_EXPORT_LABEL,
  SHORTCUTS_DIALOG_KEY,
  createTitleDialog,
  diagramMenu,
  diagramShortcuts,
} from "./chrome/index.js";
export type {
  ChromeDialog,
  DiagramExport,
  DiagramExports,
  DiagramMenu,
  DiagramMenuAction,
  DiagramMenuActions,
  DiagramMenuDialog,
  DiagramMenuEntry,
  DiagramMenuIcon,
  DiagramShortcutOptions,
  DiagramTitle,
  DialogChrome,
  ShortcutGroup,
  ShortcutKeyNames,
  ShortcutPlatform,
  ShortcutRow,
  ShortcutsChrome,
  TitleDialog,
  TitleDialogChrome,
} from "./chrome/index.js";
export { legendGroups, renderLegend } from "./legend/index.js";
export type { LegendGroup, LegendRow } from "./legend/index.js";
