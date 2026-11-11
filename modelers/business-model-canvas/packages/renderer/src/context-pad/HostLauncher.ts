import type { NotesScope } from "../notes-panel/notesScope.js";

/**
 * The way from the canvas to the host's dialog and panel: the canvas title for the header, the
 * notes for their markers and the pad. They belong to the host's chrome, so `canvasModelActions`
 * and `connectNotes` register them here. Without a host that registers one, the canvas offers none.
 */
export default class HostLauncher {
  private launchNotes: ((scope: NotesScope, addNote: boolean) => void) | undefined;
  private launchCanvasTitle: (() => void) | undefined;

  registerCanvasTitle(launch: () => void): void {
    this.launchCanvasTitle = launch;
  }

  hasCanvasTitle(): boolean {
    return this.launchCanvasTitle !== undefined;
  }

  openCanvasTitle(): void {
    this.launchCanvasTitle?.();
  }

  registerNotes(launch: (scope: NotesScope, addNote: boolean) => void): void {
    this.launchNotes = launch;
  }

  hasNotes(): boolean {
    return this.launchNotes !== undefined;
  }

  openNotes(scope: NotesScope, addNote: boolean): void {
    this.launchNotes?.(scope, addNote);
  }
}
