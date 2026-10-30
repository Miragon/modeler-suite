import "./assets/event-storming.css";

export { Viewer } from "./Viewer.js";
export { NavigatedViewer } from "./NavigatedViewer.js";
export { Modeler } from "./Modeler.js";
export { EventStormingBaseViewer } from "./EventStormingBaseViewer.js";
export type { EventStormingViewerOptions, EventCallback } from "./EventStormingBaseViewer.js";
export {
  EVENT_STORMING_NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
} from "./collaborative/index.js";
export type {
  CollaborativeEventStormingModeler,
  CollaborativeEventStormingOptions,
  EventStormingElementsSurface,
} from "./collaborative/index.js";

export { eventStormingModelModule, EventStormingElementFactory } from "./model/index.js";
export { boardBoundsModule, BoardBounds } from "./board-bounds/index.js";
export { eventStormingDrawModule, EventStormingRenderer } from "./draw/index.js";
export {
  eventStormingViewOptionsModule,
  EventStormingViewOptions,
  VIEW_OPTIONS_CHANGED_EVENT,
} from "./view-options/index.js";
export { COLORS, STICKY_STYLES, NOTE_STYLE } from "./draw/styles.js";
export { parseNoteMarkdown, serializeNoteMarkdown, plainNoteText } from "./draw/note-markdown.js";
export type { NoteLine, NoteRun } from "./draw/note-markdown.js";

/* Miragon brand tokens (single source of truth for colour) — for consumers theming their own chrome. */
export { MIRAGON, EVENT_STORMING_THEMES } from "./theme/index.js";
export {
  ioModule,
  EventStormingImporter,
  EventStormingExporter,
  saveSVG,
  ROOT_ID,
} from "./io/index.js";
export { eventStormingModelingModule, EventStormingModeling } from "./modeling/index.js";
export type { LabelChange } from "./modeling/index.js";
export {
  eventStormingVocabularyModule,
  EventStormingSpellingVariants,
  SPELLING_VARIANT_OVERLAY,
} from "./vocabulary/index.js";
/* The board's aggregates with their commands and events (issue #116): the grouping of the schema
   model, the dialog's rows as data, the table, and the service behind "Aggregates…". */
export {
  groupByAggregate,
  type AggregateGroup,
  type CommandEventPair,
  type NamedStickies,
} from "@miragon/event-storming-schema-model";
export {
  eventStormingAggregatesModule,
  EventStormingAggregates,
  AGGREGATES_DIALOG_CLASS,
  AGGREGATES_DIALOG_TITLE,
  AGGREGATES_TABLE_LABEL,
  aggregateTableRows,
  renderAggregateTable,
} from "./aggregates/index.js";
export type {
  AggregateEntryKind,
  AggregateTableEntry,
  AggregateTableLine,
  AggregateTableOptions,
  AggregateTableRow,
  AggregatesDialog,
  AggregatesDialogChrome,
  AggregatesDialogOptions,
} from "./aggregates/index.js";
export { eventStormingRulesModule, EventStormingRules } from "./rules/index.js";
export { elementSnappingModule } from "./snapping/index.js";
export { eventStormingPaletteModule } from "./palette/index.js";
export { eventStormingHoverTooltipTeardownModule } from "./palette/EventStormingHoverTooltipTeardown.js";
export { eventStormingContextPadModule } from "./context-pad/index.js";
export { labelEditingModule, EventStormingLabelEditing } from "./label-editing/index.js";
export { eventStormingKeyboardModule } from "./keyboard/index.js";
export type { EventStormingKeyboardConfig } from "./keyboard/index.js";
export {
  eventStormingPopupModule,
  EventStormingElementSettingsProvider,
  POPUP_PROVIDER_ID,
} from "./popup/index.js";
export { eventStormingAppendModule, EventStormingAppendBehavior } from "./append/index.js";
export { eventStormingAttachModule, EventStormingAttachBehavior } from "./attach/index.js";
export { eventStormingColorPickerModule, EventStormingColorPicker } from "./color-picker/index.js";
export { eventStormingResizeModule, EventStormingResizeBehavior } from "./resize/index.js";
export {
  eventStormingReadOnlyModule,
  EventStormingReadOnly,
  READ_ONLY_CHANGED_EVENT,
} from "./read-only/index.js";
export type { FreeArea, FreeRectInsets } from "./palette/EventStormingPaletteProvider.js";

/* The board's menu entries and keyboard shortcuts for the chrome around it (guide §5.4), typed
   structurally so a host hands them to @miragon/modeler-shell without the renderer importing it. */
export {
  boardMenu,
  BOARD_LEVELS,
  STORM_EXPORT_LABEL,
  boardShortcuts,
  commandKeyLabel,
  createShortcutsDialog,
} from "./board-menu/index.js";
export type {
  BoardAggregates,
  BoardExport,
  BoardExports,
  BoardLevels,
  BoardMenu,
  BoardMenuAction,
  BoardMenuActions,
  BoardMenuCheckbox,
  BoardMenuDialog,
  BoardMenuEntry,
  BoardMenuIcon,
  BoardMenuRadioGroup,
  BoardShortcutOptions,
  ShortcutGroup,
  ShortcutKeyNames,
  ShortcutPlatform,
  ShortcutRow,
  ShortcutsChrome,
  ShortcutsDialog,
  ShortcutsDialogChrome,
  TypeCaptions,
} from "./board-menu/index.js";

export {
  isEventStormingShape,
  isEventStormingConnection,
  isSticky,
  isStickyKind,
  isAttachableKind,
  isHostKind,
  isAttachableSticky,
  isHostSticky,
  STICKY_KINDS,
} from "./model/di-types.js";
export type {
  EventStormingShape,
  EventStormingConnection,
  EventStormingShapeType,
  EventStormingConnectionType,
  StickyKind,
} from "./model/di-types.js";
export type { ImportWarning, RootBusinessObject } from "./io/index.js";
export { importWarningText } from "./io/index.js";
