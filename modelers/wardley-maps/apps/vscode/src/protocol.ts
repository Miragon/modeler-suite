import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * Message protocol between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export.
 *
 *  - Host -> webview: `init`/`update` with the document's text (OWM-DSL), `problems` for the pill
 *    and `command` from the Command Palette or the editor title bar.
 *  - Webview -> host: `edit` after every graphical change (the document text with only the changed
 *    statements rewritten), written as one minimal WorkspaceEdit whose echo is not imported again;
 *    `showProblems` (the pill), `insertExample` (the empty-file hint), `info` and `error`.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file.
 *
 * The modeler shell's `modelerShell.appearance` messages arrive on the same window.
 */

/** Diagram actions the host can trigger in the webview, keyed to their VS Code command ids. */
export const WEBVIEW_COMMANDS = {
  fitView: "wardley.fitView",
  exportSvg: "wardley.exportSvg",
  exportPng: "wardley.exportPng",
  exportPngTransparent: "wardley.exportPngTransparent",
} as const;

export type WebviewCommand = keyof typeof WEBVIEW_COMMANDS;

/** What an export carries: SVG as text, the PNGs in Base64. */
export type ExportFormat = "svg" | "png" | "png-transparent";

export type HostToWebview = DocumentHostMessage;

export type WebviewToHost =
  | DocumentWebviewMessage
  /**
   * Trigger an image export (SVG = text, PNG = Base64). `fontFallback` tells that a PNG was drawn
   * in the system font because Geist could not be embedded: the host says so once the file is saved.
   */
  | { type: "export"; format: ExportFormat; data: string; fontFallback?: boolean };
