import * as vscode from "vscode";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";

type ImageFormat = "svg" | "png";

/** The warning of a PNG whose labels came out in the system sans (the webview says so). */
export const FONT_FALLBACK_SAVED = "Saved the PNG in a system font. Geist couldn't be embedded.";

/**
 * Image export (SVG/PNG) to disk via a save dialog — the scene (native JSON document) is embedded in
 * the file, so exported images can later be reopened as a diagram. Shared by the text and PNG editor
 * (hence generic over the source URI rather than a document type). The outcome is a host
 * notification (guide §13.5): the file name with a reveal action named like VS Code's, as a warning
 * when the PNG's labels fell back to the system sans, or the error.
 */
export async function exportImageToFile(
  sourceUri: vscode.Uri | undefined,
  format: ImageFormat,
  data: string,
  { fontFallback = false }: { fontFallback?: boolean } = {},
): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: format === "svg" ? "Export as SVG" : "Export as PNG",
    saveLabel: "Export",
    filters: format === "svg" ? { "SVG image": ["svg"] } : { "PNG image": ["png"] },
  };
  const defaultUri = exportDefaultUri(sourceUri, format);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const fileName = target.path.slice(target.path.lastIndexOf("/") + 1);
  const bytes =
    format === "svg" ? new TextEncoder().encode(data) : new Uint8Array(Buffer.from(data, "base64"));
  try {
    await vscode.workspace.fs.writeFile(target, bytes);
  } catch (error) {
    console.error(`Couldn't write ${fileName}`, error);
    void vscode.window.showErrorMessage(
      `Couldn't export ${fileName}. Try again, or choose another folder.`,
    );
    return;
  }

  const reveal = revealFileLabel(process.platform);
  const chosen = fontFallback
    ? await vscode.window.showWarningMessage(
        `Exported ${fileName} in a system font. Geist couldn't be embedded.`,
        reveal,
      )
    : await vscode.window.showInformationMessage(`Exported ${fileName}.`, reveal);
  if (chosen === reveal) {
    void vscode.commands.executeCommand("revealFileInOS", target);
  }
}

/** `<name>.<format>` next to the source file (if no file: in the first workspace folder). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  format: ImageFormat,
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === "file") {
    // Strip double extensions like `.tt.png` / `.ttm.json` too, so `topology.tt.png` -> `topology.svg`.
    const path = sourceUri.path.replace(/(\.(tt|ttm))?\.[^./]+$/i, "");
    return sourceUri.with({ path: `${path}.${format}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, `team-topology.${format}`) : undefined;
}
