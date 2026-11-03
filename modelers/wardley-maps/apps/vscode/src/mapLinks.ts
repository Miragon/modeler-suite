import { posix } from "node:path";
import * as vscode from "vscode";
import { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

const MAP_FILE_PATTERN = /\.(wmap|owm)$/i;
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const EXTERNAL_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
/** What `url Name [address]` can't carry: the renderer drops brackets and control characters. */
// eslint-disable-next-line no-control-regex
const UNSTORABLE_CHARACTERS = /[[\]\u0000-\u001f\u007f]/;

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
 * Opens the map a relative address names beside the map at `mapUri`. Shared maps can carry any
 * address, so only a map file inside the workspace opens, and the file system is asked about
 * nothing else. The address is a literal path: `my map.wmap` works as typed, and `%2e%2e` stays a
 * folder name.
 */
async function openRelativeMapLink(mapUri: vscode.Uri, address: string): Promise<void> {
  const target = vscode.Uri.joinPath(mapUri, "..", address);
  if (!MAP_FILE_PATTERN.test(target.path)) {
    showCouldNotOpen(address, "Only .wmap and .owm files open from a map link.");
  } else if (!vscode.workspace.getWorkspaceFolder(target)) {
    showCouldNotOpen(address, "A map link only opens files inside the workspace.");
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

/**
 * The address of `file` relative to the map at `mapUri`, when a map link can carry it and leads
 * back to that very file.
 */
function linkTargetOf(mapUri: vscode.Uri, file: vscode.Uri): LinkTarget | undefined {
  if (file.scheme !== mapUri.scheme || file.path === mapUri.path) return undefined;
  const address = posix.relative(posix.dirname(mapUri.path), file.path);
  if (
    UNSTORABLE_CHARACTERS.test(address) ||
    address.trim() !== address ||
    SCHEME_PATTERN.test(address) ||
    vscode.Uri.joinPath(mapUri, "..", address).path !== file.path
  ) {
    return undefined;
  }
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
  const files = await vscode.workspace.findFiles("**/*.{wmap,owm}");
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
