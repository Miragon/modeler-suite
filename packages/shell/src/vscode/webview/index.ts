export type { AppearanceListenerOptions } from "./appearance.js";
export { applyAppearance, connectAppearance, connectReducedMotion } from "./appearance.js";
export type { VsCodeShellOptions } from "./mount.js";
export { mountVsCodeShell } from "./mount.js";
export type {
  PersistViewOptions,
  PersistableView,
  ShellWebviewState,
  WebviewStateApi,
} from "./state.js";
export { SHELL_STATE_KEY, persistView, readShellState, writeShellState } from "./state.js";
export type {
  DocumentImportContext,
  DocumentSync,
  DocumentSyncApi,
  DocumentSyncOptions,
} from "./document-sync.js";
export { connectDocumentSync } from "./document-sync.js";
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
