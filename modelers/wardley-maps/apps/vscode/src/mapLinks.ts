import * as vscode from "vscode";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

const MAP_FILE_PATTERN = /\.(wmap|owm)$/i;

function showCouldNotOpen(address: string, reason: string): void {
  void vscode.window.showErrorMessage(`Couldn't open “${address}”. ${reason}`);
}

/** Whether `target` is a file that now shows in the map editor. */
async function openInMapEditor(target: vscode.Uri): Promise<boolean> {
  try {
    const { type } = await vscode.workspace.fs.stat(target);
    if (!(type & vscode.FileType.File)) return false;
    await vscode.commands.executeCommand("vscode.openWith", target, MAP_VIEW_TYPE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Follows a relative link of the map at `mapUri`. Shared maps can carry any address, so only a map
 * file inside the workspace opens. Both are checked on the resolved path, and before the file system
 * is asked, so a map can't find out what exists elsewhere on the disk. The address is a literal path:
 * `my map.wmap` works as typed, and `%2e%2e` stays a folder name.
 */
export async function openMapLink(mapUri: vscode.Uri, address: string): Promise<void> {
  const target = vscode.Uri.joinPath(mapUri, "..", address);
  if (!MAP_FILE_PATTERN.test(target.path)) {
    showCouldNotOpen(address, "Only .wmap and .owm files open from a map link.");
  } else if (!vscode.workspace.getWorkspaceFolder(target)) {
    showCouldNotOpen(address, "A map link only opens files inside the workspace.");
  } else if (!(await openInMapEditor(target))) {
    showCouldNotOpen(address, "Check that the file exists.");
  }
}
