import * as vscode from "vscode";
import { type FileMove, isAtOrBelow, movedLocation } from "./fileMoves.js";
import { MAP_FILES_GLOB, isMapPath } from "./mapLinks.js";

/** A burst of file events (a checkout, a folder moved) tells its listeners once. */
const CHANGE_DELAY_MS = 100;

type Change = (files: Map<string, vscode.Uri>) => boolean;

function removeBelow(folders: readonly vscode.Uri[]): Change {
  return (files) => {
    const below = [...files].filter(([, file]) =>
      folders.some((folder) => isAtOrBelow(file, folder)),
    );
    for (const [key] of below) files.delete(key);
    return below.length > 0;
  };
}

function add(found: readonly vscode.Uri[]): Change {
  return (files) => {
    let changed = false;
    for (const file of found) {
      if (files.has(file.toString())) continue;
      files.set(file.toString(), file);
      changed = true;
    }
    return changed;
  };
}

function move(moves: readonly FileMove[]): Change {
  return (files) => {
    const moved: vscode.Uri[] = [];
    for (const [key, file] of files) {
      const location = movedLocation(file, moves);
      if (!location) continue;
      files.delete(key);
      moved.push(location);
    }
    for (const file of moved) files.set(file.toString(), file);
    return moved.length > 0;
  };
}

/**
 * The map files of the workspace, so a link can be checked on every keystroke without asking the
 * file system. A watcher keeps it current for files; it reports nothing about the maps inside a
 * folder that is moved or deleted, so VS Code's own file operations update those, and a change of
 * the workspace folders reads the workspace again.
 */
export class WorkspaceMaps implements vscode.Disposable {
  private files = new Map<string, vscode.Uri>();
  private scanned = false;
  private scans = 0;
  /** The changes made while a scan runs, which its result would otherwise undo. */
  private changesDuringScan: Change[] | undefined;
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[];

  /** Fires once the first scan has finished and whenever a map file appears or goes away. */
  readonly onDidChange = this.changed.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(MAP_FILES_GLOB, false, true, false);
    this.subscriptions = [
      watcher,
      watcher.onDidCreate((uri) => this.apply(add([uri]))),
      watcher.onDidDelete((uri) => this.apply(removeBelow([uri]))),
      vscode.workspace.onDidCreateFiles(({ files }) => void this.addCreated(files)),
      vscode.workspace.onDidDeleteFiles(({ files }) => this.apply(removeBelow(files))),
      vscode.workspace.onDidRenameFiles(({ files }) => this.apply(move(files))),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.scan()),
      this.changed,
    ];
    void this.scan();
  }

  /** Whether the first scan has finished: until then, `includes` knows no map. */
  get ready(): boolean {
    return this.scanned;
  }

  includes(uri: vscode.Uri): boolean {
    return this.files.has(uri.toString());
  }

  dispose(): void {
    clearTimeout(this.changeTimer);
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private async scan(): Promise<void> {
    const scan = ++this.scans;
    this.changesDuringScan ??= [];
    const found = await vscode.workspace.findFiles(MAP_FILES_GLOB).then(
      (files) => files,
      () => undefined,
    );
    if (scan !== this.scans) return;
    const changes = this.changesDuringScan ?? [];
    this.changesDuringScan = undefined;
    // A failed search leaves the maps as they were: none at all would flag every link.
    if (!found) return;
    const files = new Map(found.map((file) => [file.toString(), file]));
    for (const change of changes) change(files);
    this.files = files;
    this.scanned = true;
    this.notify();
  }

  /** A folder VS Code created (pasted, say) may hold maps no watcher event names. */
  private async addCreated(created: readonly vscode.Uri[]): Promise<void> {
    this.apply(add(created.filter(isMapPath)));
    for (const uri of created) {
      if (isMapPath(uri)) continue;
      try {
        const { type } = await vscode.workspace.fs.stat(uri);
        if (!(type & vscode.FileType.Directory)) continue;
        this.apply(
          add(await vscode.workspace.findFiles(new vscode.RelativePattern(uri, MAP_FILES_GLOB))),
        );
      } catch {
        // Gone again before it could be read: its own delete event takes care of it.
      }
    }
  }

  private apply(change: Change): void {
    this.changesDuringScan?.push(change);
    if (change(this.files) && this.scanned) this.notify();
  }

  private notify(): void {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => this.changed.fire(), CHANGE_DELAY_MS);
  }
}
