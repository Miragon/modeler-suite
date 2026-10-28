import * as vscode from "vscode";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import type { ExportFormat } from "./protocol.js";

/** Save dialog filter + on-disk extension for each export format. */
const EXPORT_SPECS: Record<ExportFormat, { label: string; extension: string; filter: string[] }> = {
  png: { label: "PNG image", extension: "png", filter: ["png"] },
  svg: { label: "SVG image", extension: "svg", filter: ["svg"] },
  json: { label: "Context map", extension: "cm.json", filter: ["cm.json", "json"] },
  cml: { label: "Context Mapper CML", extension: "cml", filter: ["cml"] },
};

const EXPORT_TITLES: Record<ExportFormat, string> = {
  png: "Export as PNG",
  svg: "Export as SVG",
  json: "Export as JSON",
  cml: "Export as CML",
};

/**
 * Export to disk via a save dialog. Images (SVG/PNG) embed the map (its JSON) so they can be
 * reopened as a diagram; JSON and CML write the text itself. Shared by the text and the PNG editor
 * (hence generic over the source URI). The outcome is a host notification (guide §13.5): the file
 * name with the platform's reveal action, or the error. A PNG whose labels are in the system font
 * (`fontFallback`) is a warning, since the console reaches no user (guide §9).
 */
export async function exportToFile(
  sourceUri: vscode.Uri | undefined,
  format: ExportFormat,
  data: string,
  fontFallback = false,
): Promise<void> {
  const spec = EXPORT_SPECS[format];
  const options: vscode.SaveDialogOptions = {
    title: EXPORT_TITLES[format],
    saveLabel: "Export",
    filters: { [spec.label]: spec.filter },
  };
  const defaultUri = exportDefaultUri(sourceUri, spec.extension);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const fileName = target.path.slice(target.path.lastIndexOf("/") + 1);
  const bytes =
    format === "png" ? new Uint8Array(Buffer.from(data, "base64")) : new TextEncoder().encode(data);
  try {
    await vscode.workspace.fs.writeFile(target, bytes);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not export ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const reveal = revealFileLabel(process.platform);
  const answer = fontFallback
    ? await vscode.window.showWarningMessage(fontFallbackText(`Exported ${fileName}`), reveal)
    : await vscode.window.showInformationMessage(`Exported ${fileName}.`, reveal);
  if (answer === reveal) void vscode.commands.executeCommand("revealFileInOS", target);
}

/** `Exported shop.png in a system font. Geist couldn't be embedded.` */
export function fontFallbackText(done: string): string {
  return `${done} in a system font. Geist couldn't be embedded.`;
}

/** `<name>.<extension>` next to the source file (if no file: in the first workspace folder). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  extension: string,
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === "file") {
    // Strip double extensions like `.cm.png` / `.cm.json` too, so `shop.cm.png` -> `shop.svg`.
    const path = sourceUri.path.replace(/(\.cm)?\.[^./]+$/i, "");
    return sourceUri.with({ path: `${path}.${extension}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, `context-map.${extension}`) : undefined;
}
