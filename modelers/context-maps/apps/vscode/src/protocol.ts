/**
 * Message protocol between the extension host and the webview (the text editor for `.cm`/`.cm.json`
 * and the PNG editor for `*.cm.png` share it).
 *
 * Data flow (classic CustomTextEditor pattern):
 *  - Host -> webview: `init`/`update` with the current document text (the native JSON document).
 *  - Host -> webview: `problems` with the diagnostics summary for the problems pill.
 *  - Host -> webview: `command` when a Command Palette command targets the active map.
 *  - Webview -> host: `edit` after every graphical change (canonical JSON) -> WorkspaceEdit.
 *  - Webview -> host: `export` (SVG/JSON/CML text or Base64 PNG) -> save dialog + write file.
 *  - Webview -> host: `showProblems` (pill) and `insertExample` (empty-file hint).
 *
 * Only for the PNG editor (binary CustomDocument):
 *  - Host -> webview: `requestPng` (with a correlation `id`) when the host needs the rasterized
 *    PNG (raster + embedded JSON) for saving/backup — rasterization only works in the browser.
 *  - Webview -> host: `pngResponse` (`id` + Base64 PNG OR `error`).
 *
 * Echo protection: the host suppresses the re-import of a document change that is the text the
 * webview last sent. The webview, in turn, only sends an `edit` when its text actually differs
 * from the last known one. The shell's `modelerShell.appearance` messages arrive on the same
 * window; the webview ignores unknown types.
 */

/** File formats the webview can export to (text = UTF-8, PNG = Base64). */
export type ExportFormat = "png" | "svg" | "json" | "cml";

/** Map actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand = "fitView" | "exportPng" | "exportSvg" | "exportJson" | "exportCml";

export type HostToWebview =
  /** Initial population after `ready`. */
  | { type: "init"; text: string }
  /** External document change (text editor, Git, undo, Insert example, …) -> re-import. */
  | { type: "update"; text: string }
  /** Diagnostics of the document, for the problems pill. */
  | { type: "problems"; count: number; errors: number }
  /** A command from the Command Palette for this map. */
  | { type: "command"; name: WebviewCommand }
  /** PNG editor: request the current embedded PNG for save/backup (reply: `pngResponse`). */
  | { type: "requestPng"; id: number };

export type WebviewToHost =
  | { type: "ready" }
  /** Graphical change -> apply to the document as a WorkspaceEdit. */
  | { type: "edit"; text: string }
  /**
   * An export (SVG/JSON/CML = text, PNG = Base64) -> save dialog + write file. `fontFallback`: the
   * PNG's labels are in the system font because Geist could not be embedded; the host tells the user.
   */
  | { type: "export"; format: ExportFormat; data: string; fontFallback?: boolean }
  /**
   * Reply to `requestPng`: Base64 PNG (`data`) OR `error`. `id` correlates with the request.
   * `fontFallback` as for `export`.
   */
  | { type: "pngResponse"; id: number; data?: string; error?: string; fontFallback?: boolean }
  | { type: "error"; message: string }
  /** The problems pill was activated -> open the Problems view. */
  | { type: "showProblems" }
  /** "Insert example" of the empty-file hint -> write the example as one document edit. */
  | { type: "insertExample" };
