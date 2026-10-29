import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * Message protocol between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export,
 * the save's flush and the PNG editor's round trip.
 *
 *  - Host -> webview: `init`/`update` with the document's text (the native JSON document),
 *    `problems` for the pill and `command` from the Command Palette or the editor title bar.
 *  - Webview -> host: `edit` after every graphical change (serialized JSON), written as one minimal
 *    WorkspaceEdit whose echo is not imported again; `showProblems` (the pill), `insertExample`
 *    (the empty-file hint) and `error`.
 *  - Webview -> host: `export` (SVG text or Base64 PNG) -> save dialog + write file. A PNG whose
 *    labels came out in the system sans because Geist could not be embedded says so
 *    (`fontFallback`), and the host's notification becomes a warning.
 *  - Host -> webview: `flush` (with a correlation `id`) right before the text document is saved.
 *    The webview commits a field still being typed in (an `edit`), then answers `flushed`, so the
 *    save includes text that is visible but not yet committed.
 *
 * Only for the PNG editor (`*.tt.png`/`*.ttm.png`, binary CustomDocument file), which speaks the
 * same `init`, `update`, `problems`, `command`, `edit`, `insertExample` and `showProblems` from a
 * provider of its own:
 *  - Host -> webview: `requestPng` (with a correlation `id`) when the host needs the fully
 *    rasterized PNG (raster + embedded JSON) for saving/backup, since only the browser rasterizes.
 *  - Webview -> host: `pngResponse` (`id` + Base64 PNG OR `error`). A save (not a backup) whose
 *    labels fell back to the system sans says so with `fontFallback`.
 *
 * The modeler shell's `modelerShell.appearance` messages arrive on the same window.
 */

/** Diagram actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand = "fitView" | "exportPng" | "exportSvg";

export type HostToWebview =
  | DocumentHostMessage
  /**
   * PNG editor: request the current embedded PNG for save/backup (reply: `pngResponse`). With
   * `includeDraft` (a save, not a backup) a draft still being typed in the panels is committed first.
   */
  | { type: "requestPng"; id: number; includeDraft: boolean }
  /** About to save: commit any draft in the panels (reply: `flushed`, after its `edit`). */
  | { type: "flush"; id: number };

export type WebviewToHost =
  | DocumentWebviewMessage
  /** Trigger an image export (SVG = text, PNG = Base64). */
  | { type: "export"; format: "svg" | "png"; data: string; fontFallback?: true }
  /** Reply to `requestPng`: Base64 PNG (`data`) OR `error`. `id` correlates with the request. */
  | { type: "pngResponse"; id: number; data?: string; error?: string; fontFallback?: true }
  /** Reply to `flush`: every `edit` it caused was posted before this. */
  | { type: "flushed"; id: number };
