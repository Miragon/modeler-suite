/**
 * @miragon/context-maps-renderer — a framework-agnostic diagram-js modeler for
 * DDD context maps (bounded contexts + context-mapping relationships).
 * React-free and DOM-dependent, so it can be embedded as-is in any host (the web
 * app, or later a VS Code webview). Depends only on diagram-js and
 * @miragon/context-maps-schema-model.
 */

import "./assets/context-maps.css";

// Viewer layering
export { Viewer } from "./Viewer.js";
export { NavigatedViewer } from "./NavigatedViewer.js";
export { Modeler } from "./Modeler.js";
export { CmBaseViewer } from "./CmBaseViewer.js";
export type { CmViewerOptions, EventCallback, FreeRectInsets } from "./CmBaseViewer.js";

// The collaborative-modeler contract of @miragon/modeler-api (editor and viewer mounts)
export {
  CONTEXT_MAPS_NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
} from "./collaborative/index.js";
export type {
  CollaborativeContextMapsModeler,
  CollaborativeContextMapsOptions,
} from "./collaborative/index.js";

// Modules (for additionalModules / extension) + their services
export { cmModelModule, CmElementFactory } from "./model/index.js";
export { cmDrawModule, ContextMapsRenderer } from "./draw/index.js";
export { ioModule, CmImporter, CmExporter, saveSVG, ROOT_ID } from "./io/index.js";
export { cmModelingModule, CmModeling } from "./modeling/index.js";
export { cmRulesModule, CmRules } from "./rules/index.js";
export { cmBehaviorsModule, CmFlatModelBehavior } from "./behaviors/index.js";
export { cmPaletteModule, CmPaletteProvider } from "./palette/index.js";
export type { CmPaletteConfig } from "./palette/index.js";
export { cmConnectHandlesModule, CmConnectHandles } from "./connect-handles/index.js";
export { cmContextPadModule, CmContextPadProvider } from "./context-pad/index.js";
export { cmLegendModule, CmLegend, legendGroups, renderLegend } from "./legend/index.js";
export type { LegendGroup, LegendRenderOptions, LegendRow, LegendTooltip } from "./legend/index.js";
export { cmHoverTooltipModule, CmHoverTooltip, hoverTipFor } from "./hover-tooltip/index.js";
export { cmLabelEditingModule, CmLabelEditing } from "./label-editing/index.js";
export { cmKeyboardModule, CmKeyboard } from "./keyboard/index.js";
export type { CmKeyboardConfig } from "./keyboard/index.js";
export { cmReadOnlyModule, CmReadOnly, READ_ONLY_CHANGED_EVENT } from "./read-only/index.js";
export { cmZOrderModule, CmZOrder } from "./zorder/index.js";

// The map's part of a host's chrome: menu entries, the keyboard shortcuts and the title dialogs
export {
  JSON_EXPORT_LABEL,
  contextMapMenu,
  contextMapShortcuts,
  createShortcutsDialog,
  createTitleDialog,
} from "./chrome/index.js";
export type {
  ChromeDialog,
  ContextMapShortcutOptions,
  DialogChrome,
  MapExport,
  MapExports,
  MapMenu,
  MapMenuAction,
  MapMenuActions,
  MapMenuDialog,
  MapMenuEntry,
  MapMenuIcon,
  MapTitle,
  ShortcutGroup,
  ShortcutKeyNames,
  ShortcutPlatform,
  ShortcutRow,
  ShortcutsChrome,
  ShortcutsDialog,
  ShortcutsDialogChrome,
  TitleDialog,
  TitleDialogChrome,
} from "./chrome/index.js";

// Runtime types & guards
export { isCmElement, isCmContext, isCmRelationship } from "./model/di-types.js";
export type { CmElement, CmContext, CmRelationship } from "./model/di-types.js";
export type { ImportWarning, RootBusinessObject } from "./io/index.js";

// Palette glyphs — reusable for host chrome (e.g. an inspector).
export {
  contextIconSvg,
  relationshipIconSvg,
  roleChipSvg,
  subdomainIconSvg,
} from "./draw/palette-icons.js";

// Miragon brand palette — single source for every non-notation colour (see theme/palette.ts).
export { MIRAGON, CD_TOKENS } from "./theme/index.js";
// The modes the map can be drawn in: the contract's appearance.themes, read by both apps.
export { CONTEXT_MAPS_THEMES } from "./theme/index.js";
