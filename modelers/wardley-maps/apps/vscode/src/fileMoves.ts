import type * as vscode from "vscode";

/** A file or folder VS Code renames or moves. */
export interface FileMove {
  readonly oldUri: vscode.Uri;
  readonly newUri: vscode.Uri;
}

export function isAtOrBelow(uri: vscode.Uri, folder: vscode.Uri): boolean {
  if (uri.scheme !== folder.scheme || uri.authority !== folder.authority) return false;
  const base = folder.path.endsWith("/") ? folder.path : `${folder.path}/`;
  return uri.path === folder.path || uri.path.startsWith(base);
}

/** Where `uri` is once `moves` are done; `undefined` when none of them takes it along. */
export function movedLocation(uri: vscode.Uri, moves: readonly FileMove[]): vscode.Uri | undefined {
  const move = moves.find(({ oldUri }) => isAtOrBelow(uri, oldUri));
  if (!move) return undefined;
  const rest = uri.path.slice(move.oldUri.path.replace(/\/$/, "").length);
  return move.newUri.with({ path: move.newUri.path.replace(/\/$/, "") + rest });
}
