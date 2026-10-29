import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * Message protocol between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export.
 *
 *  - Host -> webview: `init`/`update` with the document's text (JSON), `problems` for the pill
 *    and `command` from the Command Palette or the editor title bar.
 *  - Webview -> host: `edit` after every graphical change (canonical JSON), written as one minimal
 *    WorkspaceEdit whose echo is not imported again; `showProblems` (the pill), `insertExample`
 *    (the empty-file hint) and `error`.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file.
 *
 * The webview sends an `edit` only when the canonical JSON of the canvas differs from that of the
 * diagram it showed last: the serializer is deterministic, so string equality is reliable. The
 * modeler shell's `modelerShell.appearance` messages arrive on the same window.
 */

/** Diagram actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand = "fitView" | "exportPng" | "exportSvg";

export type HostToWebview = DocumentHostMessage;

export type WebviewToHost =
  | DocumentWebviewMessage
  /**
   * Trigger an image export (SVG = text, PNG = Base64). `fontFallback`: the PNG's labels are in the
   * system font, since Geist could not be embedded; the host says so in its notification.
   */
  | { type: "export"; format: "svg" | "png"; data: string; fontFallback?: boolean };
