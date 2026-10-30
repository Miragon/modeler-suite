import * as vscode from "vscode";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  type ExportKind,
} from "@miragon/modeler-shell/vscode/extension";
import type { ExportFormat, WebviewToHost } from "./protocol.js";

const EXPORT_KINDS: Readonly<Record<ExportFormat, ExportKind>> = {
  png: IMAGE_EXPORT_KINDS.png,
  svg: IMAGE_EXPORT_KINDS.svg,
  json: {
    title: "Export as JSON",
    filters: { "Context map": ["cm.json", "json"] },
    suffix: ".cm.json",
    encoding: "text",
  },
  cml: {
    title: "Export as CML",
    filters: { "Context Mapper CML": ["cml"] },
    suffix: ".cml",
    encoding: "text",
  },
};

/**
 * An export of the text or the PNG editor, through the shell's save dialog and notification
 * (guide §13.5). Images (SVG/PNG) embed the map (its JSON), so they can be reopened as a diagram;
 * JSON and CML write the text itself. The suggested name drops a double extension too:
 * `shop.cm.png` and `shop.cm.json` suggest `shop.svg`.
 */
export function exportMap(
  sourceUri: vscode.Uri,
  message: Extract<WebviewToHost, { type: "export" }>,
): Promise<vscode.Uri | undefined> {
  return exportToFile(vscode, {
    kind: EXPORT_KINDS[message.format],
    data: message.data,
    sourceUri,
    sourceExtension: /(\.cm)?\.[^./]+$/i,
    defaultName: "context-map",
    fontFallback: message.fontFallback === true,
    platform: process.platform,
  });
}
