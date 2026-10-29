import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * Message protocol between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export.
 *
 *  - Host -> webview: `init`/`update` with the document's text (Event Storming DSL), `problems`
 *    for the pill and `command` from the Command Palette or the editor title bar.
 *  - Webview -> host: `edit` after every graphical change (the serialized DSL), written as one
 *    minimal WorkspaceEdit whose echo is not imported again; `showProblems` (the pill),
 *    `insertExample` (the empty-file hint) and `error`.
 *  - Webview -> host: `export` (SVG and JSON text, Base64 PNG) -> save dialog + write file; a PNG
 *    whose labels fell back to the system font says so, and the host warns once it is saved.
 *
 * The modeler shell's `modelerShell.appearance` messages arrive on the same window.
 */

/** Board actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand =
  "fitView" | "exportPng" | "exportSvg" | "exportPngTransparent" | "exportJson";

/** What an export carries: SVG and JSON as text, the PNGs in Base64. */
export type ExportFormat = "svg" | "png" | "png-transparent" | "json";

export type HostToWebview = DocumentHostMessage;

export type WebviewToHost =
  | DocumentWebviewMessage
  /** Trigger an export (SVG and JSON = text, PNG = Base64). */
  | { type: "export"; format: ExportFormat; data: string; fontFallback?: boolean };
