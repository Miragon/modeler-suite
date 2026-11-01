import type { ViewKey } from "@miragon/c4-schema-model";
import type {
  DocumentHostMessage,
  DocumentWebviewMessage,
} from "@miragon/modeler-shell/vscode/extension";

/**
 * The messages between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the
 * modeler's own. The document is the source of truth: the host sends its text (`init` once,
 * `update` on every change from elsewhere) and the pill's `problems`, the webview sends the
 * canonical text after every canvas edit (`edit`), and the host writes it as one minimal edit. The
 * shell's `modelerShell.appearance` messages arrive on the same channel.
 */

export type ExportFormat = "svg" | "png";

/**
 * Diagram actions that exist in the webview (menu, zoom panel, keys) and as Command Palette
 * commands (guide §13.5): the host posts `{ type: "command", name }` to the focused diagram.
 */
export type WebviewCommand = "fitView" | "exportPng" | "exportSvg" | "parentView";

/**
 * Go to View…: the view the user picked in the QuickPick, which the webview opens as a switch of
 * the user's (`views.open(key, { cause: "user" })`). Navigating writes nothing to the document.
 */
export interface ShowViewMessage {
  readonly type: "c4.showView";
  readonly key: ViewKey;
}

/**
 * The text document is about to be saved (SPEC 8.2): the webview commits a field still being typed
 * in, in the inspector or the canvas's label editor, and answers `c4.flushed` with the same `id`
 * once the `edit` that commit caused was posted.
 */
export interface FlushMessage {
  readonly type: "c4.flush";
  readonly id: number;
}

export type HostToWebview = DocumentHostMessage | ShowViewMessage | FlushMessage;

export type WebviewToHost =
  | DocumentWebviewMessage
  /** SVG as text, PNG in Base64; `fontFallback` when Geist could not be embedded in the PNG. */
  | { type: "export"; format: ExportFormat; data: string; fontFallback?: true }
  /** The answer to `c4.flush`: every `edit` the flush caused was posted before it. */
  | { type: "c4.flushed"; id: number }
  /** The inspector's "Defined on line N": show that line of the document in a text editor. */
  | { type: "c4.revealSource"; line: number };
