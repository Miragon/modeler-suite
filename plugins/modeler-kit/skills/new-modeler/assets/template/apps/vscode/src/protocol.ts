import type { DocumentWebviewMessage } from '@miragon/modeler-shell/vscode/extension';

/**
 * The messages between the extension host and the webview: the shell's document plumbing
 * (`registerModelerEditor` in the extension, `connectDocumentSync` in the webview) plus the export.
 * The document is the source of truth: the host sends its text (`init` once, `update` on every
 * change from elsewhere) and the pill's `problems`, the webview sends the canonical text after
 * every canvas edit (`edit`), and the host writes it as one minimal edit. The shell's
 * `modelerShell.appearance` messages arrive on the same channel.
 */

export type ExportFormat = 'svg' | 'png';

export type WebviewToHost =
  | DocumentWebviewMessage
  /** SVG as text, PNG in Base64; `fontFallback` when Geist could not be embedded in the PNG. */
  | { type: 'export'; format: ExportFormat; data: string; fontFallback?: true };
