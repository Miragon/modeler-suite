import * as vscode from "vscode";
import { IMAGE_EXPORT_KINDS, exportToFile } from "@miragon/modeler-shell/vscode/extension";
import type { WebviewToHost } from "./protocol.js";

/**
 * An image export (SVG/PNG) of the text or the PNG editor, through the shell's save dialog and
 * notification (guide §13.5). The scene is embedded in the image, so an exported image can later be
 * reopened as a diagram. The suggested name drops a double extension too: `shop.tt.png` and
 * `shop.ttm.json` suggest `shop.svg`.
 */
export function exportImage(
  sourceUri: vscode.Uri,
  message: Extract<WebviewToHost, { type: "export" }>,
): Promise<vscode.Uri | undefined> {
  return exportToFile(vscode, {
    kind: IMAGE_EXPORT_KINDS[message.format],
    data: message.data,
    sourceUri,
    sourceExtension: /(\.(tt|ttm))?\.[^./]+$/i,
    defaultName: "team-topology",
    fontFallback: message.fontFallback === true,
    platform: process.platform,
  });
}
