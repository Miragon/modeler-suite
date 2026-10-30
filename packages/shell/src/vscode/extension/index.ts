export type {
  ColorThemeLike,
  CustomEditorRegistrationOptions,
  CustomTextEditorProviderLike,
  DisposableLike,
  EditorWebviewPanelLike,
  FileUriLike,
  PositionLike,
  RangeLike,
  SaveDialogOptionsLike,
  TextDocumentChangeEventLike,
  TextDocumentLike,
  UriLike,
  VsCodeEditorLike,
  VsCodeFilesLike,
  VsCodeLike,
  WebviewLike,
  WebviewPanelLike,
  WorkspaceEditLike,
} from "./types.js";
export type { WebviewHtmlOptions } from "./html.js";
export { createNonce, renderWebviewHtml } from "./html.js";
export type { ThemeBridgeOptions } from "./theme-bridge.js";
export { connectThemeBridge, currentAppearance } from "./theme-bridge.js";
export { revealFileLabel } from "./reveal.js";
export type {
  ExportKind,
  ExportToFileOptions,
  FileCommandMessageOverrides,
  FileCommandMessages,
  NewDocumentOptions,
} from "./file-commands.js";
export {
  IMAGE_EXPORT_KINDS,
  createNewDocument,
  defaultFileCommandMessages,
  exportToFile,
  registerNewDocumentCommand,
} from "./file-commands.js";
export type { LineEdit } from "./text-lines.js";
export { minimalLineEdit, splitLines } from "./text-lines.js";
export type {
  DocumentWriteOptions,
  DocumentWriter,
  VsCodeDocumentEditLike,
} from "./document-writer.js";
export { createDocumentWriter } from "./document-writer.js";
export type {
  ModelerEditor,
  ModelerEditorDiagnostics,
  ModelerEditorOptions,
  ModelerEditorRegistration,
} from "./modeler-editor.js";
export { registerModelerEditor } from "./modeler-editor.js";
export type {
  AppearanceMessage,
  DocumentHostMessage,
  DocumentWebviewMessage,
  ProblemCounts,
  TypedMessage,
} from "../protocol.js";
export {
  APPEARANCE_MESSAGE_TYPE,
  appearanceMessage,
  isAppearanceMessage,
  isTypedMessage,
} from "../protocol.js";
