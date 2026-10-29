import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * Message protocol between the extension host and the webview (the text editor for `.cm`/`.cm.json`
 * and the PNG editor for `*.cm.png` share it): the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export
 * and the PNG editor's render requests.
 *
 *  - Host -> webview: `init`/`update` with the current document text (the native JSON document),
 *    `problems` for the pill and `command` from the Command Palette or the editor title bar.
 *  - Webview -> host: `edit` after every graphical change (canonical JSON), written as one minimal
 *    WorkspaceEdit whose echo is not imported again; `showProblems` (the pill), `insertExample`
 *    (the empty-file hint) and `error`.
 *  - Webview -> host: `export` (SVG/JSON/CML text or Base64 PNG) -> save dialog + write file.
 *
 * Only for the PNG editor (binary CustomDocument, outside the shell's plumbing), which posts the
 * same `init`, `update` and `problems` and answers the same `edit`, `insertExample`, `showProblems`
 * and `error` itself:
 *  - Host -> webview: `requestPng` (with a correlation `id`) when the host needs the rasterized
 *    PNG (raster + embedded JSON) for saving/backup, since only the browser can rasterize.
 *  - Webview -> host: `pngResponse` (`id` + Base64 PNG OR `error`).
 *
 * The shell's `modelerShell.appearance` messages arrive on the same window.
 */

/** File formats the webview can export to (text = UTF-8, PNG = Base64). */
export type ExportFormat = "png" | "svg" | "json" | "cml";

/** Map actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand = "fitView" | "exportPng" | "exportSvg" | "exportJson" | "exportCml";

export type HostToWebview =
  | DocumentHostMessage
  /** PNG editor: request the current embedded PNG for save/backup (reply: `pngResponse`). */
  | { type: "requestPng"; id: number };

export type WebviewToHost =
  | DocumentWebviewMessage
  /**
   * An export (SVG/JSON/CML = text, PNG = Base64) -> save dialog + write file. `fontFallback`: the
   * PNG's labels are in the system font because Geist could not be embedded; the host tells the user.
   */
  | { type: "export"; format: ExportFormat; data: string; fontFallback?: boolean }
  /**
   * Reply to `requestPng`: Base64 PNG (`data`) OR `error`. `id` correlates with the request.
   * `fontFallback` as for `export`.
   */
  | { type: "pngResponse"; id: number; data?: string; error?: string; fontFallback?: boolean };
