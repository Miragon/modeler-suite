import * as vscode from "vscode";
import { locateUrlAddresses } from "@miragon/wardley-dsl";
import { type FileMove, movedLocation } from "./fileMoves.js";
import { MAP_FILES_GLOB, isRelativeAddress, relativeAddress, storableAddress } from "./mapLinks.js";

/** The section of `miragon.wardleyMaps.updateLinksOnFileMove.enabled`. */
export const UPDATE_LINKS_SECTION = "miragon.wardleyMaps.updateLinksOnFileMove";

/** As VS Code's `markdown.updateLinksOnFileMove.enabled`. */
export type UpdateLinksOnFileMove = "prompt" | "always" | "never";

/** The new addresses of one map's links. */
export interface MapLinkEdit {
  readonly uri: vscode.Uri;
  readonly replacements: readonly { readonly range: vscode.Range; readonly address: string }[];
}

function updateLinksOnFileMove(scope: vscode.Uri | undefined): UpdateLinksOnFileMove {
  const value = vscode.workspace.getConfiguration(UPDATE_LINKS_SECTION, scope).get("enabled");
  return value === "always" || value === "never" ? value : "prompt";
}

/** The text VS Code edits: an open map's, with its unsaved changes, or the file's. */
async function textOf(map: vscode.Uri): Promise<string | undefined> {
  const key = map.toString();
  const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
  if (open) return open.getText();
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(map));
  } catch {
    return undefined;
  }
}

interface MovedMap {
  /** Where the map is now. */
  readonly uri: vscode.Uri;
  /** Where it was before the move, if the move took it along. */
  readonly formerUri: vscode.Uri | undefined;
}

/**
 * The address a link of `map` needs after `moves`, or `undefined` when it stays as it is. Only a
 * link to a map of the workspace changes, as "Open link" would have followed it, and only when
 * that map or `map` itself moved. It keeps a leading `./`; a link whose new address a map can't
 * carry stays as it was.
 */
function movedAddress(
  map: MovedMap,
  address: string,
  moves: readonly FileMove[],
  workspaceMaps: ReadonlySet<string>,
): string | undefined {
  if (!isRelativeAddress(address)) return undefined;
  const formerTarget = vscode.Uri.joinPath(map.formerUri ?? map.uri, "..", address);
  const movedTarget = movedLocation(formerTarget, moves);
  if (!map.formerUri && !movedTarget) return undefined;
  const target = movedTarget ?? formerTarget;
  if (!workspaceMaps.has(target.toString())) return undefined;
  const relative = relativeAddress(map.uri, target);
  if (relative === undefined) return undefined;
  const styled =
    address.startsWith("./") && !relative.startsWith("../") ? `./${relative}` : relative;
  const moved = storableAddress(map.uri, target, styled);
  return moved === address ? undefined : moved;
}

async function linkEditOf(
  map: MovedMap,
  moves: readonly FileMove[],
  workspaceMaps: ReadonlySet<string>,
): Promise<MapLinkEdit | undefined> {
  const text = await textOf(map.uri);
  if (text === undefined) return undefined;
  const lines = text.split(/\r\n|\r|\n/);
  const replacements = locateUrlAddresses(text).flatMap(({ address, line, start, end }) => {
    const moved = movedAddress(map, address, moves, workspaceMaps);
    // VS Code breaks lines at a lone "\r" too, where the parser doesn't: such a line stays as it is.
    if (moved === undefined || lines[line - 1]?.slice(start, end) !== address) return [];
    return [{ range: new vscode.Range(line - 1, start, line - 1, end), address: moved }];
  });
  return replacements.length > 0 ? { uri: map.uri, replacements } : undefined;
}

/**
 * The edits that let the relative links of the workspace's maps lead where they led before
 * `moves`, which VS Code has just made: the links of other maps to a moved map, and the links of a
 * moved map to the maps that stayed. Each replaces an address and nothing else of its line. Maps
 * outside the workspace are neither read nor linked to.
 */
export async function mapLinkEdits(moves: readonly FileMove[]): Promise<MapLinkEdit[]> {
  const files = await vscode.workspace.findFiles(MAP_FILES_GLOB);
  const returns = moves.map(({ oldUri, newUri }) => ({ oldUri: newUri, newUri: oldUri }));
  const maps = files.map((uri) => ({ uri, formerUri: movedLocation(uri, returns) }));
  if (!maps.some(({ formerUri }) => formerUri)) return [];
  const workspaceMaps = new Set(files.map((file) => file.toString()));
  const edits = await Promise.all(maps.map((map) => linkEditOf(map, moves, workspaceMaps)));
  return edits.filter((edit): edit is MapLinkEdit => edit !== undefined);
}

async function confirmLinkUpdates(mapCount: number): Promise<boolean> {
  const update: vscode.MessageItem = { title: "Update links" };
  const keep: vscode.MessageItem = { title: "Don't update", isCloseAffordance: true };
  const maps = mapCount === 1 ? "1 map" : `${mapCount} maps`;
  const choice = await vscode.window.showInformationMessage(
    `The move changes where the links in ${maps} lead. Update them?`,
    { modal: true },
    update,
    keep,
  );
  return choice === update;
}

/**
 * After VS Code renamed or moved `moves`, updates the links between the maps as
 * `miragon.wardleyMaps.updateLinksOnFileMove.enabled` says: after asking (`prompt`), without
 * asking (`always`) or not at all (`never`). One edit for all maps, which stay unsaved.
 */
export async function updateMapLinksAfterMove(moves: readonly FileMove[]): Promise<void> {
  const setting = updateLinksOnFileMove(moves[0]?.newUri);
  if (setting === "never") return;
  try {
    const edits = await mapLinkEdits(moves);
    if (edits.length === 0) return;
    if (setting === "prompt" && !(await confirmLinkUpdates(edits.length))) return;
    const edit = new vscode.WorkspaceEdit();
    for (const { uri, replacements } of edits) {
      for (const { range, address } of replacements) edit.replace(uri, range, address);
    }
    await vscode.workspace.applyEdit(edit);
  } catch (error) {
    console.error("Wardley Maps: couldn't update the links between maps", error);
  }
}

/**
 * Keeps the links between maps whole when map files, or folders that hold them, are renamed or
 * moved in VS Code, as its Markdown feature keeps Markdown links: after the move, applied with
 * `workspace.applyEdit`. An edit returned through `onWillRenameFiles` would bring up VS Code's own
 * dialog about an extension's refactoring as well, which neither says how many maps change nor
 * heeds `always`.
 */
export function registerLinkUpdates(): vscode.Disposable {
  return vscode.workspace.onDidRenameFiles(({ files }) => void updateMapLinksAfterMove(files));
}
