import { posix } from "node:path";
import * as vscode from "vscode";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

/** The map files of the workspace, for `findFiles` and the file watcher. */
export const MAP_FILES_GLOB = "**/*.{wmap,owm}";
const MAP_FILE_PATTERN = /\.(wmap|owm)$/i;
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const EXTERNAL_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
/** What `url Name [address]` can't carry: the renderer drops brackets and control characters. */
// eslint-disable-next-line no-control-regex
const UNSTORABLE_CHARACTERS = /[[\]\u0000-\u001f\u007f]/;

/** Why a relative map link can't open, known before the file system is asked. */
export type MapLinkRefusal = "notAMap" | "outsideWorkspace";

export const MAP_LINK_REFUSALS: Readonly<Record<MapLinkRefusal, string>> = {
  notAMap: "Only .wmap and .owm files open from a map link.",
  outsideWorkspace: "A map link only opens files inside the workspace.",
};

export function isMapPath(uri: vscode.Uri): boolean {
  return MAP_FILE_PATTERN.test(uri.path);
}

/** Whether `address` names a map relative to its own: an address without a scheme. */
export function isRelativeAddress(address: string): boolean {
  return !SCHEME_PATTERN.test(address);
}

/**
 * The file a relative address of the map at `mapUri` names, and why a link to it can't open when
 * that shows without the file system. Shared maps can carry any address, so only a map file inside
 * the workspace opens. The address is a literal path: `my map.wmap` works as typed, and `%2e%2e`
 * stays a folder name.
 */
export function resolveMapLink(
  mapUri: vscode.Uri,
  address: string,
): { target: vscode.Uri; refusal?: MapLinkRefusal } {
  const target = vscode.Uri.joinPath(mapUri, "..", address);
  if (!isMapPath(target)) return { target, refusal: "notAMap" };
  if (!vscode.workspace.getWorkspaceFolder(target)) return { target, refusal: "outsideWorkspace" };
  return { target };
}

/**
 * `address` when `url Name [address]` can carry it and it leads from the map at `mapUri` to that
 * very `file`.
 */
export function storableAddress(
  mapUri: vscode.Uri,
  file: vscode.Uri,
  address: string,
): string | undefined {
  const storable =
    address !== "" &&
    !UNSTORABLE_CHARACTERS.test(address) &&
    address.trim() === address &&
    isRelativeAddress(address) &&
    file.scheme === mapUri.scheme &&
    vscode.Uri.joinPath(mapUri, "..", address).path === file.path;
  return storable ? address : undefined;
}

/** The address of `file` relative to the map at `mapUri`, when a map link can carry it. */
export function relativeAddress(mapUri: vscode.Uri, file: vscode.Uri): string | undefined {
  return storableAddress(mapUri, file, posix.relative(posix.dirname(mapUri.path), file.path));
}

function showCouldNotOpen(address: string, reason: string): void {
  void vscode.window.showErrorMessage(`Couldn't open “${address}”. ${reason}`);
}

/**
 * Whether `target` is a file that now shows in the map editor. Pinned, so following a link from a
 * map in a preview tab keeps that map open beside the one it links to.
 */
async function openInMapEditor(target: vscode.Uri): Promise<boolean> {
  try {
    const { type } = await vscode.workspace.fs.stat(target);
    if (!(type & vscode.FileType.File)) return false;
    await vscode.commands.executeCommand("vscode.openWith", target, MAP_VIEW_TYPE, {
      preview: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the map a relative address names beside the map at `mapUri`. The file system is asked
 * about nothing but a map file inside the workspace.
 */
async function openRelativeMapLink(mapUri: vscode.Uri, address: string): Promise<void> {
  const { target, refusal } = resolveMapLink(mapUri, address);
  if (refusal) {
    showCouldNotOpen(address, MAP_LINK_REFUSALS[refusal]);
  } else if (!(await openInMapEditor(target))) {
    showCouldNotOpen(address, "Check that the file exists.");
  }
}

/**
 * Follows a link of the map at `mapUri`: an http(s) or `mailto:` address through VS Code's opener,
 * which a webview can't reach, and an address without a scheme as a map relative to this one. The
 * webview sends only those, but the host checks the address itself.
 */
export async function openMapLink(mapUri: vscode.Uri, address: string): Promise<void> {
  const scheme = SCHEME_PATTERN.exec(address)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    await openRelativeMapLink(mapUri, address);
  } else if (EXTERNAL_SCHEMES.has(scheme)) {
    await vscode.env.openExternal(vscode.Uri.parse(address));
  } else {
    showCouldNotOpen(address, "A map link opens only http(s) and mailto addresses or other maps.");
  }
}

interface LinkTarget {
  address: string;
  /** How many folders the address goes up. */
  ascents: number;
  /** How many folders it then goes down. */
  descents: number;
}

function linkTargetOf(mapUri: vscode.Uri, file: vscode.Uri): LinkTarget | undefined {
  if (file.path === mapUri.path) return undefined;
  const address = relativeAddress(mapUri, file);
  if (address === undefined) return undefined;
  const segments = address.split("/");
  const ascents = segments.filter((segment) => segment === "..").length;
  return { address, ascents, descents: segments.length - 1 - ascents };
}

function nearestFirst(a: LinkTarget, b: LinkTarget): number {
  return a.ascents - b.ascents || a.descents - b.descents || a.address.localeCompare(b.address);
}

/**
 * Lets the user choose another map of the workspace for "Link to map…" and resolves with its
 * address relative to the map at `mapUri`, the nearest maps first; `undefined` when the user
 * cancels or there is no other map.
 */
export async function chooseMapLink(mapUri: vscode.Uri): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles(MAP_FILES_GLOB);
  const targets = files
    .map((file) => linkTargetOf(mapUri, file))
    .filter((target): target is LinkTarget => target !== undefined)
    .sort(nearestFirst);
  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      "There is no other .wmap or .owm file in the workspace to link to.",
    );
    return undefined;
  }
  const chosen = await vscode.window.showQuickPick(
    targets.map(({ address }) => ({ label: address })),
    { title: "Link to map", placeHolder: "Choose the map this element links to" },
  );
  return chosen?.label;
}
