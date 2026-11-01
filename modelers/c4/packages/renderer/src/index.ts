import "./assets/c4.css";

export {
  BaseViewer,
  CONTAINER_CLASS,
  type DiagramOptions,
  type ImportOptions,
  type ImportOutcome,
} from "./BaseViewer.js";
export { Viewer } from "./Viewer.js";
export { NavigatedViewer } from "./NavigatedViewer.js";
export { Modeler } from "./Modeler.js";
export {
  NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type C4ViewState,
  type CollaborativeDiagram,
  type CollaborativeOptions,
  type DiagramElementsSurface,
} from "./collaborative/index.js";
export { THEMES } from "./themes.js";
export { createC4Engine, type C4Engine } from "./engine/index.js";
export { DocumentStore, INITIAL_VIEW, hashText, type DocumentState } from "./document/index.js";
export {
  C4HistoryMismatchError,
  C4Modeling,
  C4UnsupportedOperationError,
  DOCUMENT_CHANGE,
  READ_ONLY_MESSAGE,
  type C4ModelingConfig,
  type DocumentChangeContext,
} from "./modeling/index.js";
export { Reconciler, boundaryCanvasId, relationshipCanvasId } from "./reconcile/index.js";
export { buildScene, DRAFT_AUTO_LAYOUT, SceneService } from "./scene/index.js";
export { ViewService } from "./views/index.js";
export {
  c4ReferenceOf,
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
  type C4BoundaryShape,
  type C4Connection,
  type C4ElementReference,
  type C4ElementShape,
  type C4PreviewReference,
  type C4Reference,
  type C4RelationshipReference,
  type C4Shape,
  type LegendRow,
  type Scene,
  type SceneBoundary,
  type SceneElement,
  type SceneGroup,
  type SceneRelationship,
} from "./scene/types.js";
export {
  C4_SERVICES,
  DELETE_DONE_EVENT,
  EDIT_NOTICE_EVENT,
  EDIT_REFUSED_EVENT,
  LAYOUT_APPLIED_EVENT,
  TEXT_REBASED_EVENT,
  VIEW_CHANGED_EVENT,
  type C4DiagramExtras,
  type C4ElementFactory,
  type C4ModelingMethods,
  type C4SceneService,
  type C4Views,
  type DeleteDoneEvent,
  type DeletedItems,
  type EditNoticeEvent,
  type EditRefusedEvent,
  type LayoutAppliedEvent,
  type ViewChangeCause,
  type ViewChangedEvent,
} from "./services.js";
export { Gestures, type GestureListener } from "./gestures/index.js";
export { ContentBounds, ROOT_ID, saveSVG, type Bounds } from "./io/index.js";
export { LabelEditing, type OpenLabelEdit } from "./label-editing/index.js";
export { ReadOnly, READ_ONLY_CHANGED_EVENT } from "./read-only/index.js";
export {
  COLORS,
  DRILL_CLASS,
  FONT,
  PREVIEW_SIZE,
  ROLE_LIGHT,
  TEXT_RELAYOUT_EVENT,
  boundaryPreviewSvg,
  fontsReady,
  groupPreviewSvg,
  relationshipPreviewSvg,
  shapePreviewSvg,
} from "./draw/index.js";
export { legendPreview, legendRows, renderLegend } from "./legend/index.js";
export * from "./menu/index.js";
