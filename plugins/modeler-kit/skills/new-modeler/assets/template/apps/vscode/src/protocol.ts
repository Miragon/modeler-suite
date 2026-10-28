/**
 * The messages between the extension host and the webview. The document is the source of truth:
 * the host sends its text (`init` once, `update` on every change from elsewhere), the webview sends
 * the canonical text after every canvas edit (`edit`), and the host writes it as one minimal edit.
 * The shell's `modelerShell.appearance` messages arrive on the same channel; unknown types are
 * ignored.
 */

export type ExportFormat = 'svg' | 'png';

export type HostToWebview =
  | { type: 'init'; text: string }
  | { type: 'update'; text: string }
  | { type: 'problems'; count: number; errors: number };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  /** SVG as text, PNG in Base64; `inSystemFont` when Geist could not be embedded in the PNG. */
  | { type: 'export'; format: ExportFormat; data: string; inSystemFont?: boolean }
  | { type: 'error'; message: string }
  /** The problems pill: open the Problems view. */
  | { type: 'showProblems' }
  /** "Insert example" of the empty-file hint: one document edit. */
  | { type: 'insertExample' };
